import { auctionHelp } from './auction/help';
import { drawHelp } from './draw/help';
import type { GameHelp } from './help-types';
import { quizHelp } from './quiz/help';
import { spyHelp } from './spy/help';
import { waveHelp } from './wave/help';
import { wordsHelp } from './words/help';

/** "How to play" content by game id (same ids as GAMES in components/art.tsx). A new game adds its help.ts here. */
export const HELP: Record<string, GameHelp> = {
  spy: spyHelp,
  wave: waveHelp,
  words: wordsHelp,
  auction: auctionHelp,
  quiz: quizHelp,
  draw: drawHelp
};

const SEEN_KEY = (gameId: string) => `allamma.helpSeen.${gameId}`;

/** True the first time a player gets to a game: the how-to-play sheet opens once, then this is remembered per game. */
export function takeFirstTimeHelp(gameId: string): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY(gameId))) return false;
    localStorage.setItem(SEEN_KEY(gameId), '1');
    return true;
  } catch {
    return false; // storage blocked: don't nag on every game
  }
}
