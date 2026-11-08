import type { Place } from './places';

export type SpyPhase = 'discuss' | 'vote' | 'reveal' | 'guess' | 'result' | 'final';
export type SpyOutcome = 'detectives' | 'spy-escaped' | 'spy-guessed';

export interface SpySettings {
  discussSeconds: number;
  rounds: number;
}

export interface SpyGame {
  round: number;
  totalRounds: number;
  phase: SpyPhase;
  endsAt: number | null;
  place: Place;
  board: string[];
  guessOptions: string[];
  spyId: string;
  roles: Record<string, string>;
  participants: string[];
  askerId: string;
  targetId: string;
  votes: Record<string, string>;
  accusedId: string | null;
  caught: boolean;
  spyGuess: string | null;
  outcome: SpyOutcome | null;
  roundPoints: Record<string, number>;
}
