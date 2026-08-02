import { useCallback, useEffect, useRef } from 'react';

const AUDIO_PATHS = {
  cannon: '/audio/sfx/tank_cannon_fire.wav',
  machineGun: '/audio/sfx/machine_gun_burst_01.wav',
  flamethrower: '/audio/sfx/flamethrower_continuous.wav',
  napalm: '/audio/sfx/napalm_strike.wav',
  engine: '/audio/sfx/old_tank_engine_continuous.wav',
  gearShift: '/audio/sfx/tank_gear_shift.wav',
  battlefield: '/audio/ambience/vietnam-jungle-battle.mp3',
  furyLayer: '/audio/ambience/fury-battle-layer.mp3',
} as const;

const AMBIENT_TIMING = {
  firstFuryMs: [18_000, 32_000],
  furyQuietGapMs: [55_000, 95_000],
  furyHoldMs: [11_000, 16_000],
  firstCombatMs: [9_000, 17_000],
  combatGapMs: [18_000, 36_000],
} as const;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
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
  const enemyRifleRef = useRef<HTMLAudioElement | null>(null);
  const distantRifleRef = useRef<HTMLAudioElement | null>(null);
  const distantCannonRef = useRef<HTMLAudioElement | null>(null);
  const machineGunRef = useRef<HTMLAudioElement | null>(null);
  const flamethrowerRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<HTMLAudioElement | null>(null);
  const battlefieldRef = useRef<HTMLAudioElement | null>(null);
  const furyLayerRef = useRef<HTMLAudioElement | null>(null);
  const activeOneShotsRef = useRef(new Set<HTMLAudioElement>());
  const ambientOneShotsRef = useRef(new Set<HTMLAudioElement>());
  const ambientTimerIdsRef = useRef(new Set<number>());
  const napalmStartTimerIdsRef = useRef(new Set<number>());
  const furyFadeFrameRef = useRef<number | null>(null);
  const machineGunActiveRef = useRef(false);
  const flamethrowerActiveRef = useRef(false);
  const movementActiveRef = useRef(false);
  const battlefieldActiveRef = useRef(false);

  useEffect(() => {
    cannonRef.current = createAudio(AUDIO_PATHS.cannon, 0.78);
    napalmPoolRef.current = Array.from({ length: 2 }, () => createAudio(AUDIO_PATHS.napalm, 0.74));
    gearShiftRef.current = createAudio(AUDIO_PATHS.gearShift, 0.4);
    enemyRifleRef.current = createAudio(AUDIO_PATHS.machineGun, 0.2);
    distantRifleRef.current = createAudio(AUDIO_PATHS.machineGun, 0.075);
    distantCannonRef.current = createAudio(AUDIO_PATHS.cannon, 0.085);
    machineGunRef.current = createAudio(AUDIO_PATHS.machineGun, 0.56, true);
    flamethrowerRef.current = createAudio(AUDIO_PATHS.flamethrower, 0.5, true);
    engineRef.current = createAudio(AUDIO_PATHS.engine, 0.26, true);
    battlefieldRef.current = createAudio(AUDIO_PATHS.battlefield, 0.14, true);
    furyLayerRef.current = createAudio(AUDIO_PATHS.furyLayer, 0);

    return () => {
      for (const timerId of ambientTimerIdsRef.current) window.clearTimeout(timerId);
      ambientTimerIdsRef.current.clear();
      for (const timerId of napalmStartTimerIdsRef.current) window.clearTimeout(timerId);
      napalmStartTimerIdsRef.current.clear();
      if (furyFadeFrameRef.current !== null) {
        window.cancelAnimationFrame(furyFadeFrameRef.current);
        furyFadeFrameRef.current = null;
      }
      for (const audio of [
        cannonRef.current,
        ...napalmPoolRef.current,
        gearShiftRef.current,
        enemyRifleRef.current,
        distantRifleRef.current,
        distantCannonRef.current,
        machineGunRef.current,
        flamethrowerRef.current,
        engineRef.current,
        battlefieldRef.current,
        furyLayerRef.current,
      ]) {
        audio?.pause();
      }
      for (const audio of activeOneShotsRef.current) audio.pause();
      activeOneShotsRef.current.clear();
    };
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
    playOneShot(enemyRifleRef.current, { playbackRate: 1.3, maxDurationMs: 260 });
  }, [ensureBattlefieldAmbience, playOneShot]);

  const setMachineGunActive = useCallback((active: boolean) => {
    if (active) ensureBattlefieldAmbience();
    if (machineGunActiveRef.current === active) return;
    machineGunActiveRef.current = active;
    if (active) startLoop(machineGunRef.current);
    else stopLoop(machineGunRef.current);
  }, [ensureBattlefieldAmbience, startLoop, stopLoop]);

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
      stopLoop(battlefieldRef.current);
      stopAmbientEvents();
    }
  }, [startAmbientEvents, startLoop, stopAmbientEvents, stopLoop]);

  const stopAllLoops = useCallback(() => {
    machineGunActiveRef.current = false;
    flamethrowerActiveRef.current = false;
    movementActiveRef.current = false;
    battlefieldActiveRef.current = false;
    stopLoop(machineGunRef.current);
    stopLoop(flamethrowerRef.current);
    stopLoop(engineRef.current);
    stopLoop(battlefieldRef.current);
    for (const timerId of napalmStartTimerIdsRef.current) window.clearTimeout(timerId);
    napalmStartTimerIdsRef.current.clear();
    for (const audio of napalmPoolRef.current) stopLoop(audio);
    stopAmbientEvents();
  }, [stopAmbientEvents, stopLoop]);

  return {
    playCannon,
    playNapalmSequence,
    playEnemyRifle,
    setMachineGunActive,
    setFlamethrowerActive,
    setMovementActive,
    setBattlefieldActive,
    stopAllLoops,
  };
}
