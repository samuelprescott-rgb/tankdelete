import type { useFieldRadio } from '../hooks/useFieldRadio';
import type { GameSettings } from '../hooks/useGameSettings';
import type { useScore } from '../hooks/useScore';
import type { WorldGunBank } from './worldGunAudio';
import type { GhostPreview } from './ghostSignal';
import type { CleanupSource } from './cleanupDesk';
import type {FileEntry} from './types';

export type GameLaunch =
  | { mode: 'training'; preview?: GhostPreview }
  | { mode: 'horde'; secret?: true }
  | { mode: 'cleanup'; source:CleanupSource; fieldFiles:FileEntry[] }
  | { mode: 'directory'; directory: string };

/** Type-only boundary: the menu never imports the renderer or combat systems. */
export interface GameSessionProps {
  defenseFiles: string[];
  onUnlockDefense: (fileNames: string[]) => void;
  launch: GameLaunch;
  worldGunBank: WorldGunBank | null;
  onFieldReady?: () => void;
  launchTransitionActive?: boolean;
  onExit: (error?: string) => void;
  onReviewCleanup: (ids:string[]) => void;
  identifiedCleanupId?:string;
  fieldRadio: ReturnType<typeof useFieldRadio>;
  settings: GameSettings;
  settingsOpen: boolean;
  achievementNotice?: import('react').ReactNode;
  scoreState: ReturnType<typeof useScore>;
}
