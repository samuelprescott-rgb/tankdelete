import { useEffect, useId, useRef } from 'react';
import { BRIGHTNESS_RANGE } from '../hooks/useGameSettings';
import './SettingsControl.css';

export interface SettingsControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brightness: number;
  onBrightnessChange: (value: number) => void;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  musicVolume: number;
  onMusicVolumeChange: (value: number) => void;
  weaponsVolume: number;
  onWeaponsVolumeChange: (value: number) => void;
  ambienceVolume: number;
  onAmbienceVolumeChange: (value: number) => void;
  voiceEffectsVolume: number;
  onVoiceEffectsVolumeChange: (value: number) => void;
  onResetDefaults: () => void;
}

interface SettingsSliderProps {
  id: string;
  label: string;
  detail: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const clamp = (value: number, min: number, max: number) => (
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
);

function SettingsSlider({
  id,
  label,
  detail,
  value,
  min,
  max,
  step,
  onChange,
}: SettingsSliderProps) {
  const safeValue = clamp(value, min, max);
  const fill = ((safeValue - min) / (max - min)) * 100;

  return (
    <div className="settings-control__slider-row">
      <div className="settings-control__slider-copy">
        <label htmlFor={id}>{label}</label>
        <span id={`${id}-description`}>{detail}</span>
      </div>
      <output htmlFor={id} aria-label={`${label} value`}>
        {Math.round(safeValue * 100)}%
      </output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        aria-describedby={`${id}-description`}
        aria-valuetext={`${Math.round(safeValue * 100)} percent`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={{ '--settings-fill': `${fill}%` } as React.CSSProperties}
      />
    </div>
  );
}

export function SettingsControl({
  open,
  onOpenChange,
  brightness,
  onBrightnessChange,
  masterVolume,
  onMasterVolumeChange,
  musicVolume,
  onMusicVolumeChange,
  weaponsVolume,
  onWeaponsVolumeChange,
  ambienceVolume,
  onAmbienceVolumeChange,
  voiceEffectsVolume,
  onVoiceEffectsVolumeChange,
  onResetDefaults,
}: SettingsControlProps) {
  const titleId = useId();
  const descriptionId = useId();
  const controlId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('button, input')?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      (previousFocus ?? triggerRef.current)?.focus();
    };
  }, [open, onOpenChange]);

  return (
    <div className={`settings-control${open ? ' is-open' : ''}`} data-game-ui>
      <button
        ref={triggerRef}
        className="settings-control__trigger"
        type="button"
        aria-label="Open display and audio settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={controlId}
        title="Settings"
        onClick={() => onOpenChange(true)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M9.7 2.6h4.6l.5 2.3c.5.2.9.4 1.3.7l2.2-.8 2.3 4-1.7 1.5a7 7 0 0 1 0 1.5l1.7 1.5-2.3 4-2.2-.8c-.4.3-.8.5-1.3.7l-.5 2.3H9.7l-.5-2.3a7 7 0 0 1-1.3-.7l-2.2.8-2.3-4 1.7-1.5a7 7 0 0 1 0-1.5L3.4 8.8l2.3-4 2.2.8c.4-.3.8-.5 1.3-.7l.5-2.3Zm2.3 5.8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
        </svg>
        <span>Settings</span>
      </button>

      {open && (
        <div
          className="settings-control__backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
        >
          <div
            ref={panelRef}
            id={controlId}
            className="settings-control__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <header className="settings-control__header">
              <div>
                <span className="settings-control__eyebrow">FIELD CONSOLE // A/V</span>
                <h2 id={titleId}>Operational Settings</h2>
                <p id={descriptionId}>Adjust visibility and mission audio without leaving the sector.</p>
              </div>
              <button
                className="settings-control__close"
                type="button"
                aria-label="Close settings"
                onClick={() => onOpenChange(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="settings-control__body">
              <section aria-labelledby={`${controlId}-display`}>
                <h3 id={`${controlId}-display`}><span>01</span> Display</h3>
                <SettingsSlider
                  id={`${controlId}-brightness`}
                  label="Brightness"
                  detail="Nightmare scene exposure"
                  value={brightness}
                  min={BRIGHTNESS_RANGE.min}
                  max={BRIGHTNESS_RANGE.max}
                  step={BRIGHTNESS_RANGE.step}
                  onChange={onBrightnessChange}
                />
              </section>

              <section aria-labelledby={`${controlId}-audio`}>
                <h3 id={`${controlId}-audio`}><span>02</span> Audio channels</h3>
                <SettingsSlider
                  id={`${controlId}-master`}
                  label="Master"
                  detail="Complete game mix"
                  value={masterVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={onMasterVolumeChange}
                />
                <SettingsSlider
                  id={`${controlId}-music`}
                  label="Music"
                  detail="Tank radio playback"
                  value={musicVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={onMusicVolumeChange}
                />
                <SettingsSlider
                  id={`${controlId}-weapons`}
                  label="Weapons"
                  detail="Cannon and mounted guns"
                  value={weaponsVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={onWeaponsVolumeChange}
                />
                <SettingsSlider
                  id={`${controlId}-ambience`}
                  label="Ambience"
                  detail="Rain, jungle and horde beds"
                  value={ambienceVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={onAmbienceVolumeChange}
                />
                <SettingsSlider
                  id={`${controlId}-voice-effects`}
                  label="Voice / Effects"
                  detail="Boss voice and combat cues"
                  value={voiceEffectsVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={onVoiceEffectsVolumeChange}
                />
              </section>
            </div>

            <footer className="settings-control__footer">
              <span>ESC closes console</span>
              <button type="button" onClick={onResetDefaults}>Reset defaults</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
