/** Names of the small filled icons the help sheet can show next to a step (drawn in components/HelpSheet.tsx). */
export type HelpIcon = 'card' | 'chat' | 'vote' | 'spy' | 'trophy' | 'clock' | 'star';

/**
 * "How to play" content of one game. Each game keeps its own in games/<game>/help.ts and registers it in games/index.ts,
 * so a new game only adds a file. `idea` is two lines separated by \n.
 */
export interface GameHelp {
  idea: string;
  /** Short placeholder for games that are not playable yet. */
  comingSoon?: boolean;
  steps: { icon: HelpIcon; text: string }[];
  /** Points table: what earns what. */
  points?: { label: string; value: string }[];
  /** Difficulty multipliers, shown as chips under the table. */
  multipliers?: { label: string; value: string }[];
  /** One tip for beginners. */
  tip: string;
}
