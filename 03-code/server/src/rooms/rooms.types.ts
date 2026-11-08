import type { Place } from '../spy/places';

export const AVATARS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const;

export interface Player {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  score: number;
  joinedAt: number;
  socketIds: Set<string>;
}

export interface ChatMsg {
  id: string;
  from: string;
  text: string;
  at: number;
}

export type SpyPhase = 'discuss' | 'vote' | 'reveal' | 'guess' | 'result' | 'final';
export type SpyOutcome = 'detectives' | 'spy-escaped' | 'spy-guessed';

export interface SpyGame {
  type: 'spy';
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

export interface RoomSettings {
  discussSeconds: number;
  rounds: number;
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  chat: ChatMsg[];
  settings: RoomSettings;
  game: SpyGame | null;
  timer: NodeJS.Timeout | null;
  emptySince: number | null;
}

export class GameError extends Error {}
