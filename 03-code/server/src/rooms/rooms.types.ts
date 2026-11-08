import type { Level } from '../games/difficulty';
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
  /** Player id, or '' for a system message. */
  from: string;
  text: string;
  at: number;
  /** System divider ("بدأت الجولة ٢"): shown centered and muted, not counted as unread. */
  system?: boolean;
}

export type Privacy = 'private' | 'public';

/** One finished game on the room leaderboard. */
export interface BoardGame { n: number; game: string; winner: string; at: number }

/**
 * The room leaderboard (01-brainstorm/room-leaderboard.md): placement points across every game played in the lounge.
 * Keyed by playerId, so someone who leaves keeps their row and gets it back when they rejoin. Lives and dies with the room.
 */
export interface Board {
  totals: Record<string, number>;
  byGame: Record<string, Record<string, number>>;
  /** Points of the latest finished game. */
  gain: Record<string, number>;
  /** Rank (0 = first) before the latest game, for the rank-change arrows. */
  prevRank: Record<string, number>;
  /** Everyone who ever got points, so a row can still be drawn after they left. */
  members: Record<string, { name: string; avatar: string }>;
  played: BoardGame[];
}

/** One row of the public lobby list. */
export interface LobbyRoom {
  code: string;
  name: string;
  host: { name: string; avatar: string };
  game: string;
  players: number;
  /** First four members, for the avatars row on the card. */
  avatars: string[];
  /** The lounge asks the host before letting a new player in. */
  ask: boolean;
  difficulty: string;
  max: number;
  /** No free seat left (the card shows it dimmed; quick play skips it). */
  full: boolean;
  status: 'waiting' | 'playing';
}

export interface JoinRequest {
  id: string;
  name: string;
  avatar: string;
  socketId: string;
  at: number;
  timer: NodeJS.Timeout;
}

/** A lounge (قعدة): a persistent room that can play game after game. */
export interface Room {
  code: string;
  name: string;
  hostId: string;
  /** private = code/link only (default). public = listed in the lobby. */
  privacy: Privacy;
  /** Locked: nobody new can join (members reconnecting still can). */
  locked: boolean;
  /** Ask mode ("بإذن"): a new player sends a request the host answers; members come back directly. */
  ask: boolean;
  /** Pending join requests (one per player, at most 10, each expires after 60 s). */
  requests: Map<string, JoinRequest>;
  /** Players the host rejected: they can't ask this lounge again until this time (ms). */
  rejected: Map<string, number>;
  /** Players the host kicked: they can't rejoin this lounge. */
  banned: Set<string>;
  players: Map<string, Player>;
  chat: ChatMsg[];
  selectedGame: string;
  /** Shared difficulty of the lounge (host-only). Games that have a level table read it when a game starts. */
  difficulty: Level;
  /** Seats in the lounge (4 / 6 / 8 / 12), set by the host. Joining (code, link, quick play) fails with ROOM_FULL at the cap; a player who is already in may always come back. */
  maxPlayers: number;
  /** Settings per game id, so switching games keeps each game's choices. */
  settings: Record<string, any>;
  engine: GameEngine | null;
  board: Board;
  /** True once the finished game's points were added to the lounge scores. */
  settled: boolean;
  timer: NodeJS.Timeout | null;
  emptySince: number | null;
}

/** A rule violation with an Arabic message for the player; `code` (optional) lets the client react to a specific case (e.g. NO_ROOMS). */
export class GameError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}
