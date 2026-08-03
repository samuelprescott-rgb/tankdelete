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
    audio.onplaying = () => updatePlaying(true);
    audio.onpause = () => updatePlaying(false);
    audio.onerror = () => updatePlaying(false);
    audioRef.current = audio;
    audio.load();
    return audio;
  }, [updatePlaying]);

  const start = useCallback(async () => {
    const audio = ensureAudio();
    audio.muted = mutedRef.current;
    if (!audio.paused) {
      updatePlaying(true);
      return true;
    }

    try {
      // Game-entry buttons call this before any awaited directory work, which
      // keeps play() inside the browser's legal user-activation window.
      await audio.play();
      updatePlaying(true);
      return true;
    } catch {
      // Keep the element intact. A browser policy rejection is not a missing
      // file, and the next direct click or M key can safely retry playback.
      updatePlaying(false);
      return false;
    }
  }, [ensureAudio, updatePlaying]);

  const toggleMute = useCallback(() => {
    // This is a recovery path for a browser that rejected the best-effort
    // automatic start. Under normal game entry the only states are Mute/Unmute.
    if (!playingRef.current && !mutedRef.current) {
      void start();
      return;
    }

    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;

    if (!next && audioRef.current?.paused) void start();
  }, [start]);

  useEffect(() => () => {
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
    start,
    toggleMute,
  };
}
