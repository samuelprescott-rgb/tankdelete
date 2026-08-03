import { useCallback, useEffect, useRef, useState } from 'react';

const VOODOO_TRACK = {
  url: '/audio/voodoo-child-srv.mp3',
  name: 'Voodoo Child (Slight Return)',
  sourceLabel: 'Stevie Ray Vaughan and Double Trouble · approved cover',
} as const;
const CHANGE_TRACK = {
  url: '/audio/music/tank_radio_deftones_change.wav',
  name: 'Change (In the House of Flies)',
  sourceLabel: 'Deftones · tank radio',
} as const;
const FINAL_BOSS_TRACK = {
  url: '/audio/music/tank_radio_code_orange_my_world.wav',
  name: 'My World',
  sourceLabel: 'Code Orange · tank radio',
} as const;

/**
 * Player-tank radio mix. The camera rig remains centered on the tank, so this
 * near-field 2D emitter follows the tank without distance attenuation or an
 * extra spatial-processing pass over the authored radio masters.
 *
 * Change is intentionally much higher than Voodoo here: its supplied WAV is
 * about 9.6 dB quieter on average. This is playback gain only; the asset is not
 * normalized or otherwise modified.
 */
export const FIELD_RADIO_MIX = {
  voodooVolume: 0.28,
  changeVolume: 0.82,
  finalBossVolume: 1,
  bonusTransitionOutMs: 550,
  bossVoiceDuckDb: -3,
} as const;

const BOSS_VOICE_DUCK_GAIN = 10 ** (FIELD_RADIO_MIX.bossVoiceDuckDb / 20);

type RadioMetadata = {
  trackName: string;
  sourceLabel: string;
};

/**
 * Owns one persistent soundtrack element for the lifetime of the app. Every
 * radio track reuses that element so the entry gesture which unlocks Voodoo
 * also authorizes later wave cues. World ambience lives outside the field
 * radio and is never presented as a song.
 */
export function useFieldRadio() {
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [metadata, setMetadata] = useState<RadioMetadata>({
    trackName: VOODOO_TRACK.name,
    sourceLabel: VOODOO_TRACK.sourceLabel,
  });
  const mutedRef = useRef(false);
  const playingRef = useRef(false);
  const pendingFirstLaunchRef = useRef(false);
  const primingPromiseRef = useRef<Promise<boolean> | null>(null);
  const lifecycleTokenRef = useRef(0);
  const bonusStartedRef = useRef(false);
  const bonusTrackStartedRef = useRef(false);
  const finalBossTrackStartedRef = useRef(false);
  const bossVoiceDuckedRef = useRef(false);
  const transitionFrameRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const changePreloadRef = useRef<HTMLAudioElement | null>(null);
  const finalBossPreloadRef = useRef<HTMLAudioElement | null>(null);

  const updatePlaying = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
  }, []);

  const cancelTransition = useCallback(() => {
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }
    if (audioRef.current) audioRef.current.onended = null;
  }, []);

  const setTrackMetadata = useCallback((
    track: typeof VOODOO_TRACK | typeof CHANGE_TRACK | typeof FINAL_BOSS_TRACK,
  ) => {
    setMetadata({ trackName: track.name, sourceLabel: track.sourceLabel });
  }, []);

  const configureVoodoo = useCallback((audio: HTMLAudioElement) => {
    cancelTransition();
    bonusStartedRef.current = false;
    bonusTrackStartedRef.current = false;
    finalBossTrackStartedRef.current = false;
    bossVoiceDuckedRef.current = false;
    audio.onended = null;
    audio.pause();
    if (audio.getAttribute('src') !== VOODOO_TRACK.url) {
      audio.src = VOODOO_TRACK.url;
      audio.load();
    }
    audio.loop = true;
    audio.volume = FIELD_RADIO_MIX.voodooVolume;
    audio.currentTime = 0;
    setTrackMetadata(VOODOO_TRACK);
  }, [cancelTransition, setTrackMetadata]);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio(VOODOO_TRACK.url);
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = FIELD_RADIO_MIX.voodooVolume;
    audio.muted = mutedRef.current;
    audio.onplaying = () => updatePlaying(!audio.muted);
    audio.onpause = () => updatePlaying(false);
    audio.onerror = () => updatePlaying(false);
    audioRef.current = audio;
    audio.load();

    // Warm the second song well before the wave-edge cue. The live radio element
    // remains on Voodoo, while this hidden decoder prevents a multi-megabyte
    // fetch or cold decode from making Change audibly late at wave spawn.
    const changePreload = new Audio(CHANGE_TRACK.url);
    changePreload.preload = 'auto';
    changePreload.muted = true;
    changePreload.volume = 0;
    changePreload.load();
    changePreloadRef.current = changePreload;

    // Keep the final-wave recording hot in the media cache so the source swap
    // can start at file time zero on the boss-wave edge without a cold fetch.
    const finalBossPreload = new Audio(FINAL_BOSS_TRACK.url);
    finalBossPreload.preload = 'auto';
    finalBossPreload.muted = true;
    finalBossPreload.volume = 0;
    finalBossPreload.load();
    finalBossPreloadRef.current = finalBossPreload;
    return audio;
  }, [updatePlaying]);

  const fadeTo = useCallback((
    audio: HTMLAudioElement,
    targetVolume: number,
    durationMs: number,
    lifecycleToken: number,
    onComplete?: () => void,
  ) => {
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }
    const startVolume = audio.volume;
    const startedAt = performance.now();
    const clampedTarget = Math.min(1, Math.max(0, targetVolume));
    const tick = (now: number) => {
      if (lifecycleTokenRef.current !== lifecycleToken) {
        transitionFrameRef.current = null;
        return;
      }
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      audio.volume = startVolume + (clampedTarget - startVolume) * eased;
      if (progress < 1) {
        transitionFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        transitionFrameRef.current = null;
        onComplete?.();
      }
    };
    transitionFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const prime = useCallback(() => {
    const audio = ensureAudio();
    const lifecycleToken = lifecycleTokenRef.current + 1;
    lifecycleTokenRef.current = lifecycleToken;
    pendingFirstLaunchRef.current = true;
    configureVoodoo(audio);
    audio.muted = true;
    updatePlaying(false);

    const primingPromise = audio.play().then(() => {
      // Begin silently inside the entry gesture. This retains autoplay
      // permission through a native picker and an arbitrarily long scan.
      if (lifecycleTokenRef.current === lifecycleToken) updatePlaying(false);
      return true;
    }).catch(() => {
      if (lifecycleTokenRef.current === lifecycleToken) updatePlaying(false);
      return false;
    });
    primingPromiseRef.current = primingPromise;
    return primingPromise;
  }, [configureVoodoo, ensureAudio, updatePlaying]);

  const suspend = useCallback(() => {
    // A scan starts a new arena session. Reset the program to Voodoo but keep the
    // same unlocked element running silently so launch does not need a new gesture.
    const audio = audioRef.current;
    const lifecycleToken = lifecycleTokenRef.current + 1;
    lifecycleTokenRef.current = lifecycleToken;
    if (audio) {
      configureVoodoo(audio);
      audio.muted = true;
      const keepAlive = audio.play().then(() => {
        if (lifecycleTokenRef.current === lifecycleToken) updatePlaying(false);
        return true;
      }).catch(() => false);
      if (pendingFirstLaunchRef.current) primingPromiseRef.current = keepAlive;
    }
    updatePlaying(false);
  }, [configureVoodoo, updatePlaying]);

  const launch = useCallback(async () => {
    const audio = ensureAudio();
    const lifecycleToken = lifecycleTokenRef.current;
    if (pendingFirstLaunchRef.current) {
      const primingPromise = primingPromiseRef.current;
      await primingPromise;
      if (lifecycleTokenRef.current !== lifecycleToken) return false;
      audio.currentTime = 0;
      pendingFirstLaunchRef.current = false;
      primingPromiseRef.current = null;
    }
    audio.muted = mutedRef.current;

    // During the nightmare warning the live element is already loaded with
    // Change. A mute-button recovery must not start it before wave-one combat.
    if (bonusStartedRef.current && !bonusTrackStartedRef.current) {
      updatePlaying(false);
      return true;
    }

    if (!audio.paused) {
      updatePlaying(!mutedRef.current);
      return true;
    }

    try {
      await audio.play();
      if (lifecycleTokenRef.current !== lifecycleToken) return false;
      updatePlaying(!mutedRef.current);
      return true;
    } catch {
      // Keep the element intact. A policy rejection is recoverable from the
      // visible Start control once the playable scene has mounted.
      if (lifecycleTokenRef.current === lifecycleToken) updatePlaying(false);
      return false;
    }
  }, [ensureAudio, updatePlaying]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    lifecycleTokenRef.current += 1;
    pendingFirstLaunchRef.current = false;
    primingPromiseRef.current = null;
    if (audio) {
      configureVoodoo(audio);
      audio.muted = true;
      audio.pause();
      audio.currentTime = 0;
    } else {
      cancelTransition();
      bonusStartedRef.current = false;
      setTrackMetadata(VOODOO_TRACK);
    }
    updatePlaying(false);
  }, [cancelTransition, configureVoodoo, setTrackMetadata, updatePlaying]);

  const beginBonusRound = useCallback(() => {
    const audio = ensureAudio();
    if (bonusStartedRef.current) return false;
    bonusStartedRef.current = true;
    bonusTrackStartedRef.current = false;
    pendingFirstLaunchRef.current = false;
    primingPromiseRef.current = null;
    const lifecycleToken = lifecycleTokenRef.current + 1;
    lifecycleTokenRef.current = lifecycleToken;
    audio.onended = null;

    // Clear Voodoo before the nightmare transmission. Change is independently
    // cued from the first combat-wave edge by cueBonusTrack below.
    fadeTo(audio, 0, FIELD_RADIO_MIX.bonusTransitionOutMs, lifecycleToken, () => {
      if (lifecycleTokenRef.current !== lifecycleToken || !bonusStartedRef.current) return;
      audio.pause();
      audio.src = CHANGE_TRACK.url;
      audio.loop = true;
      audio.volume = FIELD_RADIO_MIX.changeVolume;
      audio.currentTime = 0;
      audio.muted = mutedRef.current;
      audio.load();
    });
    return true;
  }, [ensureAudio, fadeTo]);

  const cueBonusTrack = useCallback(() => {
    const audio = ensureAudio();
    if (!bonusStartedRef.current || bonusTrackStartedRef.current) return false;

    // This is a synchronous wave-edge cue: there is no timer between entering
    // wave-one combat and asking the authored recording to play.
    cancelTransition();
    bonusTrackStartedRef.current = true;
    audio.onended = null;
    audio.pause();
    if (audio.getAttribute('src') !== CHANGE_TRACK.url) {
      audio.src = CHANGE_TRACK.url;
      audio.load();
    }
    audio.loop = true;
    audio.volume = FIELD_RADIO_MIX.changeVolume * (
      bossVoiceDuckedRef.current ? BOSS_VOICE_DUCK_GAIN : 1
    );
    audio.currentTime = 0;
    audio.muted = mutedRef.current;
    setTrackMetadata(CHANGE_TRACK);

    // The recording owns its fade-in. Start at file time zero at T+0 of wave
    // one; do not seek or layer another envelope over the authored entrance.
    void audio.play().catch(() => updatePlaying(false));
    return true;
  }, [cancelTransition, ensureAudio, setTrackMetadata, updatePlaying]);

  const cueFinalBossTrack = useCallback(() => {
    const audio = ensureAudio();
    if (!bonusStartedRef.current
      || finalBossTrackStartedRef.current) return false;

    // Invalidate in-flight gain ramps, then replace Change on the same
    // tank-radio element. A single emitter guarantees there is no song overlap.
    // The boss track begins at file time zero on this call; it is not seeked or
    // held behind an additional transition envelope.
    lifecycleTokenRef.current += 1;
    cancelTransition();
    bonusTrackStartedRef.current = true;
    finalBossTrackStartedRef.current = true;
    audio.pause();
    if (audio.getAttribute('src') !== FINAL_BOSS_TRACK.url) {
      audio.src = FINAL_BOSS_TRACK.url;
      audio.load();
    }
    audio.loop = true;
    audio.volume = FIELD_RADIO_MIX.finalBossVolume * (
      bossVoiceDuckedRef.current ? BOSS_VOICE_DUCK_GAIN : 1
    );
    audio.currentTime = 0;
    audio.muted = mutedRef.current;
    setTrackMetadata(FINAL_BOSS_TRACK);
    void audio.play().catch(() => updatePlaying(false));
    return true;
  }, [cancelTransition, ensureAudio, setTrackMetadata, updatePlaying]);

  const setBossVoiceDuck = useCallback((ducked: boolean, durationMs: number) => {
    bossVoiceDuckedRef.current = ducked;
    const audio = audioRef.current;
    if (!audio) return;
    const baseVolume = finalBossTrackStartedRef.current
      ? FIELD_RADIO_MIX.finalBossVolume
      : bonusTrackStartedRef.current
        ? FIELD_RADIO_MIX.changeVolume
        : FIELD_RADIO_MIX.voodooVolume;
    const targetVolume = baseVolume * (ducked ? BOSS_VOICE_DUCK_GAIN : 1);
    fadeTo(
      audio,
      targetVolume,
      Math.max(0, durationMs),
      lifecycleTokenRef.current,
    );
  }, [fadeTo]);

  const toggleMute = useCallback(() => {
    // This is a recovery path for a browser that rejected the best-effort
    // automatic start. Under normal game entry the only states are Mute/Unmute.
    if (!playingRef.current && !mutedRef.current) {
      void launch();
      return;
    }

    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
      updatePlaying(!next && !audioRef.current.paused);
    }

    if (!next && audioRef.current?.paused) void launch();
  }, [launch, updatePlaying]);

  useEffect(() => () => {
    lifecycleTokenRef.current += 1;
    cancelTransition();
    const audio = audioRef.current;
    const changePreload = changePreloadRef.current;
    const finalBossPreload = finalBossPreloadRef.current;
    audioRef.current = null;
    changePreloadRef.current = null;
    finalBossPreloadRef.current = null;
    if (changePreload) {
      changePreload.pause();
      changePreload.removeAttribute('src');
      changePreload.load();
    }
    if (finalBossPreload) {
      finalBossPreload.pause();
      finalBossPreload.removeAttribute('src');
      finalBossPreload.load();
    }
    if (!audio) return;
    audio.onplaying = null;
    audio.onpause = null;
    audio.onerror = null;
    audio.onended = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, [cancelTransition]);

  return {
    muted,
    playing,
    trackName: metadata.trackName,
    sourceLabel: metadata.sourceLabel,
    prime,
    suspend,
    launch,
    stop,
    beginBonusRound,
    cueBonusTrack,
    cueFinalBossTrack,
    setBossVoiceDuck,
    toggleMute,
  };
}
