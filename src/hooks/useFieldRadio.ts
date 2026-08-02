import { useCallback, useEffect, useRef, useState } from 'react';

interface RadioTrack {
  name: string;
  lead: number[];
  bass: number[];
  harmony: Array<number[] | null>;
}

const TRACKS: RadioTrack[] = [
  {
    name: 'Dustoff Signal',
    lead: [329.63, 392, 440, 392, 329.63, 293.66, 261.63, 293.66, 329.63, 392, 493.88, 440, 392, 329.63, 293.66, 261.63],
    bass: [82.41, 82.41, 98, 98, 110, 110, 98, 98, 82.41, 82.41, 73.42, 73.42, 65.41, 65.41, 73.42, 73.42],
    harmony: [[164.81, 196], null, null, null, [220, 261.63], null, null, null, [164.81, 196], null, null, null, [146.83, 174.61], null, null, null],
  },
  {
    name: 'River Static',
    lead: [293.66, 349.23, 392, 440, 392, 349.23, 293.66, 261.63, 293.66, 349.23, 392, 349.23, 293.66, 261.63, 246.94, 261.63],
    bass: [73.42, 73.42, 87.31, 87.31, 98, 98, 87.31, 87.31, 73.42, 73.42, 65.41, 65.41, 73.42, 73.42, 65.41, 65.41],
    harmony: [[146.83, 174.61], null, null, null, [196, 246.94], null, null, null, [146.83, 174.61], null, null, null, [130.81, 164.81], null, null, null],
  },
];

const STEP_MS = 250;

function playTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.detune.setValueAtTime((Math.random() - 0.5) * 7, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

export function useFieldRadio() {
  const [enabled, setEnabled] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const staticSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const trackIndexRef = useRef(0);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    staticSourceRef.current?.stop();
    staticSourceRef.current = null;
    masterRef.current?.disconnect();
    masterRef.current = null;
    contextRef.current?.close();
    contextRef.current = null;
    setEnabled(false);
  }, []);

  const start = useCallback(async () => {
    if (contextRef.current) return;

    const AudioContextClass = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    await context.resume();

    const master = context.createGain();
    const filter = context.createBiquadFilter();
    master.gain.value = 0.11;
    filter.type = 'lowpass';
    filter.frequency.value = 2800;
    filter.Q.value = 0.7;
    master.connect(filter);
    filter.connect(context.destination);

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.045;
    }
    const staticSource = context.createBufferSource();
    const staticGain = context.createGain();
    staticSource.buffer = noiseBuffer;
    staticSource.loop = true;
    staticGain.gain.value = 0.045;
    staticSource.connect(staticGain);
    staticGain.connect(master);
    staticSource.start();

    contextRef.current = context;
    masterRef.current = master;
    staticSourceRef.current = staticSource;
    stepRef.current = 0;

    const tick = () => {
      const activeContext = contextRef.current;
      const activeMaster = masterRef.current;
      if (!activeContext || !activeMaster) return;

      const track = TRACKS[trackIndexRef.current];
      const step = stepRef.current % track.lead.length;
      playTone(activeContext, activeMaster, track.bass[step], 0.2, 0.17, 'triangle');
      playTone(activeContext, activeMaster, track.lead[step], 0.16, 0.075, 'square');

      const chord = track.harmony[step];
      chord?.forEach(frequency => playTone(activeContext, activeMaster, frequency, 0.45, 0.035, 'sine'));

      if (step % 4 === 0) {
        playTone(activeContext, activeMaster, 48, 0.08, 0.22, 'sine');
      }

      stepRef.current += 1;
    };

    tick();
    intervalRef.current = window.setInterval(tick, STEP_MS);
    setEnabled(true);
  }, []);

  const toggle = useCallback(() => {
    if (contextRef.current) {
      stop();
    } else {
      void start();
    }
  }, [start, stop]);

  const nextTrack = useCallback(() => {
    setTrackIndex(prev => {
      const next = (prev + 1) % TRACKS.length;
      trackIndexRef.current = next;
      stepRef.current = 0;
      return next;
    });
  }, []);

  useEffect(() => stop, [stop]);

  return {
    enabled,
    trackName: TRACKS[trackIndex].name,
    toggle,
    nextTrack,
    stop,
  };
}
