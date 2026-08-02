import { formatBytes } from '../lib/format';
import { ScoreCounter } from './HUD/ScoreCounter';
import { WeaponMode, WEAPON_LABELS } from '../lib/weapons';
import './HUD.css';

interface HUDProps {
  deletedCount: number;
  deletedBytes: number;
  score: number;
  fileCount: number;
  folderCount: number;
  markedCount: number;
  markedBytes: number;
  onClearMarked: () => void;
  weaponMode: WeaponMode;
  onWeaponChange: (mode: WeaponMode) => void;
  napalmCooldown: number;
  radioEnabled: boolean;
  radioTrackName: string;
  onToggleRadio: () => void;
  onNextTrack: () => void;
}

export function HUD({
  deletedCount,
  deletedBytes,
  score,
  fileCount,
  folderCount,
  markedCount,
  markedBytes,
  onClearMarked,
  weaponMode,
  onWeaponChange,
  napalmCooldown,
  radioEnabled,
  radioTrackName,
  onToggleRadio,
  onNextTrack,
}: HUDProps) {
  const weaponModes: WeaponMode[] = ['cannon', 'flamethrower', 'napalm'];

  return (
    <>
      <ScoreCounter targetScore={score} />
      <div className="hud" data-game-ui>
        <div className="hud-call-sign">
          <span>FIELD OPS // 1968</span>
          <strong>TANKDELETE</strong>
        </div>

        <div className="hud-section">
          <span className="hud-kicker">Weapons station</span>
          <div className="weapon-selector">
            {weaponModes.map((mode, index) => (
              <button
                key={mode}
                type="button"
                className={weaponMode === mode ? 'is-selected' : ''}
                onClick={() => onWeaponChange(mode)}
                aria-pressed={weaponMode === mode}
              >
                <span>{index + 1}</span>
                {WEAPON_LABELS[mode]}
                {mode === 'napalm' && napalmCooldown > 0 && (
                  <small>{napalmCooldown.toFixed(1)}s</small>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="hud-section">
          <span className="hud-kicker">Sector scan</span>
          <div className="hud-stats">
            <span><strong>{fileCount}</strong> files</span>
            <span><strong>{folderCount}</strong> portals</span>
          </div>
        </div>

        <div className={`hud-targets ${markedCount > 0 ? 'is-armed' : ''}`}>
          <span className="hud-kicker">Targeting array</span>
          {markedCount > 0 ? (
            <>
              <strong>{markedCount} armed · {formatBytes(markedBytes)}</strong>
              <span>Shoot again to trash, or purge the full queue.</span>
              <button type="button" className="hud-disarm" onClick={onClearMarked}>
                Disarm targets
              </button>
            </>
          ) : (
            <span>Fire once at a file to mark it.</span>
          )}
        </div>

        <div className="hud-section hud-session">
          <span className="hud-kicker">This run</span>
          <div className="hud-stats">
            <span><strong>{deletedCount}</strong> trashed</span>
            <span><strong>{formatBytes(deletedBytes)}</strong> freed</span>
          </div>
        </div>

        <div className="field-radio">
          <div>
            <span className="hud-kicker">Field radio</span>
            <strong>{radioTrackName}</strong>
            <small>Original procedural transmission</small>
          </div>
          <div className="field-radio-actions">
            <button type="button" onClick={onToggleRadio}>
              {radioEnabled ? 'Mute' : 'Play'}
            </button>
            <button type="button" onClick={onNextTrack} title="Next original track">
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="controls-ribbon" aria-label="Game controls" data-game-ui>
        <span><kbd>W/S</kbd> Drive</span>
        <span><kbd>A/D</kbd> Steer</span>
        <span><kbd>Mouse</kbd> Aim</span>
        <span><kbd>Click</kbd> Fire</span>
        <span><kbd>1/2/3</kbd> Weapons</span>
        <span><kbd>X</kbd> Purge armed</span>
        <span><kbd>Esc</kbd> Disarm</span>
        <span><kbd>M</kbd> Radio</span>
        <span><kbd>⌘/Ctrl Z</kbd> Undo</span>
      </div>
    </>
  );
}
