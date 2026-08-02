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
  flameFuel: number;
  napalmCooldown: number;
  tankIntegrity: number;
  hostileCount: number;
  missionTotal: number;
  missionRemaining: number;
  missionTargetName?: string;
  damageFlash: boolean;
  radioEnabled: boolean;
  radioTrackName: string;
  radioSourceLabel: string;
  onToggleRadio: () => void;
  onNextTrack: () => void;
  onLoadLocalTrack: (file: File) => void;
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
  flameFuel,
  napalmCooldown,
  tankIntegrity,
  hostileCount,
  missionTotal,
  missionRemaining,
  missionTargetName,
  damageFlash,
  radioEnabled,
  radioTrackName,
  radioSourceLabel,
  onToggleRadio,
  onNextTrack,
  onLoadLocalTrack,
}: HUDProps) {
  const weaponModes: WeaponMode[] = ['cannon', 'machinegun', 'flamethrower', 'napalm'];

  return (
    <>
      <ScoreCounter targetScore={score} />
      <div className="hud" data-game-ui>
        <div className="hud-call-sign">
          <span>AO CLEAN SWEEP // 1968</span>
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
                {mode === 'flamethrower' && (
                  <small>{Math.round(flameFuel * 100)}%</small>
                )}
              </button>
            ))}
          </div>
          <div className="flame-fuel" aria-label={`Flamethrower fuel ${Math.round(flameFuel * 100)} percent`}>
            <span style={{ width: `${flameFuel * 100}%` }} />
          </div>
        </div>

        <div className="hud-section">
          <span className="hud-kicker">Sector scan</span>
          <div className="hud-stats">
            <span><strong>{fileCount}</strong> files</span>
            <span><strong>{folderCount}</strong> portals</span>
          </div>
        </div>

        <div className={`mission-order ${missionTotal > 0 && missionRemaining === 0 ? 'is-complete' : ''}`}>
          <div className="mission-order-heading">
            <span className="hud-kicker">Mission order</span>
            {missionTotal > 0 && (
              <strong>{missionTotal - missionRemaining}/{missionTotal}</strong>
            )}
          </div>
          {missionTotal === 0 ? (
            <span>No file targets in this sector.</span>
          ) : missionRemaining > 0 ? (
            <>
              <b>Destroy the objective file cache</b>
              <span>{missionRemaining} file-hut{missionRemaining === 1 ? '' : 's'} remaining</span>
              {missionTargetName && <small>Priority target · {missionTargetName}</small>}
              <div className="mission-meter" aria-label={`${missionTotal - missionRemaining} of ${missionTotal} objective files destroyed`}>
                <span style={{ width: `${((missionTotal - missionRemaining) / missionTotal) * 100}%` }} />
              </div>
            </>
          ) : (
            <>
              <b>Objective destroyed</b>
              <span>File cache eliminated · sector secure</span>
              <div className="mission-meter" aria-label="Mission objective complete">
                <span style={{ width: '100%' }} />
              </div>
            </>
          )}
        </div>

        <div className={`armor-status ${damageFlash ? 'is-hit' : ''}`}>
          <div className="armor-status-copy">
            <span className="hud-kicker">Armor integrity</span>
            <strong>{Math.round(tankIntegrity)}%</strong>
          </div>
          <div className="armor-meter" aria-label={`Tank armor integrity ${Math.round(tankIntegrity)} percent`}>
            <span style={{ width: `${tankIntegrity}%` }} />
          </div>
          <small>{hostileCount} hostile{hostileCount === 1 ? '' : 's'} active</small>
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
          <div className="field-radio-portrait" aria-hidden="true">
            <img src="/images/field-radio-sergeant.png" alt="" />
            <span />
          </div>
          <div className="field-radio-copy">
            <span className="hud-kicker">Field radio</span>
            <b>Air Cav Actual</b>
            <strong>{radioTrackName}</strong>
            <small>{radioSourceLabel}</small>
          </div>
          <div className="field-radio-actions">
            <button type="button" onClick={onToggleRadio}>
              {radioEnabled ? 'Mute' : 'Play'}
            </button>
            <button type="button" onClick={onNextTrack} title="Next original track">
              Next
            </button>
            <label className="field-radio-load" title="Load a legally obtained local copy of Voodoo Child (Slight Return)">
              Load
              <input
                type="file"
                accept="audio/*"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onLoadLocalTrack(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="controls-ribbon" aria-label="Game controls" data-game-ui>
        <span><kbd>W/S</kbd> Drive</span>
        <span><kbd>A/D</kbd> Steer</span>
        <span><kbd>Mouse</kbd> Aim</span>
        <span><kbd>Hold Click</kbd> Auto fire</span>
        <span><kbd>1/2/3/4</kbd> Weapons</span>
        <span><kbd>X</kbd> Purge armed</span>
        <span><kbd>Esc</kbd> Disarm</span>
        <span><kbd>M</kbd> Radio</span>
        <span><kbd>⌘/Ctrl Z</kbd> Undo</span>
      </div>
      <div className={`damage-vignette ${damageFlash ? 'is-visible' : ''}`} aria-hidden="true" />
    </>
  );
}
