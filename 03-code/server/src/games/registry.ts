import type { GameDef } from './game-engine';
import { mapDef } from './map/map.engine';
import { quizDef } from './quiz/quiz.engine';
import { wordsDef } from './words/words.engine';
import { spyDef } from './spy/spy.engine';
import { waveDef } from './wave/wave.engine';

/** Playable games. A game listed on the client but missing here is "coming soon". */
export const GAME_DEFS: Record<string, GameDef> = {
  [spyDef.id]: spyDef,
  [mapDef.id]: mapDef,
  [waveDef.id]: waveDef,
  [quizDef.id]: quizDef,
  [wordsDef.id]: wordsDef
};

export const DEFAULT_GAME = spyDef.id;
