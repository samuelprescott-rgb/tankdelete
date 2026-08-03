import { useCallback, useEffect, useRef } from 'react';

type BossVoiceClipId =
  | 'coconut-full'
  | 'coconut-stinger'
  | 'laugh-full'
  | 'laugh-stinger-01'
  | 'laugh-stinger-02';

type BossVoicePriority = 0 | 1 | 2 | 3;

interface BossVoiceClip {
  id: BossVoiceClipId;
  url: string;
  priority: BossVoicePriority;
}

interface BossVoiceRequest {
  clip: BossVoiceClip;
}

interface ActiveBossVoice {
  clip: BossVoiceClip;
  token: number;
}

interface UseBossVoiceOptions {
  setMusicDuck: (ducked: boolean, durationMs: number) => void;
  setZombieAmbienceDuck: (ducked: boolean, durationMs: number) => void;
}

export const BOSS_VOICE_BUS_VOLUME = 0.6;
export const BOSS_VOICE_DUCK_DB = -3;

const BOSS_VOICE_DUCK_ATTACK_MS = 150;
const BOSS_VOICE_DUCK_RELEASE_MS = 650;
const BOSS_VOICE_INTERRUPT_FADE_MS = 200;
const BOSS_VOICE_EXIT_FADE_MS = 650;
// The existing boss screech finishes shortly after the takeover. Staying near
// the upper end of the requested 1-3 second window keeps both cues intelligible.
const BOSS_INTRO_DELAY_MS = [2_200, 3_000] as const;
const RANDOM_LAUGH_COOLDOWN_MS = [15_000, 30_000] as const;
const MAJOR_ATTACK_COOLDOWN_MS = [12_000, 18_000] as const;
const MAJOR_ATTACK_RETRY_MS = [3_500, 5_500] as const;
const MAJOR_ATTACK_STINGER_CHANCE = 0.28;

const BOSS_VOICE_CLIPS: Record<BossVoiceClipId, BossVoiceClip> = {
  'coconut-full': {
    id: 'coconut-full',
    url: '/audio/boss_voice/boss_coconut_whisper_full_lr.wav',
    priority: 2,
  },
  'coconut-stinger': {
    id: 'coconut-stinger',
    url: '/audio/boss_voice/boss_coconut_tree_whisper_stinger_lr.wav',
    priority: 1,
  },
  'laugh-full': {
    id: 'laugh-full',
    url: '/audio/boss_voice/boss_laugh_whisper_full_lr.wav',
    priority: 3,
  },
  'laugh-stinger-01': {
    id: 'laugh-stinger-01',
    url: '/audio/boss_voice/boss_laugh_whisper_stinger_01_lr.wav',
    priority: 0,
  },
  'laugh-stinger-02': {
    id: 'laugh-stinger-02',
    url: '/audio/boss_voice/boss_laugh_whisper_stinger_02_lr.wav',
    priority: 0,
  },
};

const RANDOM_LAUGH_CLIPS = [
  BOSS_VOICE_CLIPS['laugh-stinger-01'],
  BOSS_VOICE_CLIPS['laugh-stinger-02'],
] as const;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Owns the final-wave BossVoice channel. Playback intentionally stays on one
 * non-spatial HTMLAudioElement: the source WAVs already contain their stereo
 * movement and effects, so this layer only applies a single bus gain and fades.
 */
export function useBossVoice({
  setMusicDuck,
  setZombieAmbienceDuck,
}: UseBossVoiceOptions) {
  const preparedRef = useRef(false);
  const enabledRef = useRef(false);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const preloadCacheRef = useRef(new Map<BossVoiceClipId, HTMLAudioElement>());
  const activeRef = useRef<ActiveBossVoice | null>(null);
  const queuedImportantRef = useRef<BossVoiceRequest | null>(null);
  const timerIdsRef = useRef(new Set<number>());
  const fadeFrameRef = useRef<number | null>(null);
  const lifecycleTokenRef = useRef(0);
  const playbackTokenRef = useRef(0);
  const interruptInProgressRef = useRef(false);
  const backgroundDuckedRef = useRef(false);
  const lastPlayedClipRef = useRef<BossVoiceClipId | null>(null);
  const lastRandomLaughRef = useRef<BossVoiceClipId | null>(null);
  const introStartedRef = useRef(false);
  const introCompleteRef = useRef(false);
  const enragedPlayedRef = useRef(false);
  const enragedPendingRef = useRef(false);
  const nextMajorAttackCueAtRef = useRef(-Infinity);
  const startCueRef = useRef<(request: BossVoiceRequest) => boolean>(() => false);
  const requestCueRef = useRef<(request: BossVoiceRequest) => boolean>(() => false);
  const scheduleRandomLaughRef = useRef<(lifecycleToken: number) => void>(() => {});

  const clearTimers = useCallback(() => {
    for (const timerId of timerIdsRef.current) window.clearTimeout(timerId);
    timerIdsRef.current.clear();
  }, []);

  const cancelFade = useCallback(() => {
    if (fadeFrameRef.current === null) return;
    window.cancelAnimationFrame(fadeFrameRef.current);
    fadeFrameRef.current = null;
  }, []);

  const setBackgroundDucked = useCallback((ducked: boolean, durationMs: number) => {
    if (backgroundDuckedRef.current === ducked) return;
    backgroundDuckedRef.current = ducked;
    setMusicDuck(ducked, durationMs);
    setZombieAmbienceDuck(ducked, durationMs);
  }, [setMusicDuck, setZombieAmbienceDuck]);

  const prepare = useCallback(() => {
    if (preparedRef.current) return true;

    const playback = new Audio();
    playback.preload = 'auto';
    playback.loop = false;
    playback.playbackRate = 1;
    playback.volume = BOSS_VOICE_BUS_VOLUME;
    playbackRef.current = playback;

    for (const clip of Object.values(BOSS_VOICE_CLIPS)) {
      const preload = new Audio(clip.url);
      preload.preload = 'auto';
      preload.loop = false;
      preload.muted = true;
      preload.volume = 0;
      preload.load();
      preloadCacheRef.current.set(clip.id, preload);
    }
    preparedRef.current = true;
    return true;
  }, []);

  const cleanPlaybackElement = useCallback((audio: HTMLAudioElement) => {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    // A freshly-created media element has no resource yet. Some WebViews throw
    // when seeking that empty element, while an already-loaded cue can reset
    // normally. Playback still receives its source immediately after cleanup.
    if (audio.getAttribute('src')) audio.currentTime = 0;
    audio.volume = BOSS_VOICE_BUS_VOLUME;
    audio.playbackRate = 1;
  }, []);

  const finishActiveCue = useCallback((token: number, completed: boolean) => {
    const active = activeRef.current;
    const audio = playbackRef.current;
    if (!active || active.token !== token || !audio) return;
    const finishedClipId = active.clip.id;

    cancelFade();
    cleanPlaybackElement(audio);
    activeRef.current = null;
    interruptInProgressRef.current = false;

    // The entrance line owns the opening voice window. Combat and phase cues
    // are held until it releases the single BossVoice channel so the required
    // 1-3 second entrance cue cannot be displaced by an unusually early hit.
    if (finishedClipId === 'coconut-full') {
      introStartedRef.current ||= completed;
      introCompleteRef.current = true;
      if (enragedPendingRef.current && enabledRef.current) {
        enragedPendingRef.current = false;
        enragedPlayedRef.current = true;
        if (startCueRef.current({ clip: BOSS_VOICE_CLIPS['laugh-full'] })) return;
      }
    }

    const queued = enabledRef.current ? queuedImportantRef.current : null;
    queuedImportantRef.current = null;
    if (queued && startCueRef.current(queued)) return;
    setBackgroundDucked(false, BOSS_VOICE_DUCK_RELEASE_MS);
  }, [cancelFade, cleanPlaybackElement, setBackgroundDucked]);

  const startCue = useCallback((request: BossVoiceRequest) => {
    if (!enabledRef.current || !preparedRef.current || activeRef.current) return false;
    if (lastPlayedClipRef.current === request.clip.id) return false;

    const audio = playbackRef.current;
    if (!audio) return false;
    cancelFade();
    cleanPlaybackElement(audio);
    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    activeRef.current = { clip: request.clip, token };
    audio.src = request.clip.url;
    audio.load();
    audio.volume = BOSS_VOICE_BUS_VOLUME;
    audio.playbackRate = 1;
    audio.onended = () => finishActiveCue(token, true);
    audio.onerror = () => finishActiveCue(token, false);

    void audio.play().then(() => {
      if (activeRef.current?.token !== token || !enabledRef.current) return;
      lastPlayedClipRef.current = request.clip.id;
      if (request.clip.id === 'coconut-full') introStartedRef.current = true;
      setBackgroundDucked(true, BOSS_VOICE_DUCK_ATTACK_MS);
    }).catch(() => finishActiveCue(token, false));
    return true;
  }, [cancelFade, cleanPlaybackElement, finishActiveCue, setBackgroundDucked]);
  startCueRef.current = startCue;

  const fadeActiveCue = useCallback((
    durationMs: number,
    keepBackgroundDucked: boolean,
    onComplete?: () => void,
  ) => {
    const active = activeRef.current;
    const audio = playbackRef.current;
    if (!active || !audio) {
      if (!keepBackgroundDucked) {
        setBackgroundDucked(false, BOSS_VOICE_DUCK_RELEASE_MS);
      }
      onComplete?.();
      return;
    }

    cancelFade();
    audio.onended = null;
    audio.onerror = null;
    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    activeRef.current = { ...active, token };
    const startVolume = audio.volume;
    const startedAt = performance.now();

    const finish = () => {
      if (activeRef.current?.token !== token) return;
      cleanPlaybackElement(audio);
      activeRef.current = null;
      fadeFrameRef.current = null;
      if (!keepBackgroundDucked) {
        setBackgroundDucked(false, BOSS_VOICE_DUCK_RELEASE_MS);
      }
      onComplete?.();
    };

    if (durationMs <= 0) {
      finish();
      return;
    }

    const tick = (now: number) => {
      if (activeRef.current?.token !== token) {
        fadeFrameRef.current = null;
        return;
      }
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      audio.volume = startVolume * (1 - eased);
      if (progress < 1) fadeFrameRef.current = window.requestAnimationFrame(tick);
      else finish();
    };
    fadeFrameRef.current = window.requestAnimationFrame(tick);
  }, [cancelFade, cleanPlaybackElement, setBackgroundDucked]);

  const requestCue = useCallback((request: BossVoiceRequest) => {
    if (!enabledRef.current || !preparedRef.current) return false;
    const active = activeRef.current;
    if (!active) return startCue(request);
    if (request.clip.priority < 2) return false;

    const queued = queuedImportantRef.current;
    if (!queued || request.clip.priority > queued.clip.priority) {
      queuedImportantRef.current = request;
    }

    // Phase/entrance cues may replace an ordinary random laugh. Important cues
    // already in progress finish naturally, with the higher-priority cue queued.
    if (active.clip.priority !== 0 || interruptInProgressRef.current) return true;
    interruptInProgressRef.current = true;
    fadeActiveCue(BOSS_VOICE_INTERRUPT_FADE_MS, true, () => {
      interruptInProgressRef.current = false;
      const next = enabledRef.current ? queuedImportantRef.current : null;
      queuedImportantRef.current = null;
      if (next && startCueRef.current(next)) return;
      setBackgroundDucked(false, BOSS_VOICE_DUCK_RELEASE_MS);
    });
    return true;
  }, [fadeActiveCue, setBackgroundDucked, startCue]);
  requestCueRef.current = requestCue;

  const schedule = useCallback((
    callback: () => void,
    delayMs: number,
    lifecycleToken: number,
  ) => {
    const timerId = window.setTimeout(() => {
      timerIdsRef.current.delete(timerId);
      if (!enabledRef.current || lifecycleTokenRef.current !== lifecycleToken) return;
      callback();
    }, Math.max(0, delayMs));
    timerIdsRef.current.add(timerId);
  }, []);

  const scheduleRandomLaugh = useCallback((lifecycleToken: number) => {
    schedule(() => {
      const candidates = RANDOM_LAUGH_CLIPS.filter(
        clip => clip.id !== lastRandomLaughRef.current,
      );
      const clip = candidates[Math.floor(Math.random() * candidates.length)]
        ?? RANDOM_LAUGH_CLIPS[0];
      const accepted = requestCueRef.current({ clip });
      if (accepted) lastRandomLaughRef.current = clip.id;
      scheduleRandomLaughRef.current(lifecycleToken);
    }, randomBetween(...RANDOM_LAUGH_COOLDOWN_MS), lifecycleToken);
  }, [schedule]);
  scheduleRandomLaughRef.current = scheduleRandomLaugh;

  const startBossFight = useCallback(() => {
    prepare();
    if (enabledRef.current) return false;

    enabledRef.current = true;
    clearTimers();
    queuedImportantRef.current = null;
    interruptInProgressRef.current = false;
    lastPlayedClipRef.current = null;
    lastRandomLaughRef.current = null;
    introStartedRef.current = false;
    introCompleteRef.current = false;
    enragedPlayedRef.current = false;
    enragedPendingRef.current = false;
    nextMajorAttackCueAtRef.current = -Infinity;
    const lifecycleToken = lifecycleTokenRef.current + 1;
    lifecycleTokenRef.current = lifecycleToken;

    schedule(() => {
      if (introStartedRef.current) return;
      requestCueRef.current({
        clip: BOSS_VOICE_CLIPS['coconut-full'],
      });
    }, randomBetween(...BOSS_INTRO_DELAY_MS), lifecycleToken);
    scheduleRandomLaughRef.current(lifecycleToken);
    return true;
  }, [clearTimers, prepare, schedule]);

  const cueMajorAttack = useCallback(() => {
    if (!enabledRef.current || !introCompleteRef.current) return false;
    const now = performance.now();
    if (now < nextMajorAttackCueAtRef.current || Math.random() > MAJOR_ATTACK_STINGER_CHANCE) {
      return false;
    }

    const accepted = requestCueRef.current({
      clip: BOSS_VOICE_CLIPS['coconut-stinger'],
    });
    const cooldownRange = accepted ? MAJOR_ATTACK_COOLDOWN_MS : MAJOR_ATTACK_RETRY_MS;
    nextMajorAttackCueAtRef.current = now + randomBetween(cooldownRange[0], cooldownRange[1]);
    return accepted;
  }, []);

  const cueEnraged = useCallback(() => {
    if (!enabledRef.current || enragedPlayedRef.current) return false;
    if (!introCompleteRef.current) {
      enragedPendingRef.current = true;
      return true;
    }
    enragedPlayedRef.current = true;
    return requestCueRef.current({ clip: BOSS_VOICE_CLIPS['laugh-full'] });
  }, []);

  const stop = useCallback((fadeMs = BOSS_VOICE_EXIT_FADE_MS) => {
    const wasActive = enabledRef.current
      || activeRef.current !== null
      || timerIdsRef.current.size > 0;
    enabledRef.current = false;
    lifecycleTokenRef.current += 1;
    clearTimers();
    queuedImportantRef.current = null;
    interruptInProgressRef.current = false;
    enragedPendingRef.current = false;

    if (activeRef.current) {
      fadeActiveCue(Math.max(0, fadeMs), false);
    } else {
      setBackgroundDucked(false, BOSS_VOICE_DUCK_RELEASE_MS);
    }
    return wasActive;
  }, [clearTimers, fadeActiveCue, setBackgroundDucked]);

  useEffect(() => () => {
    enabledRef.current = false;
    lifecycleTokenRef.current += 1;
    playbackTokenRef.current += 1;
    clearTimers();
    cancelFade();
    queuedImportantRef.current = null;
    activeRef.current = null;
    interruptInProgressRef.current = false;
    setBackgroundDucked(false, 0);

    const playback = playbackRef.current;
    playbackRef.current = null;
    if (playback) {
      playback.onended = null;
      playback.onerror = null;
      playback.pause();
      playback.removeAttribute('src');
      playback.load();
    }
    for (const preload of preloadCacheRef.current.values()) {
      preload.pause();
      preload.removeAttribute('src');
      preload.load();
    }
    preloadCacheRef.current.clear();
    preparedRef.current = false;
  }, [cancelFade, clearTimers, setBackgroundDucked]);

  return {
    prepare,
    startBossFight,
    cueMajorAttack,
    cueEnraged,
    stop,
  };
}
