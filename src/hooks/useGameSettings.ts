import { useCallback, useEffect, useState } from 'react';

export interface GameSettings {
  brightness: number;
  masterVolume: number;
  musicVolume: number;
  weaponsVolume: number;
  ambienceVolume: number;
  voiceEffectsVolume: number;
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = Object.freeze({
  brightness: 1.3,
  masterVolume: 1,
  musicVolume: 1,
  weaponsVolume: 1,
  ambienceVolume: 0.88,
  voiceEffectsVolume: 0.92,
});

export const BRIGHTNESS_RANGE = Object.freeze({
  min: 0.7,
  max: 1.8,
  step: 0.05,
});

const SETTINGS_STORAGE_KEY = 'tankdelete.game-settings.v2';
const LEGACY_SETTINGS_STORAGE_KEY = 'tankdelete.game-settings.v1';

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function loadSettings(): GameSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_GAME_SETTINGS };

  try {
    const currentRaw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    const legacyRaw = currentRaw
      ? null
      : window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    const raw = currentRaw ?? legacyRaw;
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    const saved = JSON.parse(raw) as Partial<GameSettings>;
    const legacyBrightness = legacyRaw && saved.brightness === 1.15
      ? DEFAULT_GAME_SETTINGS.brightness
      : saved.brightness;
    return {
      brightness: clamp(
        legacyBrightness,
        BRIGHTNESS_RANGE.min,
        BRIGHTNESS_RANGE.max,
        DEFAULT_GAME_SETTINGS.brightness,
      ),
      masterVolume: clamp(saved.masterVolume, 0, 1, DEFAULT_GAME_SETTINGS.masterVolume),
      musicVolume: clamp(saved.musicVolume, 0, 1, DEFAULT_GAME_SETTINGS.musicVolume),
      weaponsVolume: clamp(saved.weaponsVolume, 0, 1, DEFAULT_GAME_SETTINGS.weaponsVolume),
      ambienceVolume: clamp(saved.ambienceVolume, 0, 1, DEFAULT_GAME_SETTINGS.ambienceVolume),
      voiceEffectsVolume: clamp(
        saved.voiceEffectsVolume,
        0,
        1,
        DEFAULT_GAME_SETTINGS.voiceEffectsVolume,
      ),
    };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings remain active for this session if persistent storage is unavailable.
    }
  }, [settings]);

  const updateSetting = useCallback(<Key extends keyof GameSettings>(
    key: Key,
    value: GameSettings[Key],
  ) => {
    setSettings(current => ({ ...current, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_GAME_SETTINGS });
  }, []);

  return {
    settings,
    updateSetting,
    resetSettings,
  };
}
