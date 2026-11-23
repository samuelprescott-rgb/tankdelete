import type { ReactNode } from 'react';
import { resolveValue, ToastIcon, useToaster } from 'react-hot-toast';
import type { DefaultToastOptions, ToastPosition } from 'react-hot-toast';
import './GameNotifications.css';

const POSITIONS: readonly ToastPosition[] = [
  'top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right',
];
const OPTIONS: DefaultToastOptions = {
  success: { iconTheme: { primary: '#a8bf78', secondary: '#12180e' } },
  error: { iconTheme: { primary: '#e36d32', secondary: '#12180e' } },
};

/** Achievements and routine notices share one fixed top-center slot. Other
 * positions keep their normal toast layout without measuring HUD elements. */
export function GameNotifications({achievement}: {achievement?: ReactNode} = {}) {
  const { toasts, handlers } = useToaster(OPTIONS);
  const visible = toasts.filter(notice => notice.visible);
  return (
    <div className="game-notifications" data-game-ui data-rht-toaster="default"
      onMouseEnter={handlers.startPause} onMouseLeave={handlers.endPause}>
      {POSITIONS.map(position => {
        if (position === 'top-center' && achievement) {
          return <div key={position} className="game-notifications__stack" data-position={position}>
            <div className="game-notifications__custom" role="status" aria-live="polite">{achievement}</div>
          </div>;
        }
        const notices = visible.filter(notice => (notice.position ?? 'top-center') === position);
        // The center of the gameplay camera has room for a single notice.
        const stack = position === 'top-center' ? notices.slice(0, 1) : notices;
        if (!stack.length) return null;
        return (
          <div key={position} className="game-notifications__stack" data-position={position}>
            {stack.map(notice => notice.type === 'custom' ? (
              <div key={notice.id} className="game-notifications__custom" {...notice.ariaProps}>
                {resolveValue(notice.message, notice)}
              </div>
            ) : (
              <div key={notice.id} className={['game-notifications__card', notice.className].filter(Boolean).join(' ')}
                style={notice.style}>
                <ToastIcon toast={notice} />
                <div className="game-notifications__message" {...notice.ariaProps}>
                  {resolveValue(notice.message, notice)}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
