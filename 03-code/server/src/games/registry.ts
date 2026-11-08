import type { GameDef } from './game-engine';
import { spyDef } from './spy/spy.engine';

/** Playable games. A game listed on the client but missing here is "coming soon". */
export const GAME_DEFS: Record<string, GameDef> = {
  [spyDef.id]: spyDef
};

export const DEFAULT_GAME = spyDef.id;
