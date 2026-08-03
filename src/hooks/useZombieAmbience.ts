import { useCallback, useEffect, useRef } from 'react';

const ZOMBIE_AMBIENCE_URL = '/audio/bonus/zombie-ambience-10m.mp3';
const NIGHTMARE_INTRO_URL = '/audio/bonus/zombie-round-begins-intro.wav';
const BOSS_SCREECH_URL = '/audio/bonus/zombie-boss-screech.m4a';

const INITIAL_FADE_MS = 6_500;
const STOP_FADE_MS = 2_400;
const INTRO_PEAK_VOLUME = 0.92;
const INTRO_DUCK_VOLUME = 0.18;
const INTRO_DUCK_AT_MS = 10_000;
const INTRO_DUCK_FADE_MS = 900;
const INTRO_TAIL_FADE_AT_MS = 13_000;
const INTRO_TAIL_FADE_MS = 1_000;
const INTRO_RELEASE_FALLBACK_MS = 14_450;
const BOSS_SCREECH_VOLUME = 0.58;
const BOSS_SCREECH_FADE_AT_MS = 4_300;
const BOSS_SCREECH_FADE_MS = 760;
const BOSS_SCREECH_RELEASE_FALLBACK_MS = 5_350;
const BOSS_VOICE_DUCK_GAIN = 10 ** (-3 / 20);

type FadeRef = { current: number | null };
type NumberRef = { current: number };
type TimerSetRef = { current: Set<number> };

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createAudio(src: string, loop = false) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.loop = loop;
  audio.volume = 0;
  return audio;
}

/**
 * Owns the non-musical nightmare bed. This deliberately stays separate from
 * useFieldRadio so zombie voices and storm rain never appear as a radio track
 * and are unaffected by the player's music-only mute control.
 */
export function useZombieAmbience(
  setRainMix: (targetVolume: number | null, durationMs: number) => void,
  setRainDuck: (ducked: boolean, durationMs: number) => void,
) {
  const zombieRef = useRef<HTMLAudioElement | null>(null);
  const introRef = useRef<HTMLAudioElement | null>(null);
  const bossScreechRef = useRef<HTMLAudioElement | null>(null);
  const zombieBaseFadeRef = useRef<number | null>(null);
  const zombieDuckFadeRef = useRef<number | null>(null);
  const introFadeRef = useRef<number | null>(null);
  const bossScreechFadeRef = useRef<number | null>(null);
  const timerIdsRef = useRef(new Set<number>());
  const introTimerIdsRef = useRef(new Set<number>());
  const bossScreechTimerIdsRef = useRef(new Set<number>());
  const activeRef = useRef(false);
  const introActiveRef = useRef(false);
  const bossScreechActiveRef = useRef(false);
  const lifecycleTokenRef = useRef(0);
  const introTokenRef = useRef(0);
  const bossScreechTokenRef = useRef(0);
  const zombieDominantRef = useRef(true);
  const bossVoiceDuckedRef = useRef(false);
  const zombieBaseVolumeRef = useRef(0);
  const zombieDuckGainRef = useRef(1);
  const zombieBaseTargetRef = useRef(0.15);
  const rainBaseTargetRef = useRef(0.055);

  const clearTimers = useCallback(() => {
    for (const timerId of timerIdsRef.current) window.clearTimeout(timerId);
    timerIdsRef.current.clear();
  }, []);

  const cancelFade = useCallback((fadeRef: FadeRef) => {
    if (fadeRef.current === null) return;
    window.cancelAnimationFrame(fadeRef.current);
    fadeRef.current = null;
  }, []);

  const clearCueTimers = useCallback((timerSetRef: TimerSetRef) => {
    for (const timerId of timerSetRef.current) window.clearTimeout(timerId);
    timerSetRef.current.clear();
  }, []);

  const scheduleCue = useCallback((
    timerSetRef: TimerSetRef,
    callback: () => void,
    delayMs: number,
  ) => {
    const timerId = window.setTimeout(() => {
      timerSetRef.current.delete(timerId);
      callback();
    }, delayMs);
    timerSetRef.current.add(timerId);
  }, []);

  const applyZombieMix = useCallback(() => {
    const audio = zombieRef.current;
    if (!audio) return;
    audio.volume = Math.min(
      1,
      Math.max(0, zombieBaseVolumeRef.current * zombieDuckGainRef.current),
    );
  }, []);

  const fadeZombieValueTo = useCallback((
    valueRef: NumberRef,
    fadeRef: FadeRef,
    targetValue: number,
    durationMs: number,
    lifecycleToken: number,
    onComplete?: () => void,
  ) => {
    cancelFade(fadeRef);
    const startValue = valueRef.current;
    const target = Math.min(1, Math.max(0, targetValue));
    if (durationMs <= 0 || Math.abs(startValue - target) < 0.001) {
      valueRef.current = target;
      applyZombieMix();
      onComplete?.();
      return;
    }
    const startedAt = performance.now();

    const tick = (now: number) => {
      if (lifecycleTokenRef.current !== lifecycleToken) {
        fadeRef.current = null;
        return;
      }
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      valueRef.current = startValue + (target - startValue) * eased;
      applyZombieMix();
      if (progress < 1) {
        fadeRef.current = window.requestAnimationFrame(tick);
      } else {
        fadeRef.current = null;
        onComplete?.();
      }
    };

    fadeRef.current = window.requestAnimationFrame(tick);
  }, [applyZombieMix, cancelFade]);

  const fadeCueTo = useCallback((
    audio: HTMLAudioElement,
    fadeRef: FadeRef,
    targetVolume: number,
    durationMs: number,
    tokenRef: NumberRef,
    token: number,
    onComplete?: () => void,
  ) => {
    cancelFade(fadeRef);
    const startVolume = audio.volume;
    const target = Math.min(1, Math.max(0, targetVolume));
    const startedAt = performance.now();

    const tick = (now: number) => {
      if (tokenRef.current !== token) {
        fadeRef.current = null;
        return;
      }
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      audio.volume = startVolume + (target - startVolume) * eased;
      if (progress < 1) {
        fadeRef.current = window.requestAnimationFrame(tick);
      } else {
        fadeRef.current = null;
        onComplete?.();
      }
    };

    fadeRef.current = window.requestAnimationFrame(tick);
  }, [cancelFade]);

  const schedule = useCallback((callback: () => void, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      timerIdsRef.current.delete(timerId);
      callback();
    }, delayMs);
    timerIdsRef.current.add(timerId);
  }, []);

  const stopIntro = useCallback((fadeMs = 260) => {
    const audio = introRef.current;
    const wasActive = introActiveRef.current || Boolean(audio && !audio.paused);
    introActiveRef.current = false;
    const token = introTokenRef.current + 1;
    introTokenRef.current = token;
    clearCueTimers(introTimerIdsRef);
    if (!audio) return wasActive;
    audio.onended = null;

    const release = () => {
      if (introTokenRef.current !== token) return;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
    };
    fadeCueTo(audio, introFadeRef, 0, fadeMs, introTokenRef, token, release);
    return wasActive;
  }, [clearCueTimers, fadeCueTo]);

  const stopBossScreech = useCallback((fadeMs = 220) => {
    const audio = bossScreechRef.current;
    const wasActive = bossScreechActiveRef.current || Boolean(audio && !audio.paused);
    bossScreechActiveRef.current = false;
    const token = bossScreechTokenRef.current + 1;
    bossScreechTokenRef.current = token;
    clearCueTimers(bossScreechTimerIdsRef);
    if (!audio) return wasActive;
    audio.onended = null;

    const release = () => {
      if (bossScreechTokenRef.current !== token) return;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
    };
    fadeCueTo(
      audio,
      bossScreechFadeRef,
      0,
      fadeMs,
      bossScreechTokenRef,
      token,
      release,
    );
    return wasActive;
  }, [clearCueTimers, fadeCueTo]);

  const playIntro = useCallback(() => {
    const audio = introRef.current;
    if (!audio || introActiveRef.current) return false;
    const token = introTokenRef.current + 1;
    introTokenRef.current = token;
    introActiveRef.current = true;
    clearCueTimers(introTimerIdsRef);
    cancelFade(introFadeRef);

    const release = () => {
      if (introTokenRef.current !== token) return;
      introActiveRef.current = false;
      clearCueTimers(introTimerIdsRef);
      cancelFade(introFadeRef);
      audio.onended = null;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
    };

    audio.onended = release;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
    void audio.play().catch(release);
    fadeCueTo(audio, introFadeRef, INTRO_PEAK_VOLUME, 180, introTokenRef, token);

    // Wave one (and Change) begins ten seconds after this warning starts. Keep
    // the authored four-second tail playing under the song, then fade its end.
    scheduleCue(introTimerIdsRef, () => {
      if (introTokenRef.current !== token) return;
      fadeCueTo(
        audio,
        introFadeRef,
        INTRO_DUCK_VOLUME,
        INTRO_DUCK_FADE_MS,
        introTokenRef,
        token,
      );
    }, INTRO_DUCK_AT_MS);
    scheduleCue(introTimerIdsRef, () => {
      if (introTokenRef.current !== token) return;
      fadeCueTo(audio, introFadeRef, 0, INTRO_TAIL_FADE_MS, introTokenRef, token);
    }, INTRO_TAIL_FADE_AT_MS);
    scheduleCue(introTimerIdsRef, release, INTRO_RELEASE_FALLBACK_MS);
    return true;
  }, [cancelFade, clearCueTimers, fadeCueTo, scheduleCue]);

  const playBossScreech = useCallback(() => {
    const audio = bossScreechRef.current;
    if (!audio || bossScreechActiveRef.current) return false;
    // A very early boss spawn should replace the intro rather than stack two
    // full-range horror stingers on top of one another.
    if (introActiveRef.current) stopIntro(220);

    const token = bossScreechTokenRef.current + 1;
    bossScreechTokenRef.current = token;
    bossScreechActiveRef.current = true;
    clearCueTimers(bossScreechTimerIdsRef);
    cancelFade(bossScreechFadeRef);

    const release = () => {
      if (bossScreechTokenRef.current !== token) return;
      bossScreechActiveRef.current = false;
      clearCueTimers(bossScreechTimerIdsRef);
      cancelFade(bossScreechFadeRef);
      audio.onended = null;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
    };

    audio.onended = release;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
    void audio.play().catch(release);
    fadeCueTo(audio, bossScreechFadeRef, BOSS_SCREECH_VOLUME, 120, bossScreechTokenRef, token);
    scheduleCue(bossScreechTimerIdsRef, () => {
      if (bossScreechTokenRef.current !== token) return;
      fadeCueTo(
        audio,
        bossScreechFadeRef,
        0,
        BOSS_SCREECH_FADE_MS,
        bossScreechTokenRef,
        token,
      );
    }, BOSS_SCREECH_FADE_AT_MS);
    scheduleCue(bossScreechTimerIdsRef, release, BOSS_SCREECH_RELEASE_FALLBACK_MS);
    return true;
  }, [cancelFade, clearCueTimers, fadeCueTo, scheduleCue, stopIntro]);

  const start = useCallback(() => {
    if (activeRef.current) return false;
    activeRef.current = true;
    clearTimers();
    const lifecycleToken = lifecycleTokenRef.current + 1;
    lifecycleTokenRef.current = lifecycleToken;
    zombieDominantRef.current = true;

    const zombie = zombieRef.current;
    if (zombie) {
      zombie.pause();
      zombie.currentTime = 0;
      zombie.volume = 0;
      void zombie.play().catch(() => {});
    }
    cancelFade(zombieBaseFadeRef);
    cancelFade(zombieDuckFadeRef);
    zombieBaseVolumeRef.current = 0;
    zombieDuckGainRef.current = bossVoiceDuckedRef.current ? BOSS_VOICE_DUCK_GAIN : 1;
    setRainDuck(bossVoiceDuckedRef.current, 0);

    const runBlend = () => {
      if (!activeRef.current || lifecycleTokenRef.current !== lifecycleToken) return;
      const zombieDominant = zombieDominantRef.current;
      zombieDominantRef.current = !zombieDominant;
      const fadeMs = randomBetween(6_500, 9_500);
      const zombieTarget = zombieDominant
        ? randomBetween(0.16, 0.21)
        : randomBetween(0.065, 0.1);
      const rainTarget = zombieDominant
        ? randomBetween(0.025, 0.05)
        : randomBetween(0.065, 0.095);
      zombieBaseTargetRef.current = zombieTarget;
      rainBaseTargetRef.current = rainTarget;

      // Alternating, slow envelopes let the storm breathe through the horde
      // bed without creating hard loops or a constant wall of noise.
      fadeZombieValueTo(
        zombieBaseVolumeRef,
        zombieBaseFadeRef,
        zombieTarget,
        fadeMs,
        lifecycleToken,
      );
      setRainMix(rainTarget, fadeMs);

      schedule(runBlend, fadeMs + randomBetween(12_000, 21_000));
    };

    zombieBaseTargetRef.current = 0.15;
    rainBaseTargetRef.current = 0.055;
    fadeZombieValueTo(
      zombieBaseVolumeRef,
      zombieBaseFadeRef,
      zombieBaseTargetRef.current,
      INITIAL_FADE_MS,
      lifecycleToken,
    );
    setRainMix(rainBaseTargetRef.current, INITIAL_FADE_MS);
    schedule(runBlend, INITIAL_FADE_MS + 8_000);
    return true;
  }, [cancelFade, clearTimers, fadeZombieValueTo, schedule, setRainDuck, setRainMix]);

  const setBossVoiceDuck = useCallback((ducked: boolean, durationMs: number) => {
    bossVoiceDuckedRef.current = ducked;
    setRainDuck(ducked, Math.max(0, durationMs));
    const duckGain = ducked ? BOSS_VOICE_DUCK_GAIN : 1;
    if (!activeRef.current) {
      cancelFade(zombieDuckFadeRef);
      zombieDuckGainRef.current = duckGain;
      return;
    }
    const lifecycleToken = lifecycleTokenRef.current;
    fadeZombieValueTo(
      zombieDuckGainRef,
      zombieDuckFadeRef,
      duckGain,
      Math.max(0, durationMs),
      lifecycleToken,
    );
  }, [cancelFade, fadeZombieValueTo, setRainDuck]);

  const stop = useCallback(() => {
    const wasActive = activeRef.current
      || introActiveRef.current
      || bossScreechActiveRef.current;
    if (!wasActive) return false;
    activeRef.current = false;
    clearTimers();
    const lifecycleToken = lifecycleTokenRef.current + 1;
    lifecycleTokenRef.current = lifecycleToken;
    cancelFade(zombieDuckFadeRef);
    zombieBaseVolumeRef.current *= zombieDuckGainRef.current;
    zombieDuckGainRef.current = 1;
    fadeZombieValueTo(
      zombieBaseVolumeRef,
      zombieBaseFadeRef,
      0,
      STOP_FADE_MS,
      lifecycleToken,
      () => {
        const audio = zombieRef.current;
        if (activeRef.current || lifecycleTokenRef.current !== lifecycleToken || !audio) return;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0;
      },
    );
    stopIntro(320);
    stopBossScreech(280);
    setRainMix(null, STOP_FADE_MS);
    return true;
  }, [cancelFade, clearTimers, fadeZombieValueTo, setRainMix, stopBossScreech, stopIntro]);

  useEffect(() => {
    zombieRef.current = createAudio(ZOMBIE_AMBIENCE_URL, true);
    introRef.current = createAudio(NIGHTMARE_INTRO_URL);
    bossScreechRef.current = createAudio(BOSS_SCREECH_URL);

    return () => {
      activeRef.current = false;
      introActiveRef.current = false;
      bossScreechActiveRef.current = false;
      bossVoiceDuckedRef.current = false;
      lifecycleTokenRef.current += 1;
      introTokenRef.current += 1;
      bossScreechTokenRef.current += 1;
      clearTimers();
      clearCueTimers(introTimerIdsRef);
      clearCueTimers(bossScreechTimerIdsRef);
      cancelFade(zombieBaseFadeRef);
      cancelFade(zombieDuckFadeRef);
      cancelFade(introFadeRef);
      cancelFade(bossScreechFadeRef);
      setRainMix(null, 0);
      setRainDuck(false, 0);
      for (const audio of [zombieRef.current, introRef.current, bossScreechRef.current]) {
        if (!audio) continue;
        audio.onended = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      zombieRef.current = null;
      introRef.current = null;
      bossScreechRef.current = null;
    };
  }, [cancelFade, clearCueTimers, clearTimers, setRainDuck, setRainMix]);

  return { start, stop, playIntro, playBossScreech, setBossVoiceDuck };
}
