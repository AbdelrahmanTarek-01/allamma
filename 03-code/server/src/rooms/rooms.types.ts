import type { GameEngine } from '../games/game-engine';

export const AVATARS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const;

export interface Player {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  /** Lounge score: persists across games, added to when a game reaches its final screen. */
  lounge: number;
  joinedAt: number;
  socketIds: Set<string>;
}

export interface ChatMsg {
  id: string;
  from: string;
  text: string;
  at: number;
}

/** A lounge (قعدة): a persistent room that can play game after game. */
export interface Room {
  code: string;
  name: string;
  hostId: string;
  players: Map<string, Player>;
  chat: ChatMsg[];
  selectedGame: string;
  /** Settings per game id, so switching games keeps each game's choices. */
  settings: Record<string, any>;
  engine: GameEngine | null;
  /** True once the finished game's points were added to the lounge scores. */
  settled: boolean;
  timer: NodeJS.Timeout | null;
  emptySince: number | null;
}

export class GameError extends Error {}
