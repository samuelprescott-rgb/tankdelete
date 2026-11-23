import type { FinalBossAllyCombatant } from '../../lib/finalBossAllies';
import './BossAllyStatus.css';

interface BossAllyStatusProps {
  allies: readonly FinalBossAllyCombatant[];
  visible: boolean;
}

const ROLE_LABELS: Record<FinalBossAllyCombatant['role'], string> = {
  'heavy-gunner': 'SUPPRESSIVE GUNNER',
  'mounted-cavalry': 'MOUNTED STRIKE',
  'rifle-scout': 'RIFLE SCOUT',
};

export function BossAllyStatus({ allies, visible }: BossAllyStatusProps) {
  if (!visible) return null;

  const displayedAllies = allies.filter(ally => ally.status !== 'defeated');
  if (displayedAllies.length === 0) return null;

  return (
    <aside className="boss-allies" data-game-ui aria-label="Final boss allied squad status">
      <div className="boss-allies-heading">
        <span>ALLIED TASK FORCE</span>
        <b>{displayedAllies.filter(ally => ally.alive).length}/3</b>
      </div>
      <div className="boss-allies-list">
        {displayedAllies.map(ally => {
          const healthPercent = ally.maxHealth > 0
            ? Math.max(0, Math.min(100, ally.health / ally.maxHealth * 100))
            : 0;
          return (
            <article
              key={ally.id}
              className={`boss-ally is-${ally.role} is-${ally.status}`}
              aria-label={`${ally.name}, ${Math.round(healthPercent)} percent health`}
            >
              <div className="boss-ally-icon" aria-hidden="true">
                <span>{ally.icon}</span>
                <img src={ally.portraitSrc} alt="" />
              </div>
              <div className="boss-ally-copy">
                <div>
                  <strong>{ally.name}</strong>
                  <small>{ally.alive ? ROLE_LABELS[ally.role] : 'ALLY DOWN'}</small>
                </div>
                <div className="boss-ally-meter" aria-hidden="true">
                  <span style={{ width: `${healthPercent}%` }} />
                  <i style={{ left: `${healthPercent}%` }} />
                </div>
              </div>
              <b className="boss-ally-value">{ally.alive ? Math.ceil(ally.health) : 'KIA'}</b>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
