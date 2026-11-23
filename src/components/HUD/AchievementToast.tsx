import type { Achievement } from '../../lib/achievements';
import './AchievementToast.css';

interface AchievementToastProps {
  achievement: Achievement;
  visible: boolean;
}

export function AchievementToast({ achievement, visible }: AchievementToastProps) {
  return (
    <div className={`achievement-toast ${visible ? 'visible' : ''}`}>
      <span className="achievement-icon" aria-hidden="true" />
      <div className="achievement-text">
        <div className="achievement-label">
          <span>Achievement unlocked</span>
        </div>
        <div className="achievement-name">{achievement.name}</div>
      </div>
    </div>
  );
}
