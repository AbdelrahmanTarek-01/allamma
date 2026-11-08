import type { Room } from '../rooms/rooms.types';
import type { Level } from './difficulty';

/** What the room gives an engine: access to the room plus the single per-room timer. */
export interface EngineCtx {
  room: Room;
  /** Broadcast a fresh personalized snapshot to everyone in the room. */
  emit(): void;
  /** Same, but only these players get a snapshot (e.g. a team's live needle: the other team must not receive it). */
  emitTo(playerIds: string[]): void;
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

/**
 * One choice of a setting. RULE for all settings: the option button holds ONE word or number (`label`);
 * any explanation goes in the field's single helper line (`hint`).
 */
export interface SettingOption {
  value: number | string;
  /** What the button shows: one word or one number. */
  label: string;
  /** Long form for the read-only summary line ("٨ دقايق"), when the button's one-word label isn't enough there. */
  full?: string;
  /** Short name used in the dynamic helper line of locked options ("جاسوسين من ٦"). Defaults to `label`. */
  hintName?: string;
  /** Needs at least this many connected players (shown locked until then). */
  minPlayers?: number;
}

/**
 * A setting a game exposes. The schema is sent to the client, which renders the settings sheet generically
 * (one segmented control per field, one small helper line under it), and the server validates every change
 * against it. A new game only adds a schema.
 */
export interface SettingField {
  key: string;
  /** Group title above the buttons. */
  label: string;
  /** The one small helper line under the group. Fields with `minPlayers` options get a dynamic one built by the client. */
  hint?: string;
  /** Draw `value` small filled icons of this kind under the number on each button (e.g. 'spy' hats). */
  icon?: 'spy';
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
  /** The game's difficulty table, one row per level. A game without one ignores the room's difficulty (no control is shown). */
  levels?: Record<Level, object>;
  /** Throws a GameError (Arabic) when this game can't start with these settings and this many connected players. */
  validateStart?(settings: S, players: number): void;
  create(settings: S, level: Level): GameEngine;
}
