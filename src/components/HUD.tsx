import { formatBytes } from '../lib/format';
import { LIFT_CALLS } from '../lib/embassyLift';
import { CooldownReadout } from './HUD/CooldownReadout';
import { ScoreCounter } from './HUD/ScoreCounter';
import { BossAllyStatus } from './HUD/BossAllyStatus';
import { FieldKitPanel, type FieldKitPanelProps } from './HUD/FieldKitPanel';
import type { FieldProtection } from '../hooks/useZombieEpilogue';
import {
  type CannonReloadState,
  type MachineGunHeatState,
  WeaponMode,
  WEAPON_LABELS,
} from '../lib/weapons';
import type { FinalBossAllyCombatant } from '../lib/finalBossAllies';
import './HUD.css';
import type { EmbassyArchive } from '../lib/embassyDefense';

export type BonusPhase = 'locked' | 'warning' | 'combat' | 'intermission' | 'victory' | 'defeat';

const NIGHTMARE_PHASE_COPY: Record<Exclude<BonusPhase, 'locked'>, {
  headline: string;
  detail: string;
}> = {
  warning: {
    headline: 'Nightmare protocol armed',
    detail: 'Defend the front approaches · keep at least one archive standing',
  },
  combat: {
    headline: 'Hold the line',
    detail: 'Protect the files and survive · no real files are at risk',
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
    detail: 'Defensive line collapsed · re-form the squad',
  },
};

// The brief describes the actual spawn schedule: no promises about a
// particular door, since the surviving files and allies can change it.
const NEXT_CONTACT = [
  '', 'First contact · watch the entry road', 'Two pushes · Rook brings four defenders',
  'Three groups · keep moving between the doors', 'Command contact · two escort groups follow',
] as const;

interface HUDProps {
  liftCall?: 'approach'|'unload'|'away'|null;
  fieldKit?: Omit<FieldKitPanelProps, 'wave'|'archives'>;
  fieldProtection?: FieldProtection | null;
  cleanupDesk?: boolean;
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
  napalmUntil: number;
  cannonReload: CannonReloadState;
  machineGunHeat: MachineGunHeatState;
  tankIntegrity: number;
  armorPlate?:number;
  hostileCount: number;
  friendlyCount: number;
  missionTotal: number;
  campaignBrief?: string;
  missionRemaining: number;
  missionTargetName?: string;
  missionOriginalName?: string;
  damageFlash: boolean;
  radioMuted: boolean;
  radioPlaying: boolean;
  radioTrackName: string;
  aircraftRadio?:string;
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
  defenseArchives?: readonly EmbassyArchive[];
  defenseFailed?: boolean;
  eagleUntil: number;
  eagleActive: boolean;
  eagleTargeting: boolean;
  onCallEagle: () => void;
  onRetryBonus: () => void;
  onExitSession: () => void;
  bossAllies: readonly FinalBossAllyCombatant[];
  bossAlliesVisible: boolean;
}

export function HUD({
  fieldKit, fieldProtection,
  cleanupDesk=false,
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
  napalmUntil,
  cannonReload,
  machineGunHeat,
  tankIntegrity,armorPlate=0,
  hostileCount,
  friendlyCount,
  missionTotal,
  campaignBrief,
  missionRemaining,
  missionTargetName,
  missionOriginalName,
  damageFlash,
  radioMuted,
  radioPlaying,
  radioTrackName,
  aircraftRadio,
  radioSourceLabel,
  onToggleRadioMute,
  bonusPhase,
  liftCall,
  bonusWave,
  bonusTotalWaves,
  bonusRemaining,
  bonusBreaches,
  bonusMaxBreaches,
  bonusBossHealth,
  bonusBossMaxHealth,
  defenseArchives = [],
  defenseFailed = false,
  eagleUntil,
  eagleActive,
  eagleTargeting,
  onCallEagle,
  onRetryBonus,
  onExitSession,
  bossAllies,
  bossAlliesVisible,
}: HUDProps) {
  const weaponModes: WeaponMode[] = ['cannon', 'machinegun', 'flamethrower', 'napalm'];
  const nightmareUnlocked = bonusPhase !== 'locked';
  const nightmareCopy = bonusPhase === 'locked' ? null
    : bonusPhase === 'defeat' && defenseFailed
      ? { headline: 'Archives overrun', detail: 'The files were lost · re-form the defensive line' }
      : NIGHTMARE_PHASE_COPY[bonusPhase];
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
    : bonusPhase === 'intermission'
      ? { label: 'Next wave', value: `${Math.min(totalWaves, displayedWave + 1)} / ${totalWaves}`,
          ariaLabel: `Next wave ${Math.min(totalWaves, displayedWave + 1)} of ${totalWaves}` }
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
            ariaLabel: defenseFailed ? 'Undead horde overran the archives' : 'Undead horde overran the tank',
          }
      : {
          label: 'Undead remaining',
          value: String(remainingUndead),
          ariaLabel: `${remainingUndead} undead remaining`,
        };
  const rearming = eagleUntil > 0;
  const eagleReady = bonusPhase === 'combat'
    && remainingUndead > 0
    && !eagleActive
    && !rearming;
  const eagleStatus = bonusPhase === 'victory'
    ? 'Nightmare contained'
    : bonusPhase === 'defeat'
      ? 'Support lost'
    : eagleTargeting
      ? 'Designating target'
    : eagleActive
      ? 'Strafe active'
      : rearming
        ? 'Rearming'
        : eagleReady
          ? 'Ready'
          : 'Stand by';
  const eagleButtonLabel = eagleReady
    ? eagleTargeting
      ? 'Cancel designator'
      : 'Mark strafe lane'
    : eagleActive
      ? 'Strafe active'
      : rearming
        ? 'Rearming'
        : bonusPhase === 'victory'
          ? 'Mission complete'
          : bonusPhase === 'defeat'
            ? 'Sector overrun'
          : 'Stand by';

  return (
    <>
      {!cleanupDesk&&<ScoreCounter targetScore={score} />}
      {bonusPhase==='intermission' && fieldKit && <FieldKitPanel {...fieldKit}
        wave={Math.min(totalWaves,displayedWave+1)} archives={defenseArchives} />}
      <BossAllyStatus allies={bossAllies} visible={bossAlliesVisible} />
      <div className={`hud ${nightmareUnlocked ? 'is-nightmare' : ''}`} data-game-ui>
        {markedCount > 0 && (
          <section className="hud-targets is-armed" aria-label="Armed file targets">
            <div className="hud-armed-heading">
              <strong role="status">{markedCount} {markedCount === 1 ? 'file' : 'files'} {cleanupDesk?'nominated':'armed'} · {formatBytes(markedBytes)}</strong>
              <button type="button" className="hud-disarm" onClick={onClearMarked}
                aria-label="Disarm targets" aria-keyshortcuts="Escape">
                Disarm <kbd>Esc</kbd>
              </button>
            </div>
            <span>{cleanupDesk?'Review shortlist to inspect the exact paths. No files have moved.':<>Hit an armed file again to trash it. <kbd>X</kbd> trashes all armed files.</>}</span>
          </section>
        )}

        <section aria-label="Current objective" className={nightmareUnlocked
          ? `mission-order nightmare-order is-${bonusPhase}`
          : `mission-order ${!campaignBrief && missionTotal > 0 && missionRemaining === 0 ? 'is-complete' : ''}`}>
          <div className="mission-order-heading">
            <span className="hud-kicker">
              {nightmareUnlocked ? 'Saigon Nightmare // 1975' : campaignBrief ? 'Campaign objective' : cleanupDesk?'Cleanup Desk':'Bonus cleanup'}
            </span>
            {nightmareUnlocked ? (
              <strong>
                {bonusPhase === 'victory'
                  ? `${totalWaves}/${totalWaves} clear`
                  : `Wave ${displayedWave}/${totalWaves}`}
              </strong>
            ) : !campaignBrief && missionTotal > 0 && (
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
                <span>{bonusPhase === 'intermission' ? NEXT_CONTACT[Math.min(4, displayedWave + 1)]
                  : bonusPhase==='combat' && liftCall ? LIFT_CALLS[liftCall] : nightmareCopy.detail}</span>
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
                <strong className={eagleReady ? 'is-ready' : ''}>{eagleStatus==='Rearming'?<>Rearm <CooldownReadout until={eagleUntil}/></>:eagleStatus}</strong>
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
              <div className="embassy-file-health" aria-label="Embassy file defense">
                {defenseArchives.map(archive => <div key={archive.id}
                  className={bonusPhase === 'combat' && archive.health > 0 && archive.underAttackUntil > Date.now() ? 'is-under-attack' : ''}>
                  <span>{archive.label}</span><strong>{Math.ceil(archive.health / archive.maxHealth * 100)}%</strong>
                  <meter min={0} max={archive.maxHealth} value={archive.health}
                    aria-label={`${archive.label} integrity`} />
                  {bonusPhase === 'combat' && archive.health > 0 && archive.underAttackUntil > Date.now()
                    && <em role="status">Under attack · follow the pulsing radar ring</em>}
                </div>)}
              </div>
              {bonusPhase==='combat' && fieldProtection && <div className="field-protection" role="status">
                {fieldProtection.target==='hull'?'Hull plate':`Brace · ${defenseArchives.find(a=>a.id===fieldProtection.target)?.label??'archive'}`}
                <b>{fieldProtection.spent?'Absorbed one hit':'Ready · one hit'}</b>
              </div>}
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
          ) : campaignBrief ? (
            <>
              <p className="campaign-brief" role="status">{campaignBrief}</p>
            </>
          ) : cleanupDesk ? (<><b>Nominate selected files</b><span>Aim at a numbered hut and click with the cannon. Review shortlist when ready. Shots, X and repeat hits never move a file.</span></>) : missionTotal === 0 ? (
            <>
              <b>No safe bonus target</b>
              <span>No byte-confirmed duplicate in this sector.</span>
            </>
          ) : missionRemaining > 0 ? (
            <>
              <b>Trash the confirmed duplicate</b>
              {missionTargetName && <div className="mission-file" title={missionTargetName}>
                <span>Target</span><strong>{missionTargetName}</strong>
              </div>}
              {missionOriginalName && <div className="mission-file" title={missionOriginalName}>
                <span>Keep</span><strong>{missionOriginalName}</strong>
              </div>}
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
          {!nightmareUnlocked && !campaignBrief && !cleanupDesk && markedCount === 0 && (
            <div className="mission-trigger-guide">First hit arms a file. Second hit trashes it.</div>
          )}
        </section>

        <div className={`armor-status ${damageFlash ? 'is-hit' : ''}`}>
          <div className="armor-status-copy">
            <span className="hud-kicker">Armor integrity</span>
            <strong>{Math.round(tankIntegrity)}%</strong>
          </div>
          <div className="armor-meter" aria-label={`Tank armor integrity ${Math.round(tankIntegrity)} percent`}>
            <span style={{ width: `${tankIntegrity}%` }} />
          </div>
          {armorPlate>0&&<small className="surplus-plate" aria-label={'Protective plate: '+armorPlate}>◆ Plate +{armorPlate}</small>}
          <small>
            {hostileCount} hostile{hostileCount === 1 ? '' : 's'} · {friendlyCount}{' '}
            {friendlyCount === 1 ? 'friendly' : 'friendlies'} active
          </small>
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
                {mode === 'napalm' && napalmUntil > 0 && (
                  <small><CooldownReadout until={napalmUntil}/></small>
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

        <div className={`field-radio ${radioMuted ? 'is-muted' : ''}`}>
          <div className="field-radio-portrait" aria-hidden="true">
            <img src="/images/field-radio-sergeant.png" alt="" />
            <span />
          </div>
          <div className="field-radio-copy">
            <span className="hud-kicker">Field radio · Air Cav Actual</span>
            {aircraftRadio && <span className="campaign-air-call" aria-live="polite">{aircraftRadio}</span>}
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

        {!nightmareUnlocked && (
          <dl className="hud-log">
            <div>
              <dt>{campaignBrief ? 'Field' : 'Sector'}</dt>
              <dd>{fileCount} files{!campaignBrief && ` · ${folderCount} portals`}</dd>
            </div>
            <div>
              <dt>This run</dt>
              <dd>{cleanupDesk?'No files changed in the field':`${deletedCount} trashed · ${formatBytes(deletedBytes)} freed`}</dd>
            </div>
          </dl>
        )}

      </div>

      <div className="controls-ribbon" aria-label="Game controls" data-game-ui>
        <span><kbd>W/S</kbd> Drive</span>
        <span><kbd>A/D</kbd> Steer</span>
        <span><kbd>Mouse</kbd> Aim</span>
        <span><kbd>Hold Click</kbd> Auto fire</span>
        <span><kbd>1/2/3/4</kbd> Weapons</span>
        {!nightmareUnlocked && !cleanupDesk && <span><kbd>X</kbd> Purge armed</span>}
        <span><kbd>Esc</kbd> Disarm</span>
        <span><kbd>M</kbd> Mute music</span>
        {!nightmareUnlocked && !cleanupDesk && <span><kbd>⌘/Ctrl Z</kbd> Undo</span>}
        {nightmareUnlocked && (
          <span><kbd>E</kbd> Eagle Strafe <kbd>Click</kbd> Confirm</span>
        )}
      </div>
      <div className={`damage-vignette ${damageFlash ? 'is-visible' : ''}`} aria-hidden="true" />
      {bonusPhase === 'defeat' && (
        <div className="nightmare-defeat-overlay" data-game-ui role="dialog" aria-modal="true" aria-labelledby="nightmare-defeat-title">
          <section>
            <span>Mission failed // embassy defense</span>
            <h2 id="nightmare-defeat-title">{defenseFailed ? 'The embassy files were overrun' : 'The horde breached the tank'}</h2>
            <p>{defenseFailed ? 'No in-game archives survived. Your real files are unchanged.' : 'Three close-range strikes collapsed the defensive line.'} Re-form the squad and hold the compound again.</p>
            <div>
              <strong>{defenseFailed ? `${defenseArchives.filter(archive => archive.health <= 0).length}/${defenseArchives.length}` : `${breachCount}/${maximumBreaches}`}</strong>
              <small>{defenseFailed ? 'archives lost' : 'critical breaches'}</small>
            </div>
            <button type="button" onClick={onRetryBonus}>Retry nightmare defense</button>
            <button type="button" onClick={onExitSession}>Return to menu</button>
          </section>
        </div>
      )}
    </>
  );
}
