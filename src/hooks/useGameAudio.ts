import { useCallback, useEffect, useRef } from 'react';
import type { FriendlyFireEvent } from '../lib/combat';
import { MACHINE_GUN_BURST_SECONDS } from '../lib/weapons';

interface RiverAudioGraph {
  context: AudioContext;
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

type NumericRange = readonly [number, number];

interface FriendlyRifleProfile {
  id: string;
  src: string;
  weight: number;
  volume: NumericRange;
  playbackRate: NumericRange;
  startOffsetSeconds: NumericRange;
  attackMs: NumericRange;
  holdMs: NumericRange;
  releaseMs: NumericRange;
}

const AUDIO_PATHS = {
  cannon: '/audio/sfx/tank_cannon_fire.wav',
  machineGun: '/audio/sfx/machine_gun_burst_01.wav',
  friendlySupportGun: '/audio/sfx/us-support-gun.wav',
  flamethrower: '/audio/sfx/flamethrower_continuous.wav',
  napalm: '/audio/sfx/napalm_strike.wav',
  engine: '/audio/sfx/old_tank_engine_continuous.wav',
  gearShift: '/audio/sfx/tank_gear_shift.wav',
  battlefield: '/audio/ambience/vietnam-jungle-battle.mp3',
  furyLayer: '/audio/ambience/fury-battle-layer.mp3',
  eagleCry: '/audio/bonus/eagle-cry.mp3',
  eagleApproach: '/audio/bonus/eagle-approach.mp3',
  eagleGuns: '/audio/bonus/eagle-guns.mp3',
} as const;

const AMBIENT_TIMING = {
  firstFuryMs: [18_000, 32_000],
  furyQuietGapMs: [55_000, 95_000],
  furyHoldMs: [11_000, 16_000],
  firstCombatMs: [9_000, 17_000],
  combatGapMs: [18_000, 36_000],
} as const;

const ENEMY_RIFLE_VOICE_COUNT = 3;
const ENEMY_RIFLE_MIN_GAP_MS = 115;
const FRIENDLY_RIFLE_MAX_VOICES = 2;
const FRIENDLY_BURST_WINDOW_MS = 280;
const FRIENDLY_RIFLE_GAP_MS = [420, 720] as const;
const FRIENDLY_SUPPORT_SOLDIER_ID = 'us-rifle-3';
const FRIENDLY_SUPPORT_COOLDOWN_MS = [8_000, 14_000] as const;
const FRIENDLY_SUPPORT_START_OFFSET_SECONDS = [0.2, 5.9] as const;
const FRIENDLY_SUPPORT_ATTACK_MS = [60, 100] as const;
const FRIENDLY_SUPPORT_HOLD_MS = [1_200, 2_200] as const;
const FRIENDLY_SUPPORT_RELEASE_MS = [180, 260] as const;
const FRIENDLY_SUPPORT_VOLUME = [0.34, 0.42] as const;
const FRIENDLY_SUPPORT_PLAYBACK_RATE = [0.9, 0.97] as const;
const FRIENDLY_SUPPORT_RIFLE_DUCK = 0.76;
const BATTLEFIELD_AMBIENCE_VOLUME = 0.14;
const BOSS_VOICE_DUCK_GAIN = 10 ** (-3 / 20);
const EAGLE_GUNS_VOLUME = 0.42;
const EAGLE_APPROACH_VOLUME = 0.3;
const EAGLE_CRY_VOLUME = 0.32;

/**
 * Near-field player-tank mix. Player weapons are mutually exclusive, so these
 * trims retain cannon impact while leaving peak headroom for the tank radio
 * and engine to play at the same time. Keep these values centralized for the
 * final in-game mix pass.
 */
export const TANK_AUDIO_MIX = {
  cannon: 0.68,
  napalm: 0.66,
  gearShift: 0.32,
  machineGun: 0.46,
  flamethrower: 0.42,
  engine: 0.2,
} as const;

/** Exact authored duration reported by the 48 kHz machine-gun WAV. */
export const TANK_MACHINE_GUN_CLIP_DURATION_SECONDS = MACHINE_GUN_BURST_SECONDS;

const FRIENDLY_RIFLE_PROFILES: readonly FriendlyRifleProfile[] = [
  {
    id: 'm16-pattern-04',
    src: '/audio/sfx/m16-rifle-pattern-04.wav',
    weight: 35,
    volume: [0.29, 0.36],
    playbackRate: [0.97, 1.03],
    startOffsetSeconds: [0, 0.012],
    attackMs: [8, 14],
    holdMs: [1_350, 1_430],
    releaseMs: [180, 220],
  },
  {
    id: 'm16-pattern-12',
    src: '/audio/sfx/m16-rifle-pattern-12.wav',
    weight: 30,
    volume: [0.29, 0.36],
    playbackRate: [0.97, 1.03],
    startOffsetSeconds: [0, 0.012],
    attackMs: [8, 14],
    holdMs: [1_570, 1_650],
    releaseMs: [180, 220],
  },
  {
    id: 'm16-pattern-03',
    src: '/audio/sfx/m16-rifle-pattern-03.wav',
    weight: 20,
    volume: [0.33, 0.4],
    playbackRate: [0.96, 1.04],
    startOffsetSeconds: [0, 0.012],
    attackMs: [8, 14],
    holdMs: [1_650, 1_740],
    releaseMs: [180, 230],
  },
  {
    id: 'm16-pattern-14',
    src: '/audio/sfx/m16-rifle-pattern-14.wav',
    weight: 15,
    volume: [0.34, 0.41],
    playbackRate: [0.97, 1.04],
    startOffsetSeconds: [0, 0.01],
    attackMs: [7, 12],
    holdMs: [490, 540],
    releaseMs: [110, 140],
  },
];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickWeightedProfile(
  profiles: readonly FriendlyRifleProfile[],
): FriendlyRifleProfile | null {
  const totalWeight = profiles.reduce((sum, profile) => sum + profile.weight, 0);
  if (totalWeight <= 0) return profiles[0] ?? null;

  let cursor = Math.random() * totalWeight;
  for (const profile of profiles) {
    cursor -= profile.weight;
    if (cursor <= 0) return profile;
  }
  return profiles[profiles.length - 1] ?? null;
}

function createAudio(src: string, volume: number, loop = false) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.volume = volume;
  audio.loop = loop;
  return audio;
}

export function useGameAudio() {
  const cannonRef = useRef<HTMLAudioElement | null>(null);
  const napalmPoolRef = useRef<HTMLAudioElement[]>([]);
  const gearShiftRef = useRef<HTMLAudioElement | null>(null);
  const enemyRiflePoolRef = useRef<HTMLAudioElement[]>([]);
  const enemyRifleFadeFramesRef = useRef(new Map<HTMLAudioElement, number>());
  const enemyRifleVoiceTokensRef = useRef(new Map<HTMLAudioElement, number>());
  const lastEnemyRifleAtRef = useRef(-Infinity);
  const friendlyRiflePoolRef = useRef<HTMLAudioElement[]>([]);
  const friendlyRifleProfileByAudioRef = useRef(
    new Map<HTMLAudioElement, FriendlyRifleProfile>(),
  );
  const friendlyRifleFadeFramesRef = useRef(new Map<HTMLAudioElement, number>());
  const friendlyRifleVoiceTokensRef = useRef(new Map<HTMLAudioElement, number>());
  const lastFriendlyShotBySoldierRef = useRef(new Map<string, number>());
  const nextFriendlyRifleAtRef = useRef(-Infinity);
  const lastFriendlyRifleProfileIdRef = useRef<string | null>(null);
  const friendlySupportGunRef = useRef<HTMLAudioElement | null>(null);
  const friendlySupportFadeFrameRef = useRef<number | null>(null);
  const friendlySupportVoiceTokenRef = useRef(0);
  const friendlySupportBlendRef = useRef(0);
  const nextFriendlySupportAtRef = useRef(-Infinity);
  const distantRifleRef = useRef<HTMLAudioElement | null>(null);
  const distantCannonRef = useRef<HTMLAudioElement | null>(null);
  const machineGunRef = useRef<HTMLAudioElement | null>(null);
  const flamethrowerRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<HTMLAudioElement | null>(null);
  const battlefieldRef = useRef<HTMLAudioElement | null>(null);
  const furyLayerRef = useRef<HTMLAudioElement | null>(null);
  const eagleCryRef = useRef<HTMLAudioElement | null>(null);
  const eagleApproachRef = useRef<HTMLAudioElement | null>(null);
  const eagleGunsRef = useRef<HTMLAudioElement | null>(null);
  const activeOneShotsRef = useRef(new Set<HTMLAudioElement>());
  const ambientOneShotsRef = useRef(new Set<HTMLAudioElement>());
  const ambientTimerIdsRef = useRef(new Set<number>());
  const napalmStartTimerIdsRef = useRef(new Set<number>());
  const furyFadeFrameRef = useRef<number | null>(null);
  const battlefieldFadeFrameRef = useRef<number | null>(null);
  const battlefieldDuckFadeFrameRef = useRef<number | null>(null);
  const battlefieldBaseVolumeRef = useRef(BATTLEFIELD_AMBIENCE_VOLUME);
  const battlefieldDuckGainRef = useRef(1);
  const eagleGunsFadeFrameRef = useRef<number | null>(null);
  const eagleApproachFadeFrameRef = useRef<number | null>(null);
  const eagleCryFadeFrameRef = useRef<number | null>(null);
  const machineGunActiveRef = useRef(false);
  const flamethrowerActiveRef = useRef(false);
  const movementActiveRef = useRef(false);
  const battlefieldActiveRef = useRef(false);
  const eagleGunsActiveRef = useRef(false);
  const riverAudioRef = useRef<RiverAudioGraph | null>(null);

  const releaseEnemyRifleVoice = useCallback((audio: HTMLAudioElement) => {
    enemyRifleVoiceTokensRef.current.set(
      audio,
      (enemyRifleVoiceTokensRef.current.get(audio) ?? 0) + 1,
    );
    const fadeFrame = enemyRifleFadeFramesRef.current.get(audio);
    if (fadeFrame !== undefined) window.cancelAnimationFrame(fadeFrame);
    enemyRifleFadeFramesRef.current.delete(audio);
    audio.pause();
    audio.volume = 0;
  }, []);

  const releaseFriendlyRifleVoice = useCallback((audio: HTMLAudioElement) => {
    friendlyRifleVoiceTokensRef.current.set(
      audio,
      (friendlyRifleVoiceTokensRef.current.get(audio) ?? 0) + 1,
    );
    const fadeFrame = friendlyRifleFadeFramesRef.current.get(audio);
    if (fadeFrame !== undefined) window.cancelAnimationFrame(fadeFrame);
    friendlyRifleFadeFramesRef.current.delete(audio);
    audio.onended = null;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
  }, []);

  const releaseFriendlySupportGun = useCallback(() => {
    friendlySupportVoiceTokenRef.current += 1;
    if (friendlySupportFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(friendlySupportFadeFrameRef.current);
      friendlySupportFadeFrameRef.current = null;
    }
    friendlySupportBlendRef.current = 0;
    const audio = friendlySupportGunRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
  }, []);

  useEffect(() => {
    cannonRef.current = createAudio(AUDIO_PATHS.cannon, TANK_AUDIO_MIX.cannon);
    napalmPoolRef.current = Array.from(
      { length: 2 },
      () => createAudio(AUDIO_PATHS.napalm, TANK_AUDIO_MIX.napalm),
    );
    gearShiftRef.current = createAudio(AUDIO_PATHS.gearShift, TANK_AUDIO_MIX.gearShift);
    enemyRiflePoolRef.current = Array.from(
      { length: ENEMY_RIFLE_VOICE_COUNT },
      () => createAudio(AUDIO_PATHS.machineGun, 0),
    );
    friendlyRifleProfileByAudioRef.current.clear();
    friendlyRiflePoolRef.current = FRIENDLY_RIFLE_PROFILES.map((profile) => {
      const audio = createAudio(profile.src, 0);
      friendlyRifleProfileByAudioRef.current.set(audio, profile);
      return audio;
    });
    friendlySupportGunRef.current = createAudio(AUDIO_PATHS.friendlySupportGun, 0);
    distantRifleRef.current = createAudio(AUDIO_PATHS.machineGun, 0.075);
    distantCannonRef.current = createAudio(AUDIO_PATHS.cannon, 0.085);
    const machineGun = createAudio(AUDIO_PATHS.machineGun, TANK_AUDIO_MIX.machineGun);
    machineGun.loop = false;
    machineGun.onended = () => {
      if (machineGunRef.current !== machineGun) return;
      machineGunActiveRef.current = false;
      machineGun.pause();
      machineGun.currentTime = 0;
    };
    machineGunRef.current = machineGun;
    flamethrowerRef.current = createAudio(
      AUDIO_PATHS.flamethrower,
      TANK_AUDIO_MIX.flamethrower,
      true,
    );
    engineRef.current = createAudio(AUDIO_PATHS.engine, TANK_AUDIO_MIX.engine, true);
    battlefieldRef.current = createAudio(
      AUDIO_PATHS.battlefield,
      BATTLEFIELD_AMBIENCE_VOLUME,
      true,
    );
    furyLayerRef.current = createAudio(AUDIO_PATHS.furyLayer, 0);
    eagleCryRef.current = createAudio(AUDIO_PATHS.eagleCry, EAGLE_CRY_VOLUME);
    eagleApproachRef.current = createAudio(AUDIO_PATHS.eagleApproach, EAGLE_APPROACH_VOLUME);
    eagleGunsRef.current = createAudio(AUDIO_PATHS.eagleGuns, 0, true);

    return () => {
      for (const timerId of ambientTimerIdsRef.current) window.clearTimeout(timerId);
      ambientTimerIdsRef.current.clear();
      for (const timerId of napalmStartTimerIdsRef.current) window.clearTimeout(timerId);
      napalmStartTimerIdsRef.current.clear();
      if (furyFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(furyFadeFrameRef.current);
        furyFadeFrameRef.current = null;
      }
      if (battlefieldFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(battlefieldFadeFrameRef.current);
        battlefieldFadeFrameRef.current = null;
      }
      if (battlefieldDuckFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(battlefieldDuckFadeFrameRef.current);
        battlefieldDuckFadeFrameRef.current = null;
      }
      if (eagleGunsFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(eagleGunsFadeFrameRef.current);
        eagleGunsFadeFrameRef.current = null;
      }
      if (eagleApproachFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(eagleApproachFadeFrameRef.current);
        eagleApproachFadeFrameRef.current = null;
      }
      if (eagleCryFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(eagleCryFadeFrameRef.current);
        eagleCryFadeFrameRef.current = null;
      }
      for (const audio of [
        cannonRef.current,
        ...napalmPoolRef.current,
        gearShiftRef.current,
        ...enemyRiflePoolRef.current,
        ...friendlyRiflePoolRef.current,
        friendlySupportGunRef.current,
        distantRifleRef.current,
        distantCannonRef.current,
        machineGunRef.current,
        flamethrowerRef.current,
        engineRef.current,
        battlefieldRef.current,
        furyLayerRef.current,
        eagleCryRef.current,
        eagleApproachRef.current,
        eagleGunsRef.current,
      ]) {
        audio?.pause();
      }
      if (machineGunRef.current) machineGunRef.current.onended = null;
      for (const audio of enemyRiflePoolRef.current) releaseEnemyRifleVoice(audio);
      enemyRiflePoolRef.current = [];
      for (const audio of friendlyRiflePoolRef.current) releaseFriendlyRifleVoice(audio);
      friendlyRiflePoolRef.current = [];
      friendlyRifleProfileByAudioRef.current.clear();
      releaseFriendlySupportGun();
      friendlySupportGunRef.current = null;
      for (const audio of activeOneShotsRef.current) audio.pause();
      activeOneShotsRef.current.clear();
      const riverAudio = riverAudioRef.current;
      riverAudioRef.current = null;
      if (riverAudio) {
        try {
          riverAudio.source.stop();
        } catch {
          // The source may already have stopped during WebView teardown.
        }
        void riverAudio.context.close().catch(() => {});
      }
    };
  }, [releaseEnemyRifleVoice, releaseFriendlyRifleVoice, releaseFriendlySupportGun]);

  const ensureRiverAudio = useCallback(() => {
    if (riverAudioRef.current) return riverAudioRef.current;
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    const context = new AudioContextClass();
    const frameCount = Math.max(1, Math.floor(context.sampleRate * 2.4));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let slowNoise = 0;
    for (let index = 0; index < frameCount; index += 1) {
      // Brown-ish noise reads as a muddy current and track churn after filtering,
      // without borrowing an unrelated weapon or engine sample.
      slowNoise = slowNoise * 0.985 + (Math.random() * 2 - 1) * 0.015;
      channel[index] = slowNoise * 3.4;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 540;
    filter.Q.value = 0.72;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start();

    const graph = { context, source, filter, gain };
    riverAudioRef.current = graph;
    return graph;
  }, []);

  const playOneShot = useCallback((
    template: HTMLAudioElement | null,
    options?: {
      playbackRate?: number;
      maxDurationMs?: number;
      volume?: number;
      ambient?: boolean;
    },
  ) => {
    if (!template) return;

    const audio = template.cloneNode(true) as HTMLAudioElement;
    audio.volume = options?.volume ?? template.volume;
    audio.playbackRate = options?.playbackRate ?? 1;
    activeOneShotsRef.current.add(audio);
    if (options?.ambient) ambientOneShotsRef.current.add(audio);
    let timeoutId: number | null = null;
    const release = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      activeOneShotsRef.current.delete(audio);
      ambientOneShotsRef.current.delete(audio);
      audio.removeEventListener('ended', release);
      audio.removeEventListener('error', release);
    };

    audio.addEventListener('ended', release);
    audio.addEventListener('error', release);
    if (options?.maxDurationMs) {
      timeoutId = window.setTimeout(() => {
        audio.pause();
        release();
      }, options.maxDurationMs);
    }
    void audio.play().catch(release);
  }, []);

  const startLoop = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio || !audio.paused) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, []);

  const stopLoop = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const fadeAudioTo = useCallback((
    audio: HTMLAudioElement | null,
    fadeFrameRef: { current: number | null },
    targetVolume: number,
    durationMs: number,
    onComplete?: () => void,
  ) => {
    if (!audio) return;
    if (fadeFrameRef.current !== null) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }

    const startVolume = audio.volume;
    const clampedTarget = Math.min(1, Math.max(0, targetVolume));
    if (Math.abs(startVolume - clampedTarget) < 0.001 || durationMs <= 0) {
      audio.volume = clampedTarget;
      onComplete?.();
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      audio.volume = startVolume + (clampedTarget - startVolume) * eased;
      if (progress < 1) {
        fadeFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        fadeFrameRef.current = null;
        onComplete?.();
      }
    };
    fadeFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const fadeFuryTo = useCallback((targetVolume: number, durationMs: number, onComplete?: () => void) => {
    const audio = furyLayerRef.current;
    if (!audio) return;

    if (furyFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(furyFadeFrameRef.current);
      furyFadeFrameRef.current = null;
    }

    const startVolume = audio.volume;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      audio.volume = Math.min(
        1,
        Math.max(0, startVolume + (targetVolume - startVolume) * eased),
      );

      if (progress < 1) {
        furyFadeFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        furyFadeFrameRef.current = null;
        onComplete?.();
      }
    };

    furyFadeFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const setNightmareRainMix = useCallback((targetVolume: number | null, durationMs: number) => {
    // null restores the normal Vietnam battlefield bed. The zombie ambience
    // hook drives this one existing rain loop instead of starting a duplicate
    // copy that could phase or double the background level.
    if (battlefieldFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(battlefieldFadeFrameRef.current);
      battlefieldFadeFrameRef.current = null;
    }

    const target = Math.min(
      1,
      Math.max(0, targetVolume ?? BATTLEFIELD_AMBIENCE_VOLUME),
    );
    const startVolume = battlefieldBaseVolumeRef.current;
    const applyMix = () => {
      const audio = battlefieldRef.current;
      if (audio) {
        audio.volume = Math.min(
          1,
          Math.max(0, battlefieldBaseVolumeRef.current * battlefieldDuckGainRef.current),
        );
      }
    };

    if (durationMs <= 0 || Math.abs(startVolume - target) < 0.001) {
      battlefieldBaseVolumeRef.current = target;
      applyMix();
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      battlefieldBaseVolumeRef.current = startVolume + (target - startVolume) * eased;
      applyMix();
      if (progress < 1) {
        battlefieldFadeFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        battlefieldFadeFrameRef.current = null;
      }
    };
    battlefieldFadeFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const setNightmareRainDuck = useCallback((ducked: boolean, durationMs: number) => {
    if (battlefieldDuckFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(battlefieldDuckFadeFrameRef.current);
      battlefieldDuckFadeFrameRef.current = null;
    }

    const target = ducked ? BOSS_VOICE_DUCK_GAIN : 1;
    const startGain = battlefieldDuckGainRef.current;
    const applyMix = () => {
      const audio = battlefieldRef.current;
      if (audio) {
        audio.volume = Math.min(
          1,
          Math.max(0, battlefieldBaseVolumeRef.current * battlefieldDuckGainRef.current),
        );
      }
    };

    if (durationMs <= 0 || Math.abs(startGain - target) < 0.001) {
      battlefieldDuckGainRef.current = target;
      applyMix();
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      battlefieldDuckGainRef.current = startGain + (target - startGain) * eased;
      applyMix();
      if (progress < 1) {
        battlefieldDuckFadeFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        battlefieldDuckFadeFrameRef.current = null;
      }
    };
    battlefieldDuckFadeFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const stopAmbientEvents = useCallback(() => {
    for (const timerId of ambientTimerIdsRef.current) window.clearTimeout(timerId);
    ambientTimerIdsRef.current.clear();
    if (furyFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(furyFadeFrameRef.current);
      furyFadeFrameRef.current = null;
    }

    const fury = furyLayerRef.current;
    if (fury) {
      fury.pause();
      fury.currentTime = 0;
      fury.volume = 0;
    }
    for (const audio of ambientOneShotsRef.current) {
      audio.pause();
      activeOneShotsRef.current.delete(audio);
    }
    ambientOneShotsRef.current.clear();
  }, []);

  const startAmbientEvents = useCallback(() => {
    const schedule = (callback: () => void, delayMs: number) => {
      const timerId = window.setTimeout(() => {
        ambientTimerIdsRef.current.delete(timerId);
        callback();
      }, delayMs);
      ambientTimerIdsRef.current.add(timerId);
    };

    const runFuryLayer = () => {
      if (!battlefieldActiveRef.current) return;
      const fury = furyLayerRef.current;
      const holdMs = randomBetween(...AMBIENT_TIMING.furyHoldMs);
      const fadeOutMs = 4_500;

      if (fury) {
        fury.pause();
        fury.volume = 0;
        fury.playbackRate = randomBetween(0.97, 1.02);
        if (Number.isFinite(fury.duration)) {
          const latestStart = Math.max(0, fury.duration - (holdMs + fadeOutMs) / 1000);
          fury.currentTime = randomBetween(0, latestStart);
        } else {
          fury.currentTime = 0;
        }

        void fury.play().catch(() => {});
        fadeFuryTo(randomBetween(0.095, 0.125), randomBetween(3_600, 4_800));
        schedule(() => {
          if (!battlefieldActiveRef.current) return;
          fadeFuryTo(0, fadeOutMs, () => {
            fury.pause();
            fury.volume = 0;
          });
        }, holdMs);
      }

      schedule(
        runFuryLayer,
        holdMs + fadeOutMs + randomBetween(...AMBIENT_TIMING.furyQuietGapMs),
      );
    };

    const runDistantCombat = () => {
      if (!battlefieldActiveRef.current) return;

      if (Math.random() < 0.7) {
        playOneShot(distantRifleRef.current, {
          ambient: true,
          volume: randomBetween(0.05, 0.085),
          playbackRate: randomBetween(0.92, 1.16),
          maxDurationMs: randomBetween(700, 1_350),
        });
      } else {
        playOneShot(distantCannonRef.current, {
          ambient: true,
          volume: randomBetween(0.055, 0.09),
          playbackRate: randomBetween(0.78, 0.94),
          maxDurationMs: randomBetween(1_800, 2_700),
        });
      }

      schedule(runDistantCombat, randomBetween(...AMBIENT_TIMING.combatGapMs));
    };

    schedule(runFuryLayer, randomBetween(...AMBIENT_TIMING.firstFuryMs));
    schedule(runDistantCombat, randomBetween(...AMBIENT_TIMING.firstCombatMs));
  }, [fadeFuryTo, playOneShot]);

  const ensureBattlefieldAmbience = useCallback(() => {
    if (battlefieldActiveRef.current) startLoop(battlefieldRef.current);
  }, [startLoop]);

  const playCannon = useCallback(() => {
    ensureBattlefieldAmbience();
    playOneShot(cannonRef.current);
  }, [ensureBattlefieldAmbience, playOneShot]);

  const playNapalmSequence = useCallback((onStarted?: () => void) => {
    ensureBattlefieldAmbience();
    const pool = napalmPoolRef.current;
    const audio = pool.find(candidate => candidate.paused)
      ?? pool.reduce((oldest, candidate) => (
        candidate.currentTime > oldest.currentTime ? candidate : oldest
      ), pool[0]);

    if (!audio) {
      onStarted?.();
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    let startReported = false;
    let fallbackTimerId: number | null = null;

    const reportStarted = () => {
      if (startReported) return;
      startReported = true;
      audio.removeEventListener('playing', reportStarted);
      if (fallbackTimerId !== null) {
        window.clearTimeout(fallbackTimerId);
        napalmStartTimerIdsRef.current.delete(fallbackTimerId);
        fallbackTimerId = null;
      }
      onStarted?.();
    };

    audio.addEventListener('playing', reportStarted);
    fallbackTimerId = window.setTimeout(() => {
      // Never allow a late WebView decode to put the explosive transient behind
      // the impact. A failed start degrades to a silent, correctly timed strike.
      audio.removeEventListener('playing', reportStarted);
      audio.pause();
      audio.currentTime = 0;
      reportStarted();
    }, 1_500);
    napalmStartTimerIdsRef.current.add(fallbackTimerId);

    void audio.play().then(reportStarted).catch(() => {
      audio.pause();
      audio.currentTime = 0;
      reportStarted();
    });
  }, [ensureBattlefieldAmbience]);

  const playEnemyRifle = useCallback(() => {
    ensureBattlefieldAmbience();
    const now = performance.now();
    if (now - lastEnemyRifleAtRef.current < ENEMY_RIFLE_MIN_GAP_MS) return;

    const audio = enemyRiflePoolRef.current.find(candidate => candidate.paused);
    if (!audio) return;
    lastEnemyRifleAtRef.current = now;

    const peakVolume = randomBetween(0.075, 0.105);
    // Span at least two typical 60 Hz frames so a random mid-waveform seek
    // never jumps straight from silence to full volume.
    const attackDurationMs = randomBetween(24, 32);
    const fadeDelayMs = randomBetween(110, 135);
    const fadeDurationMs = randomBetween(80, 100);
    const voiceToken = (enemyRifleVoiceTokensRef.current.get(audio) ?? 0) + 1;
    enemyRifleVoiceTokensRef.current.set(audio, voiceToken);
    audio.playbackRate = randomBetween(1.08, 1.28);
    audio.volume = 0;
    try {
      const maximumOffset = Number.isFinite(audio.duration)
        ? Math.max(0.12, Math.min(5.8, audio.duration - 0.35))
        : 1.4;
      audio.currentTime = randomBetween(0.08, maximumOffset);
    } catch {
      // A not-yet-decoded voice naturally starts at the beginning this time.
    }

    void audio.play().then(() => {
      if (enemyRifleVoiceTokensRef.current.get(audio) !== voiceToken) return;
      if (!battlefieldActiveRef.current || !enemyRiflePoolRef.current.includes(audio)) {
        releaseEnemyRifleVoice(audio);
        return;
      }
      const attackStartsAt = performance.now();
      const attackEndsAt = attackStartsAt + attackDurationMs;
      const fadeStartsAt = attackStartsAt + fadeDelayMs;
      const fadeEndsAt = fadeStartsAt + fadeDurationMs;
      const fade = (frameNow: number) => {
        if (enemyRifleVoiceTokensRef.current.get(audio) !== voiceToken) return;
        if (frameNow >= fadeEndsAt) {
          enemyRifleFadeFramesRef.current.delete(audio);
          audio.pause();
          audio.volume = 0;
          return;
        }
        if (frameNow < attackEndsAt) {
          const progress = Math.max(0, (frameNow - attackStartsAt) / attackDurationMs);
          audio.volume = peakVolume * Math.min(1, progress);
        } else if (frameNow < fadeStartsAt) {
          audio.volume = peakVolume;
        } else {
          const progress = (frameNow - fadeStartsAt) / fadeDurationMs;
          audio.volume = peakVolume * Math.pow(1 - progress, 2);
        }
        const frameId = window.requestAnimationFrame(fade);
        enemyRifleFadeFramesRef.current.set(audio, frameId);
      };
      const frameId = window.requestAnimationFrame(fade);
      enemyRifleFadeFramesRef.current.set(audio, frameId);
    }).catch(() => {
      if (enemyRifleVoiceTokensRef.current.get(audio) === voiceToken) {
        releaseEnemyRifleVoice(audio);
      }
    });
  }, [ensureBattlefieldAmbience, releaseEnemyRifleVoice]);

  const playFriendlySupportGun = useCallback(() => {
    const audio = friendlySupportGunRef.current;
    if (!audio || !audio.paused) return false;

    const peakVolume = randomBetween(...FRIENDLY_SUPPORT_VOLUME);
    const attackDurationMs = randomBetween(...FRIENDLY_SUPPORT_ATTACK_MS);
    const holdDurationMs = randomBetween(...FRIENDLY_SUPPORT_HOLD_MS);
    const releaseDurationMs = randomBetween(...FRIENDLY_SUPPORT_RELEASE_MS);
    const voiceToken = friendlySupportVoiceTokenRef.current + 1;
    friendlySupportVoiceTokenRef.current = voiceToken;
    friendlySupportBlendRef.current = 0;
    audio.playbackRate = randomBetween(...FRIENDLY_SUPPORT_PLAYBACK_RATE);
    audio.volume = 0;
    audio.currentTime = randomBetween(...FRIENDLY_SUPPORT_START_OFFSET_SECONDS);
    audio.onended = () => {
      if (friendlySupportVoiceTokenRef.current === voiceToken) {
        releaseFriendlySupportGun();
      }
    };

    void audio.play().then(() => {
      if (friendlySupportVoiceTokenRef.current !== voiceToken) return;
      if (!battlefieldActiveRef.current || friendlySupportGunRef.current !== audio) {
        releaseFriendlySupportGun();
        return;
      }

      const attackStartsAt = performance.now();
      const attackEndsAt = attackStartsAt + attackDurationMs;
      const fadeStartsAt = attackEndsAt + holdDurationMs;
      const fadeEndsAt = fadeStartsAt + releaseDurationMs;
      const fade = (frameNow: number) => {
        if (friendlySupportVoiceTokenRef.current !== voiceToken) return;
        if (frameNow >= fadeEndsAt) {
          releaseFriendlySupportGun();
          return;
        }

        let envelope = 1;
        if (frameNow < attackEndsAt) {
          envelope = Math.min(1, Math.max(0, (frameNow - attackStartsAt) / attackDurationMs));
        } else if (frameNow >= fadeStartsAt) {
          const progress = (frameNow - fadeStartsAt) / releaseDurationMs;
          envelope = Math.pow(1 - progress, 2);
        }
        friendlySupportBlendRef.current = envelope;
        audio.volume = peakVolume * envelope;
        friendlySupportFadeFrameRef.current = window.requestAnimationFrame(fade);
      };
      friendlySupportFadeFrameRef.current = window.requestAnimationFrame(fade);
    }).catch(() => {
      if (friendlySupportVoiceTokenRef.current === voiceToken) {
        releaseFriendlySupportGun();
      }
    });

    return true;
  }, [releaseFriendlySupportGun]);

  const playFriendlyRifle = useCallback((event: FriendlyFireEvent) => {
    ensureBattlefieldAmbience();
    const now = performance.now();
    const lastSoldierShotAt = lastFriendlyShotBySoldierRef.current.get(event.soldierId)
      ?? -Infinity;
    lastFriendlyShotBySoldierRef.current.set(event.soldierId, now);

    // The scene reports every projectile in a two- or three-round visual burst.
    // Sound only the first projectile so authored bursts are not stacked on top
    // of themselves, then let cadence and caliber vary at the squad level.
    if (now - lastSoldierShotAt < FRIENDLY_BURST_WINDOW_MS) return;

    if (
      event.soldierId === FRIENDLY_SUPPORT_SOLDIER_ID
      && now >= nextFriendlySupportAtRef.current
      && playFriendlySupportGun()
    ) {
      nextFriendlySupportAtRef.current = now + randomBetween(...FRIENDLY_SUPPORT_COOLDOWN_MS);
      return;
    }

    if (now < nextFriendlyRifleAtRef.current) return;
    const activeVoiceCount = friendlyRiflePoolRef.current.reduce(
      (count, audio) => count + (audio.paused ? 0 : 1),
      0,
    );
    if (activeVoiceCount >= FRIENDLY_RIFLE_MAX_VOICES) return;

    const availableVoices = friendlyRiflePoolRef.current.filter(audio => audio.paused);
    const availableProfiles = availableVoices
      .map(audio => friendlyRifleProfileByAudioRef.current.get(audio))
      .filter((profile): profile is FriendlyRifleProfile => profile !== undefined);
    const noRepeatProfiles = availableProfiles.filter(
      profile => profile.id !== lastFriendlyRifleProfileIdRef.current,
    );
    const profile = pickWeightedProfile(
      noRepeatProfiles.length > 0 ? noRepeatProfiles : availableProfiles,
    );
    if (!profile) return;
    const audio = availableVoices.find(
      candidate => friendlyRifleProfileByAudioRef.current.get(candidate) === profile,
    );
    if (!audio) return;

    nextFriendlyRifleAtRef.current = now + randomBetween(...FRIENDLY_RIFLE_GAP_MS);
    lastFriendlyRifleProfileIdRef.current = profile.id;
    const peakVolume = randomBetween(...profile.volume);
    const attackDurationMs = randomBetween(...profile.attackMs);
    const holdDurationMs = randomBetween(...profile.holdMs);
    const releaseDurationMs = randomBetween(...profile.releaseMs);
    const voiceToken = (friendlyRifleVoiceTokensRef.current.get(audio) ?? 0) + 1;
    friendlyRifleVoiceTokensRef.current.set(audio, voiceToken);
    audio.playbackRate = randomBetween(...profile.playbackRate);
    audio.volume = 0;
    audio.currentTime = randomBetween(...profile.startOffsetSeconds);
    audio.onended = () => {
      if (friendlyRifleVoiceTokensRef.current.get(audio) === voiceToken) {
        releaseFriendlyRifleVoice(audio);
      }
    };

    void audio.play().then(() => {
      if (friendlyRifleVoiceTokensRef.current.get(audio) !== voiceToken) return;
      if (!battlefieldActiveRef.current || !friendlyRiflePoolRef.current.includes(audio)) {
        releaseFriendlyRifleVoice(audio);
        return;
      }
      const attackStartsAt = performance.now();
      const attackEndsAt = attackStartsAt + attackDurationMs;
      const fadeStartsAt = attackEndsAt + holdDurationMs;
      const fadeEndsAt = fadeStartsAt + releaseDurationMs;
      const fade = (frameNow: number) => {
        if (friendlyRifleVoiceTokensRef.current.get(audio) !== voiceToken) return;
        if (frameNow >= fadeEndsAt) {
          releaseFriendlyRifleVoice(audio);
          return;
        }

        let envelope = 1;
        if (frameNow < attackEndsAt) {
          envelope = Math.min(1, Math.max(0, (frameNow - attackStartsAt) / attackDurationMs));
        } else if (frameNow >= fadeStartsAt) {
          const progress = (frameNow - fadeStartsAt) / releaseDurationMs;
          envelope = Math.pow(1 - progress, 2);
        }
        const supportDuck = 1 - (
          (1 - FRIENDLY_SUPPORT_RIFLE_DUCK) * friendlySupportBlendRef.current
        );
        audio.volume = peakVolume * envelope * supportDuck;
        const frameId = window.requestAnimationFrame(fade);
        friendlyRifleFadeFramesRef.current.set(audio, frameId);
      };
      const frameId = window.requestAnimationFrame(fade);
      friendlyRifleFadeFramesRef.current.set(audio, frameId);
    }).catch(() => {
      if (friendlyRifleVoiceTokensRef.current.get(audio) === voiceToken) {
        releaseFriendlyRifleVoice(audio);
      }
    });
  }, [
    ensureBattlefieldAmbience,
    playFriendlySupportGun,
    releaseFriendlyRifleVoice,
  ]);

  const setMachineGunActive = useCallback((active: boolean) => {
    if (active) ensureBattlefieldAmbience();
    if (machineGunActiveRef.current === active) return;
    machineGunActiveRef.current = active;
    const audio = machineGunRef.current;

    if (!active) {
      stopLoop(audio);
      return;
    }

    if (!audio) {
      machineGunActiveRef.current = false;
      return;
    }

    // One trigger hold owns one authored burst. Never loop, seek, or restart it
    // until the tank reports a release/overheat followed by a new press.
    audio.pause();
    audio.loop = false;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      if (machineGunRef.current !== audio || !machineGunActiveRef.current) return;
      machineGunActiveRef.current = false;
      audio.pause();
      audio.currentTime = 0;
    });
  }, [ensureBattlefieldAmbience, stopLoop]);

  const setFlamethrowerActive = useCallback((active: boolean) => {
    if (active) ensureBattlefieldAmbience();
    if (flamethrowerActiveRef.current === active) return;
    flamethrowerActiveRef.current = active;
    if (active) startLoop(flamethrowerRef.current);
    else stopLoop(flamethrowerRef.current);
  }, [ensureBattlefieldAmbience, startLoop, stopLoop]);

  const setMovementActive = useCallback((active: boolean) => {
    if (active) ensureBattlefieldAmbience();
    if (movementActiveRef.current === active) return;
    movementActiveRef.current = active;
    if (active) {
      playOneShot(gearShiftRef.current);
      startLoop(engineRef.current);
    } else {
      stopLoop(engineRef.current);
    }
  }, [ensureBattlefieldAmbience, playOneShot, startLoop, stopLoop]);

  const setRiverState = useCallback((proximity: number, movingInWater: boolean) => {
    const clampedProximity = Math.min(1, Math.max(0, proximity));
    const existing = riverAudioRef.current;
    if (clampedProximity <= 0.01 && !movingInWater && !existing) return;

    const graph = existing ?? ensureRiverAudio();
    if (!graph) return;
    if (graph.context.state === 'suspended') void graph.context.resume().catch(() => {});

    const now = graph.context.currentTime;
    const ambientGain = clampedProximity * 0.026;
    const churnGain = movingInWater ? 0.052 : 0;
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setTargetAtTime(ambientGain + churnGain, now, movingInWater ? 0.08 : 0.34);
    graph.filter.frequency.cancelScheduledValues(now);
    graph.filter.frequency.setTargetAtTime(movingInWater ? 1_180 : 520, now, 0.16);
    graph.filter.Q.cancelScheduledValues(now);
    graph.filter.Q.setTargetAtTime(movingInWater ? 1.15 : 0.7, now, 0.2);
  }, [ensureRiverAudio]);

  const playEagleApproach = useCallback(() => {
    if (!battlefieldActiveRef.current) return;
    ensureBattlefieldAmbience();
    const voices = [
      {
        audio: eagleApproachRef.current,
        fadeFrame: eagleApproachFadeFrameRef,
        volume: EAGLE_APPROACH_VOLUME,
      },
      {
        audio: eagleCryRef.current,
        fadeFrame: eagleCryFadeFrameRef,
        volume: EAGLE_CRY_VOLUME,
      },
    ];
    for (const { audio, fadeFrame, volume } of voices) {
      if (!audio) continue;
      if (fadeFrame.current !== null) {
        window.cancelAnimationFrame(fadeFrame.current);
        fadeFrame.current = null;
      }
      audio.pause();
      audio.currentTime = 0;
      audio.volume = volume;
      void audio.play().catch(() => {});
    }
  }, [ensureBattlefieldAmbience]);

  const setEagleGunsActive = useCallback((active: boolean) => {
    if (active && !battlefieldActiveRef.current) return;
    const audio = eagleGunsRef.current;

    if (active) {
      if (eagleGunsActiveRef.current) return;
      eagleGunsActiveRef.current = true;
      if (!audio) return;
      ensureBattlefieldAmbience();
      audio.volume = 0;
      startLoop(audio);
      fadeAudioTo(audio, eagleGunsFadeFrameRef, EAGLE_GUNS_VOLUME, 90);
    } else {
      const gunsWereActive = eagleGunsActiveRef.current;
      eagleGunsActiveRef.current = false;
      if (audio && (gunsWereActive || !audio.paused)) {
        fadeAudioTo(audio, eagleGunsFadeFrameRef, 0, 150, () => {
          if (!eagleGunsActiveRef.current) stopLoop(audio);
        });
      }

      const supportVoices = [
        {
          voice: eagleApproachRef.current,
          fadeFrame: eagleApproachFadeFrameRef,
          restoreVolume: EAGLE_APPROACH_VOLUME,
        },
        {
          voice: eagleCryRef.current,
          fadeFrame: eagleCryFadeFrameRef,
          restoreVolume: EAGLE_CRY_VOLUME,
        },
      ];
      for (const { voice, fadeFrame, restoreVolume } of supportVoices) {
        if (!voice) continue;
        if (voice.paused) {
          voice.volume = restoreVolume;
          continue;
        }
        fadeAudioTo(voice, fadeFrame, 0, 400, () => {
          voice.pause();
          voice.currentTime = 0;
          voice.volume = restoreVolume;
        });
      }
    }
  }, [ensureBattlefieldAmbience, fadeAudioTo, startLoop, stopLoop]);

  const setBattlefieldActive = useCallback((active: boolean) => {
    if (battlefieldActiveRef.current === active) {
      if (active) startLoop(battlefieldRef.current);
      return;
    }

    battlefieldActiveRef.current = active;
    if (active) {
      startLoop(battlefieldRef.current);
      startAmbientEvents();
    } else {
      if (battlefieldFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(battlefieldFadeFrameRef.current);
        battlefieldFadeFrameRef.current = null;
      }
      if (battlefieldDuckFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(battlefieldDuckFadeFrameRef.current);
        battlefieldDuckFadeFrameRef.current = null;
      }
      stopLoop(battlefieldRef.current);
      battlefieldBaseVolumeRef.current = BATTLEFIELD_AMBIENCE_VOLUME;
      battlefieldDuckGainRef.current = 1;
      if (battlefieldRef.current) {
        battlefieldRef.current.volume = BATTLEFIELD_AMBIENCE_VOLUME;
      }
      stopAmbientEvents();
      setEagleGunsActive(false);
    }
  }, [setEagleGunsActive, startAmbientEvents, startLoop, stopAmbientEvents, stopLoop]);

  const stopAllLoops = useCallback(() => {
    machineGunActiveRef.current = false;
    flamethrowerActiveRef.current = false;
    movementActiveRef.current = false;
    battlefieldActiveRef.current = false;
    eagleGunsActiveRef.current = false;
    if (battlefieldFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(battlefieldFadeFrameRef.current);
      battlefieldFadeFrameRef.current = null;
    }
    if (battlefieldDuckFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(battlefieldDuckFadeFrameRef.current);
      battlefieldDuckFadeFrameRef.current = null;
    }
    if (eagleGunsFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(eagleGunsFadeFrameRef.current);
      eagleGunsFadeFrameRef.current = null;
    }
    if (eagleApproachFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(eagleApproachFadeFrameRef.current);
      eagleApproachFadeFrameRef.current = null;
    }
    if (eagleCryFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(eagleCryFadeFrameRef.current);
      eagleCryFadeFrameRef.current = null;
    }
    stopLoop(machineGunRef.current);
    stopLoop(flamethrowerRef.current);
    stopLoop(engineRef.current);
    stopLoop(battlefieldRef.current);
    battlefieldBaseVolumeRef.current = BATTLEFIELD_AMBIENCE_VOLUME;
    battlefieldDuckGainRef.current = 1;
    if (battlefieldRef.current) {
      battlefieldRef.current.volume = BATTLEFIELD_AMBIENCE_VOLUME;
    }
    stopLoop(eagleApproachRef.current);
    stopLoop(eagleCryRef.current);
    stopLoop(eagleGunsRef.current);
    if (eagleApproachRef.current) eagleApproachRef.current.volume = EAGLE_APPROACH_VOLUME;
    if (eagleCryRef.current) eagleCryRef.current.volume = EAGLE_CRY_VOLUME;
    lastEnemyRifleAtRef.current = -Infinity;
    nextFriendlyRifleAtRef.current = -Infinity;
    nextFriendlySupportAtRef.current = -Infinity;
    lastFriendlyRifleProfileIdRef.current = null;
    lastFriendlyShotBySoldierRef.current.clear();
    for (const audio of enemyRiflePoolRef.current) releaseEnemyRifleVoice(audio);
    for (const audio of friendlyRiflePoolRef.current) releaseFriendlyRifleVoice(audio);
    releaseFriendlySupportGun();
    for (const timerId of napalmStartTimerIdsRef.current) window.clearTimeout(timerId);
    napalmStartTimerIdsRef.current.clear();
    for (const audio of napalmPoolRef.current) stopLoop(audio);
    const riverAudio = riverAudioRef.current;
    if (riverAudio) {
      const now = riverAudio.context.currentTime;
      riverAudio.gain.gain.cancelScheduledValues(now);
      riverAudio.gain.gain.setTargetAtTime(0, now, 0.08);
    }
    stopAmbientEvents();
  }, [
    releaseEnemyRifleVoice,
    releaseFriendlyRifleVoice,
    releaseFriendlySupportGun,
    stopAmbientEvents,
    stopLoop,
  ]);

  return {
    playCannon,
    playNapalmSequence,
    playEnemyRifle,
    playFriendlyRifle,
    setMachineGunActive,
    setFlamethrowerActive,
    setMovementActive,
    setRiverState,
    setBattlefieldActive,
    setNightmareRainMix,
    setNightmareRainDuck,
    playEagleApproach,
    setEagleGunsActive,
    stopAllLoops,
    machineGunClipDurationSeconds: TANK_MACHINE_GUN_CLIP_DURATION_SECONDS,
  };
}
