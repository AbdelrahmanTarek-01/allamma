import type { Level } from '../difficulty';
import type { Place } from './places';

export type SpyPhase = 'discuss' | 'vote' | 'reveal' | 'guess' | 'result' | 'final';
export type SpyOutcome = 'detectives' | 'spy-escaped' | 'spy-guessed';

export interface SpySettings {
  rounds: number;
  /** Wanted number of spies. The engine clamps it per round to what the connected players allow. */
  spies: number;
}

export interface SpyGame {
  round: number;
  totalRounds: number;
  phase: SpyPhase;
  endsAt: number | null;
  place: Place;
  /** The lounge's difficulty level and its points multiplier. */
  difficulty: Level;
  multiplier: number;
  board: string[];
  guessOptions: string[];
  /** All spies of the round. They don't know each other. */
  spyIds: string[];
  roles: Record<string, string>;
  participants: string[];
  askerId: string;
  targetId: string;
  /** Players who toggled "ready to vote". Reset every round. The host decides when the vote really starts. */
  readyIds: string[];
  votes: Record<string, string>;
  /** The single top-voted player (null on a tie or no votes). */
  accusedId: string | null;
  /** The accused is a spy. Only that spy gets the last guess. */
  caught: boolean;
  spyGuess: string | null;
  outcome: SpyOutcome | null;
  roundPoints: Record<string, number>;
}
