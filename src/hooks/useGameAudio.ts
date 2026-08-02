import { useCallback, useEffect, useRef } from 'react';

const AUDIO_PATHS = {
  cannon: '/audio/sfx/tank_cannon_fire.wav',
  machineGun: '/audio/sfx/machine_gun_burst_01.wav',
  flamethrower: '/audio/sfx/flamethrower_continuous.wav',
  napalm: '/audio/sfx/napalm_strike.wav',
  engine: '/audio/sfx/old_tank_engine_continuous.wav',
  gearShift: '/audio/sfx/tank_gear_shift.wav',
  battlefield: '/audio/ambience/battlefield_full.wav',
} as const;

function createAudio(src: string, volume: number, loop = false) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.volume = volume;
  audio.loop = loop;
  return audio;
}

export function useGameAudio() {
  const cannonRef = useRef<HTMLAudioElement | null>(null);
  const napalmRef = useRef<HTMLAudioElement | null>(null);
  const gearShiftRef = useRef<HTMLAudioElement | null>(null);
  const machineGunRef = useRef<HTMLAudioElement | null>(null);
  const flamethrowerRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<HTMLAudioElement | null>(null);
  const battlefieldRef = useRef<HTMLAudioElement | null>(null);
  const activeOneShotsRef = useRef(new Set<HTMLAudioElement>());
  const machineGunActiveRef = useRef(false);
  const flamethrowerActiveRef = useRef(false);
  const movementActiveRef = useRef(false);
  const battlefieldActiveRef = useRef(false);

  useEffect(() => {
    cannonRef.current = createAudio(AUDIO_PATHS.cannon, 0.78);
    napalmRef.current = createAudio(AUDIO_PATHS.napalm, 0.74);
    gearShiftRef.current = createAudio(AUDIO_PATHS.gearShift, 0.4);
    machineGunRef.current = createAudio(AUDIO_PATHS.machineGun, 0.56, true);
    flamethrowerRef.current = createAudio(AUDIO_PATHS.flamethrower, 0.5, true);
    engineRef.current = createAudio(AUDIO_PATHS.engine, 0.26, true);
    battlefieldRef.current = createAudio(AUDIO_PATHS.battlefield, 0.11, true);

    return () => {
      for (const audio of [
        cannonRef.current,
        napalmRef.current,
        gearShiftRef.current,
        machineGunRef.current,
        flamethrowerRef.current,
        engineRef.current,
        battlefieldRef.current,
      ]) {
        audio?.pause();
      }
      for (const audio of activeOneShotsRef.current) audio.pause();
      activeOneShotsRef.current.clear();
    };
  }, []);

  const playOneShot = useCallback((template: HTMLAudioElement | null) => {
    if (!template) return;

    const audio = template.cloneNode(true) as HTMLAudioElement;
    audio.volume = template.volume;
    activeOneShotsRef.current.add(audio);

    const release = () => {
      activeOneShotsRef.current.delete(audio);
      audio.removeEventListener('ended', release);
      audio.removeEventListener('error', release);
    };

    audio.addEventListener('ended', release);
    audio.addEventListener('error', release);
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

  const ensureBattlefieldAmbience = useCallback(() => {
    if (battlefieldActiveRef.current) startLoop(battlefieldRef.current);
  }, [startLoop]);

  const playCannon = useCallback(() => {
    ensureBattlefieldAmbience();
    playOneShot(cannonRef.current);
  }, [ensureBattlefieldAmbience, playOneShot]);

  const playNapalmImpact = useCallback(() => {
    ensureBattlefieldAmbience();
    playOneShot(napalmRef.current);
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
    battlefieldActiveRef.current = active;
    if (active) startLoop(battlefieldRef.current);
    else stopLoop(battlefieldRef.current);
  }, [startLoop, stopLoop]);

  const stopAllLoops = useCallback(() => {
    machineGunActiveRef.current = false;
    flamethrowerActiveRef.current = false;
    movementActiveRef.current = false;
    battlefieldActiveRef.current = false;
    stopLoop(machineGunRef.current);
    stopLoop(flamethrowerRef.current);
    stopLoop(engineRef.current);
    stopLoop(battlefieldRef.current);
  }, [stopLoop]);

  return {
    playCannon,
    playNapalmImpact,
    setMachineGunActive,
    setFlamethrowerActive,
    setMovementActive,
    setBattlefieldActive,
    stopAllLoops,
  };
}
