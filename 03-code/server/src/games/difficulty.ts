/**
 * Room-level difficulty shared by every game (01-brainstorm/difficulty.md).
 * The host picks one level for the lounge; each game maps it to real gameplay in ONE table of its own
 * (`GameDef.levels`, e.g. SPY_LEVELS), so a new game only adds its row.
 */
export type Level = 'easy' | 'medium' | 'hard' | 'max';
export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard', 'max'];
export const DEFAULT_LEVEL: Level = 'medium';
export const isLevel = (v: unknown): v is Level => LEVELS.includes(v as Level);
