import { useCallback, useEffect, useRef, useState } from 'react';

const BUNDLED_TRACK_URL = '/audio/voodoo-child-srv.mp3';
const BUNDLED_TRACK_NAME = 'Voodoo Child (Slight Return)';
const BUNDLED_TRACK_ARTIST = 'Stevie Ray Vaughan and Double Trouble';
const RADIO_VOLUME = 0.38;

/**
 * Owns one persistent soundtrack element for the lifetime of the app.
 * Muting never pauses or rewinds it, so returning to the radio cannot restart
 * the track or create the impression that the recording was cut short.
 */
export function useFieldRadio() {
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const mutedRef = useRef(false);
  const playingRef = useRef(false);
  const pendingFirstLaunchRef = useRef(false);
  const primingPromiseRef = useRef<Promise<boolean> | null>(null);
  const lifecycleTokenRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const updatePlaying = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
  }, []);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio(BUNDLED_TRACK_URL);
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = RADIO_VOLUME;
    audio.muted = mutedRef.current;
    audio.onplaying = () => updatePlaying(!audio.muted);
    audio.onpause = () => updatePlaying(false);
    audio.onerror = () => updatePlaying(false);
    audioRef.current = audio;
    audio.load();
    return audio;
  }, [updatePlaying]);

  const prime = useCallback(() => {
    const audio = ensureAudio();
    const lifecycleToken = lifecycleTokenRef.current + 1;
    lifecycleTokenRef.current = lifecycleToken;
    pendingFirstLaunchRef.current = true;
    audio.currentTime = 0;
    audio.muted = true;
    updatePlaying(false);
    if (!audio.paused) {
      const alreadyPlaying = Promise.resolve(true);
      primingPromiseRef.current = alreadyPlaying;
      return alreadyPlaying;
    }

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
  }, [ensureAudio, updatePlaying]);

  const suspend = useCallback(() => {
    // Portal/directory scans stay silent without surrendering the already
    // unlocked media element or rewinding an established transmission.
    const audio = audioRef.current;
    lifecycleTokenRef.current += 1;
    if (audio) audio.muted = true;
    updatePlaying(false);
  }, [updatePlaying]);

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
      audio.muted = true;
      audio.pause();
      audio.currentTime = 0;
    }
    updatePlaying(false);
  }, [updatePlaying]);

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
    const audio = audioRef.current;
    audioRef.current = null;
    if (!audio) return;
    audio.onplaying = null;
    audio.onpause = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, []);

  return {
    muted,
    playing,
    trackName: BUNDLED_TRACK_NAME,
    sourceLabel: `${BUNDLED_TRACK_ARTIST} · approved cover`,
    prime,
    suspend,
    launch,
    stop,
    toggleMute,
  };
}
