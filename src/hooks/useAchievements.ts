import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, type Achievement } from '../lib/achievements';

export function useAchievements(totalBytesFreed: number, enabled = true) {
  const [state, setState] = useState(() => ({
    earned: new Set<string>(),
    pending: [] as Achievement[],
  }));

  useEffect(() => {
    setState(previous => {
      if (!enabled) return previous.pending.length ? { ...previous, pending: [] } : previous;

      const unlocked = ACHIEVEMENTS.filter(a => totalBytesFreed >= a.threshold && !previous.earned.has(a.id));
      if (!unlocked.length) return previous;

      return {
        earned: new Set([...previous.earned, ...unlocked.map(a => a.id)]),
        pending: [...previous.pending, ...unlocked],
      };
    });
  }, [enabled, totalBytesFreed]);

  const current = enabled ? state.pending[0] : undefined;
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => {
      setState(previous => previous.pending[0] === current
        ? { ...previous, pending: previous.pending.slice(1) }
        : previous);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [current]);

  return { earned: state.earned, current };
}
