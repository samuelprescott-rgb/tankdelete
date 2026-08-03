import { formatBytes } from '../lib/format';
import { ScoreCounter } from './HUD/ScoreCounter';
import { BossAllyStatus } from './HUD/BossAllyStatus';
import {
  type CannonReloadState,
  type MachineGunHeatState,
  WeaponMode,
  WEAPON_LABELS,
} from '../lib/weapons';
import type { FinalBossAllyCombatant } from '../lib/finalBossAllies';
import './HUD.css';

export type BonusPhase = 'locked' | 'warning' | 'combat' | 'intermission' | 'victory' | 'defeat';

const NIGHTMARE_PHASE_COPY: Record<Exclude<BonusPhase, 'locked'>, {
  headline: string;
  detail: string;
}> = {
  warning: {
    headline: 'Nightmare protocol armed',
    detail: 'Undead Axis contact inbound · hold the sector',
  },
  combat: {
    headline: 'Hold the line',
    detail: 'Break the horde before it reaches the tank',
  },
  intermission: {
    headline: 'Wave suppressed',
    detail: 'Next horde forming at the jungle line',
  },
  victory: {
    headline: 'Nightmare survived',
    detail: 'All waves neutralized · nightmare contained',
  },
  defeat: {
    headline: 'Armor line overrun',
    detail: 'Third breach confirmed · sector defense collapsed',
  },
};

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
  cannonReload: CannonReloadState;
  machineGunHeat: MachineGunHeatState;
  tankIntegrity: number;
  hostileCount: number;
  friendlyCount: number;
  missionTotal: number;
  missionRemaining: number;
  missionTargetName?: string;
  missionOriginalName?: string;
  damageFlash: boolean;
  radioMuted: boolean;
  radioPlaying: boolean;
  radioTrackName: string;
  radioSourceLabel: string;
  onToggleRadioMute: () => void;
  bonusPhase: BonusPhase;
  bonusWave: number;
  bonusTotalWaves: number;
  bonusRemaining: number;
  bonusBreaches: number;
  bonusMaxBreaches: number;
  bonusBossHealth?: number;
  bonusBossMaxHealth?: number;
  eagleCooldown: number;
  eagleActive: boolean;
  eagleTargeting: boolean;
  onCallEagle: () => void;
  onRetryBonus: () => void;
  bossAllies: readonly FinalBossAllyCombatant[];
  bossAlliesVisible: boolean;
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
  cannonReload,
  machineGunHeat,
  tankIntegrity,
  hostileCount,
  friendlyCount,
  missionTotal,
  missionRemaining,
  missionTargetName,
  missionOriginalName,
  damageFlash,
  radioMuted,
  radioPlaying,
  radioTrackName,
  radioSourceLabel,
  onToggleRadioMute,
  bonusPhase,
  bonusWave,
  bonusTotalWaves,
  bonusRemaining,
  bonusBreaches,
  bonusMaxBreaches,
  bonusBossHealth,
  bonusBossMaxHealth,
  eagleCooldown,
  eagleActive,
  eagleTargeting,
  onCallEagle,
  onRetryBonus,
  bossAllies,
  bossAlliesVisible,
}: HUDProps) {
  const weaponModes: WeaponMode[] = ['cannon', 'machinegun', 'flamethrower', 'napalm'];
  const nightmareUnlocked = bonusPhase !== 'locked';
  const nightmareCopy = bonusPhase === 'locked' ? null : NIGHTMARE_PHASE_COPY[bonusPhase];
  const totalWaves = Math.max(1, bonusTotalWaves);
  const displayedWave = Math.min(totalWaves, Math.max(1, bonusWave));
  const remainingUndead = Math.max(0, bonusRemaining);
  const maximumBreaches = Math.max(1, bonusMaxBreaches);
  const breachCount = Math.min(maximumBreaches, Math.max(0, bonusBreaches));
  const bossHealth = Math.max(0, bonusBossHealth ?? 0);
  const bossMaxHealth = Math.max(0, bonusBossMaxHealth ?? 0);
  const bossHealthPercent = bossMaxHealth > 0
    ? Math.min(100, (bossHealth / bossMaxHealth) * 100)
    : 0;
  const contactStatus = bonusPhase === 'warning'
    ? {
        label: 'Contacts',
        value: 'Inbound',
        ariaLabel: 'Undead contacts inbound',
      }
    : bonusPhase === 'victory'
      ? {
          label: 'Horde status',
          value: 'Contained',
          ariaLabel: 'Undead horde contained',
        }
      : bonusPhase === 'defeat'
        ? {
            label: 'Horde status',
            value: 'Overrun',
            ariaLabel: 'Undead horde overran the tank',
          }
      : {
          label: 'Undead remaining',
          value: String(remainingUndead),
          ariaLabel: `${remainingUndead} undead remaining`,
        };
  const displayedCooldown = Math.max(0, eagleCooldown);
  const eagleReady = bonusPhase === 'combat'
    && remainingUndead > 0
    && !eagleActive
    && displayedCooldown <= 0;
  const eagleStatus = bonusPhase === 'victory'
    ? 'Nightmare contained'
    : bonusPhase === 'defeat'
      ? 'Support lost'
    : eagleTargeting
      ? 'Designating target'
    : eagleActive
      ? 'Strafe active'
      : displayedCooldown > 0
        ? `Rearm ${displayedCooldown.toFixed(1)}s`
        : eagleReady
          ? 'Ready'
          : 'Stand by';
  const eagleButtonLabel = eagleReady
    ? eagleTargeting
      ? 'Cancel designator'
      : 'Mark strafe lane'
    : eagleActive
      ? 'Strafe active'
      : displayedCooldown > 0
        ? 'Rearming'
        : bonusPhase === 'victory'
          ? 'Mission complete'
          : bonusPhase === 'defeat'
            ? 'Sector overrun'
          : 'Stand by';

  return (
    <>
      <ScoreCounter targetScore={score} />
      <BossAllyStatus allies={bossAllies} visible={bossAlliesVisible} />
      <div className={`hud ${nightmareUnlocked ? 'is-nightmare' : ''}`} data-game-ui>
        <div className="hud-call-sign">
          <span>AO CLEAN SWEEP // 1968</span>
          <strong>TANKDELETE</strong>
        </div>

        <div className={`field-radio ${radioMuted ? 'is-muted' : ''}`}>
          <div className="field-radio-portrait" aria-hidden="true">
            <img src="/images/field-radio-sergeant.png" alt="" />
            <span />
          </div>
          <div className="field-radio-copy">
            <span className="hud-kicker">Field radio · Air Cav Actual</span>
            <strong>{radioTrackName}</strong>
            <small>
              {radioMuted ? 'Muted' : radioPlaying ? 'Playing' : 'Ready to start'} · {radioSourceLabel}
            </small>
          </div>
          <button
            type="button"
            className="field-radio-mute"
            onClick={onToggleRadioMute}
            aria-label={radioMuted ? 'Unmute music' : radioPlaying ? 'Mute music' : 'Start music'}
            aria-pressed={radioMuted}
          >
            {radioMuted ? 'Unmute' : radioPlaying ? 'Mute' : 'Start'}
          </button>
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
                {mode === 'cannon' && !cannonReload.ready && (
                  <small>{cannonReload.remainingSeconds.toFixed(1)}s</small>
                )}
                {mode === 'machinegun' && machineGunHeat.overheated && (
                  <small>HOT {machineGunHeat.recoveryRemainingSeconds.toFixed(1)}s</small>
                )}
              </button>
            ))}
          </div>
          {weaponMode === 'cannon' && (
            <div className="weapon-cycle">
              <div>
                <span>M41 breech</span>
                <strong>{cannonReload.ready ? 'READY' : `RELOAD ${cannonReload.remainingSeconds.toFixed(1)}s`}</strong>
              </div>
              <i aria-label={cannonReload.ready ? 'Cannon ready' : `Cannon reload ${Math.round(cannonReload.progress * 100)} percent`}>
                <b style={{ width: `${cannonReload.progress * 100}%` }} />
              </i>
            </div>
          )}
          {weaponMode === 'machinegun' && (
            <div className={`weapon-cycle machinegun-cycle ${machineGunHeat.overheated ? 'is-overheated' : ''}`}>
              <div>
                <span>M37 heat</span>
                <strong>
                  {machineGunHeat.overheated
                    ? `COOL ${machineGunHeat.recoveryRemainingSeconds.toFixed(1)}s`
                    : machineGunHeat.firing
                      ? `BURST ${machineGunHeat.burstRemainingSeconds.toFixed(1)}s`
                      : 'READY'}
                </strong>
              </div>
              <i aria-label={machineGunHeat.overheated
                ? `Machine gun overheated, ${machineGunHeat.recoveryRemainingSeconds.toFixed(1)} seconds recovery remaining`
                : `Machine gun heat ${Math.round(machineGunHeat.heat * 100)} percent`}>
                <b style={{ width: `${machineGunHeat.heat * 100}%` }} />
              </i>
            </div>
          )}
          {weaponMode === 'flamethrower' && (
            <div className="flame-fuel" aria-label={`Flamethrower fuel ${Math.round(flameFuel * 100)} percent`}>
              <span style={{ width: `${flameFuel * 100}%` }} />
            </div>
          )}
        </div>

        {!nightmareUnlocked && (
          <div className="hud-section">
            <span className="hud-kicker">Sector scan</span>
            <div className="hud-stats">
              <span><strong>{fileCount}</strong> files</span>
              <span><strong>{folderCount}</strong> portals</span>
            </div>
          </div>
        )}

        <div className={nightmareUnlocked
          ? `mission-order nightmare-order is-${bonusPhase}`
          : `mission-order ${missionTotal > 0 && missionRemaining === 0 ? 'is-complete' : ''}`}>
          <div className="mission-order-heading">
            <span className="hud-kicker">
              {nightmareUnlocked ? 'After-action // Nightmare' : 'Bonus cleanup'}
            </span>
            {nightmareUnlocked ? (
              <strong>
                {bonusPhase === 'victory'
                  ? `${totalWaves}/${totalWaves} clear`
                  : `Wave ${displayedWave}/${totalWaves}`}
              </strong>
            ) : missionTotal > 0 && (
              <strong>{missionTotal - missionRemaining}/{missionTotal}</strong>
            )}
          </div>
          {nightmareUnlocked && nightmareCopy ? (
            <>
              <div
                className="nightmare-phase-copy"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <b>{nightmareCopy.headline}</b>
                <span>{nightmareCopy.detail}</span>
              </div>
              <div
                className="nightmare-count"
                aria-label={contactStatus.ariaLabel}
              >
                <span>{contactStatus.label}</span>
                <strong>{contactStatus.value}</strong>
              </div>
              <div className="eagle-support-status">
                <span>Eagle Strafe</span>
                <strong className={eagleReady ? 'is-ready' : ''}>{eagleStatus}</strong>
              </div>
              {bossMaxHealth > 0 && (
                <div
                  className="nightmare-boss-health"
                  aria-label={`Command contact vitality ${Math.round(bossHealthPercent)} percent`}
                >
                  <div>
                    <span>Command contact</span>
                    <strong>{Math.ceil(bossHealth).toLocaleString()}</strong>
                  </div>
                  <i><b style={{ width: `${bossHealthPercent}%` }} /></i>
                </div>
              )}
              <div className={`nightmare-breaches ${bonusPhase === 'defeat' ? 'is-overrun' : ''}`}>
                <div>
                  <span>Tank breaches</span>
                  <strong>{breachCount}/{maximumBreaches}</strong>
                </div>
                <div
                  className="nightmare-breach-pips"
                  aria-label={`${breachCount} of ${maximumBreaches} tank breaches sustained`}
                >
                  {Array.from({ length: maximumBreaches }, (_, index) => (
                    <i key={index} className={index < breachCount ? 'is-spent' : ''} />
                  ))}
                </div>
              </div>
              {bonusPhase === 'defeat' ? (
                <button
                  type="button"
                  className="nightmare-retry-button"
                  onClick={onRetryBonus}
                >
                  Retry defense
                </button>
              ) : (
                <button
                  type="button"
                  className={`nightmare-eagle-button ${eagleTargeting ? 'is-targeting' : ''}`}
                  onClick={onCallEagle}
                  disabled={!eagleReady}
                  aria-label={eagleTargeting
                    ? 'Cancel Eagle Strafe target designator'
                    : eagleReady
                      ? 'Arm Eagle Strafe target designator'
                      : `Eagle Strafe ${eagleStatus.toLowerCase()}`}
                >
                  <kbd>E</kbd>
                  <span>{eagleButtonLabel}</span>
                </button>
              )}
            </>
          ) : missionTotal === 0 ? (
            <>
              <b>No safe bonus target</b>
              <span>No byte-confirmed duplicate in this sector.</span>
            </>
          ) : missionRemaining > 0 ? (
            <>
              <b>Destroy the confirmed duplicate</b>
              <span>One redundant copy · byte-for-byte match confirmed</span>
              {missionTargetName && <small>Duplicate · {missionTargetName}</small>}
              {missionOriginalName && <small>Matched original · {missionOriginalName}</small>}
              <div className="mission-meter" aria-label={`${missionTotal - missionRemaining} of ${missionTotal} confirmed duplicates destroyed`}>
                <span style={{ width: `${((missionTotal - missionRemaining) / missionTotal) * 100}%` }} />
              </div>
            </>
          ) : (
            <>
              <b>Bonus cleanup complete</b>
              <span>Confirmed duplicate moved to Trash</span>
              <div className="mission-meter" aria-label="Bonus duplicate cleanup complete">
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
          <small>
            {hostileCount} hostile{hostileCount === 1 ? '' : 's'} · {friendlyCount}{' '}
            {friendlyCount === 1 ? 'friendly' : 'friendlies'} active
          </small>
        </div>

        {(!nightmareUnlocked || markedCount > 0) && (
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
        )}

        {!nightmareUnlocked && (
          <div className="hud-section hud-session">
            <span className="hud-kicker">This run</span>
            <div className="hud-stats">
              <span><strong>{deletedCount}</strong> trashed</span>
              <span><strong>{formatBytes(deletedBytes)}</strong> freed</span>
            </div>
          </div>
        )}

      </div>

      <div className="controls-ribbon" aria-label="Game controls" data-game-ui>
        <span><kbd>W/S</kbd> Drive</span>
        <span><kbd>A/D</kbd> Steer</span>
        <span><kbd>Mouse</kbd> Aim</span>
        <span><kbd>Hold Click</kbd> Auto fire</span>
        <span><kbd>1/2/3/4</kbd> Weapons</span>
        <span><kbd>X</kbd> Purge armed</span>
        <span><kbd>Esc</kbd> Disarm</span>
        <span><kbd>M</kbd> Mute music</span>
        <span><kbd>⌘/Ctrl Z</kbd> Undo</span>
        {nightmareUnlocked && (
          <span><kbd>E</kbd> Eagle Strafe <kbd>Click</kbd> Confirm</span>
        )}
      </div>
      <div className={`damage-vignette ${damageFlash ? 'is-visible' : ''}`} aria-hidden="true" />
      {bonusPhase === 'defeat' && (
        <div className="nightmare-defeat-overlay" data-game-ui role="dialog" aria-modal="true" aria-labelledby="nightmare-defeat-title">
          <section>
            <span>Mission failed // armor overrun</span>
            <h2 id="nightmare-defeat-title">The horde breached the tank</h2>
            <p>Three close-range strikes collapsed the defensive line. Re-form the squad and hold the sector again.</p>
            <div>
              <strong>{breachCount}/{maximumBreaches}</strong>
              <small>critical breaches</small>
            </div>
            <button type="button" onClick={onRetryBonus}>Retry nightmare defense</button>
          </section>
        </div>
      )}
    </>
  );
}
