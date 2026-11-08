import type { Room } from '../rooms/rooms.types';

/** What the room gives an engine: access to the room plus the single per-room timer. */
export interface EngineCtx {
  room: Room;
  /** Broadcast a fresh personalized snapshot to everyone in the room. */
  emit(): void;
  /** Run `fn` after `seconds`. Replaces any pending timer of the room. */
  schedule(seconds: number, fn: () => void): void;
  clearTimer(): void;
  /** Post a system divider into the room chat (e.g. a new round started). */
  system(text: string): void;
}

/**
 * One running game inside a lounge. RoomsService owns room concerns (players, host, chat, lifecycle)
 * and delegates everything game-specific here. A new engine instance is created per game.
 */
export interface GameEngine {
  readonly id: string;
  /** Actions only the host may trigger. RoomsService checks this before calling `handle`. */
  readonly hostActions: readonly string[];
  /** Begin the game with these players (room already checked the minimum). */
  start(ctx: EngineCtx, participants: string[]): void;
  /** A player action. Throw GameError (Arabic message) when it is not allowed. */
  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown): void;
  /** A player left the room for good (left or was kicked). */
  onLeave(ctx: EngineCtx, playerId: string): void;
  /** A player connected or disconnected. */
  onPresenceChange(ctx: EngineCtx): void;
  /** The game part of the personalized room snapshot. Secrets must be filtered here. */
  viewFor(playerId: string): unknown;
  /** Points this player earned in the current game (fresh each game). */
  scoreOf(playerId: string): number;
  /** True once the game reached its final screen. Lounge scores are updated at that moment. */
  isOver(): boolean;
}

/** One choice of a setting. `minPlayers`: needs at least this many connected players (shown locked until then). */
export interface SettingOption {
  value: number | string;
  label: string;
  minPlayers?: number;
}

/**
 * A setting a game exposes. The schema is sent to the client, which renders the settings sheet generically
 * (one segmented control per field), and the server validates every change against it. A new game only adds a schema.
 */
export interface SettingField {
  key: string;
  label: string;
  options: SettingOption[];
}

/** A game the lounge can pick. Settings are stored per game on the room. */
export interface GameDef<S = any> {
  id: string;
  /** Display name used in chat dividers. */
  name: string;
  minPlayers: number;
  /** The settings schema: key, label and the allowed options (validation comes from here). */
  settings: SettingField[];
  defaultSettings(): S;
  create(settings: S): GameEngine;
}
