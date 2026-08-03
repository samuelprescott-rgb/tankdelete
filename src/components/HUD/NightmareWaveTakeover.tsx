import { useEffect, useRef, useState } from 'react';
import './NightmareWaveTakeover.css';

export const NIGHTMARE_WAVE_TAKEOVER_MS = 3_200;

export interface NightmareWaveTakeoverProps {
  /** A rising edge shows the takeover; changing wave retriggers it while active. */
  active: boolean;
  wave: number;
  /** Switches the transmission to its terminal-contact treatment. */
  boss?: boolean;
  /** Called only after a complete takeover, never when it is cancelled early. */
  onComplete?: () => void;
}

export function NightmareWaveTakeover({
  active,
  wave,
  boss = false,
  onComplete,
}: NightmareWaveTakeoverProps) {
  const [sequence, setSequence] = useState<number | null>(null);
  const completionRef = useRef(onComplete);
  const normalizedWave = Math.max(1, Math.trunc(Number.isFinite(wave) ? wave : 1));

  useEffect(() => {
    completionRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active) {
      setSequence(null);
      return;
    }

    setSequence(current => (current ?? 0) + 1);
    const completionTimer = window.setTimeout(() => {
      setSequence(null);
      completionRef.current?.();
    }, NIGHTMARE_WAVE_TAKEOVER_MS);

    return () => window.clearTimeout(completionTimer);
  }, [active, boss, normalizedWave]);

  if (sequence === null) return null;

  const paddedWave = String(normalizedWave).padStart(2, '0');
  const transmissionLabel = boss
    ? 'Nightmare protocol // terminal contact'
    : 'Nightmare protocol // hostile signal';
  const subcopy = boss
    ? 'FINAL WAVE · COMMAND CONTACT · NO WITHDRAWAL'
    : `WAVE ${paddedWave} · HOLD THE LINE`;

  return (
    <div
      key={sequence}
      className={`nightmare-takeover ${boss ? 'is-boss' : ''}`}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      aria-label={`${boss ? 'Final nightmare wave' : 'Nightmare wave'} ${normalizedWave}`}
    >
      <div className="nightmare-takeover__backdrop" aria-hidden="true" />
      <div className="nightmare-takeover__static" aria-hidden="true" />
      <div className="nightmare-takeover__scanlines" aria-hidden="true" />
      <div className="nightmare-takeover__tears" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="nightmare-takeover__signal-frame">
        <span className="nightmare-takeover__kicker">{transmissionLabel}</span>
        <strong
          className="nightmare-takeover__title"
          data-text="NIGHTMARE WAVE"
        >
          NIGHTMARE WAVE
        </strong>
        <div className="nightmare-takeover__wave-number" aria-hidden="true">
          <span>W</span>
          <b>{paddedWave}</b>
        </div>
        <p>{subcopy}</p>
      </div>

      <div className="nightmare-takeover__dropout" aria-hidden="true" />
    </div>
  );
}
