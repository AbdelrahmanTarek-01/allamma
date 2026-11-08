import type { Difficulty, Place } from './places';

export type SpyPhase = 'discuss' | 'vote' | 'reveal' | 'guess' | 'result' | 'final';
export type SpyOutcome = 'detectives' | 'spy-escaped' | 'spy-guessed';

export type DifficultySetting = Difficulty | 'mix';

export interface SpySettings {
  discussSeconds: number;
  rounds: number;
  /** Wanted number of spies. The engine clamps it per round to what the connected players allow. */
  spies: number;
  difficulty: DifficultySetting;
}

export interface SpyGame {
  round: number;
  totalRounds: number;
  phase: SpyPhase;
  endsAt: number | null;
  place: Place;
  /** This round's difficulty (a mix picks one per round) and its points multiplier. */
  difficulty: Difficulty;
  multiplier: number;
  board: string[];
  guessOptions: string[];
  /** All spies of the round. They don't know each other. */
  spyIds: string[];
  roles: Record<string, string>;
  participants: string[];
  askerId: string;
  targetId: string;
  votes: Record<string, string>;
  /** The single top-voted player (null on a tie or no votes). */
  accusedId: string | null;
  /** The accused is a spy. Only that spy gets the last guess. */
  caught: boolean;
  spyGuess: string | null;
  outcome: SpyOutcome | null;
  roundPoints: Record<string, number>;
}
