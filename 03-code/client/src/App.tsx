import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { GameChat } from './components/GameChat';
import { HelpSheet } from './components/HelpSheet';
import { takeFirstTimeHelp } from './games';
import { SkeletonHome } from './components/ui';
import { start, useStore } from './net';
import { music, type MusicName } from './sound';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Room } from './screens/Room';
import { RoomBoard } from './screens/RoomBoard';
import { SpyGame } from './screens/Spy';
import { hasInviteLink, hasSeenWelcome, markWelcomed, Welcome } from './screens/Welcome';

// the map game brings the generated maps (a few hundred KB): only players who open it download it
const WaveGame = lazy(() => import('./screens/WaveGame').then((m) => ({ default: m.WaveGame })));
const QuizGame = lazy(() => import('./screens/QuizGame').then((m) => ({ default: m.QuizGame })));
const WordsGame = lazy(() => import('./screens/WordsGame').then((m) => ({ default: m.WordsGame })));
const AuctionGame = lazy(() => import('./screens/AuctionGame').then((m) => ({ default: m.AuctionGame })));
const MapGame = lazy(() => import('./screens/MapGame').then((m) => ({ default: m.MapGame })));

export function App() {
  const { profile, status, room, toast, hasConnected } = useStore();
  const [editing, setEditing] = useState(false);
  const [autoHelp, setAutoHelp] = useState<string | null>(null);
  // the welcome screen is for a first visit only: not for returning users (they have a profile) and not for invite links
  // the room leaderboard: opened from the trophy in the lounge ('view'), or by itself after a game ends ('auto')
  const [board, setBoard] = useState<null | 'view' | 'auto'>(null);
  const boardShownFor = useRef<number | null>(null);
  const [welcomed, setWelcomed] = useState(() => hasSeenWelcome() || hasInviteLink());

  useEffect(() => { start(); }, []);
  useEffect(() => { setEditing(false); }, [profile?.name, profile?.avatar]);

  let key: string;
  let screen;
  if (!profile && !welcomed) { key = 'welcome'; screen = <Welcome onStart={() => { markWelcomed(); setWelcomed(true); }} />; }
  else if (!profile || editing) { key = 'onboarding'; screen = <Onboarding onCancel={() => setEditing(false)} />; }
  else if (!hasConnected) { key = 'waking'; screen = <SkeletonHome note="بنصحّي السيرفر… ثواني" />; }
  else if (!room) {
    key = status === 'online' ? 'home' : 'reconnect';
    screen = status === 'online' ? <Home onEditProfile={() => setEditing(true)} /> : <SkeletonHome note="بنرجّع الاتصال…" />;
  }
  else if (board && room.board) { key = 'board'; screen = <RoomBoard room={room} auto={board === 'auto'} onClose={() => setBoard(null)} />; }
  else if (!room.game) { key = 'room'; screen = <Room room={room} onBoard={() => setBoard('view')} />; }
  else if (room.game.type === 'map') {
    key = `map-${room.game.round}-${room.game.phase}`;
    screen = <Suspense fallback={<SkeletonHome note="بنجهّز الخريطة…" />}><MapGame room={room} g={room.game} /></Suspense>;
  }
  else if (room.game.type === 'wave') {
    key = `wave-${room.game.turn}-${room.game.phase}`;
    screen = <Suspense fallback={<SkeletonHome note="بنجهّز اللعبة…" />}><WaveGame room={room} g={room.game} /></Suspense>;
  }
  else if (room.game.type === 'quiz') {
    key = `quiz-${room.game.phase}-${room.game.question ? room.game.question.text : room.game.left}`;
    screen = <Suspense fallback={<SkeletonHome note="بنجهّز اللعبة…" />}><QuizGame room={room} g={room.game} /></Suspense>;
  }
  else if (room.game.type === 'words') {
    key = `words-${room.game.boardNo}-${room.game.phase}`;
    screen = <Suspense fallback={<SkeletonHome note="بنجهّز اللعبة…" />}><WordsGame room={room} g={room.game} /></Suspense>;
  }
  else if (room.game.type === 'auction') {
    key = `auction-${room.game.lotNo}-${room.game.phase === 'sold' ? 'bid' : room.game.phase}`;
    screen = <Suspense fallback={<SkeletonHome note="بنجهّز اللعبة…" />}><AuctionGame room={room} g={room.game} /></Suspense>;
  }
  else { key = `spy-${room.game.round}-${room.game.phase}`; screen = <SpyGame room={room} g={room.game} />; }

  // the first time a game starts for this player, open its how-to-play once (remembered per game on this device)
  const gameType = room?.game?.type;
  useEffect(() => { if (gameType && takeFirstTimeHelp(gameType)) setAutoHelp(gameType); }, [gameType]);

  // background music follows the moment: lively in menus, tense while playing, silent for the drama
  const phase = room?.game?.phase;
  const isMap = room?.game?.type === 'map';
  const isWave = room?.game?.type === 'wave';
  const isQuiz = room?.game?.type === 'quiz';
  const isWords = room?.game?.type === 'words';
  const isAuction = room?.game?.type === 'auction';
  // spy: tense while talking, silent on the dark reveal/guess. map: tense while the clock runs, lively for the yellow reveal
  const track: MusicName = isAuction
    ? (phase === 'bid' || phase === 'answer' ? 'tension' : 'lobby')
    : isWords
    ? (phase === 'boardEnd' ? null : phase === 'guess' ? 'tension' : 'lobby')
    : isQuiz
    ? (phase === 'question' || phase === 'steal' ? 'tension' : 'lobby')
    : isWave
    ? (phase === 'reveal' ? null : phase === 'guess' || phase === 'call' ? 'tension' : 'lobby') // dark reveal: silent, like the spy reveal
    : isMap
    ? (phase === 'guess' ? 'tension' : 'lobby')
    : phase === 'discuss' || phase === 'vote' ? 'tension' : phase === 'reveal' || phase === 'guess' ? null : 'lobby';
  useEffect(() => { music.play(track); }, [track]);

  // after a game ends the room leaderboard opens by itself (once per finished game), after the final screen had its moment
  const finished = room?.game?.phase === 'final';
  const playedCount = room?.board?.played.length ?? 0;
  useEffect(() => {
    if (!finished) return;
    if (boardShownFor.current === playedCount) return;
    const t = setTimeout(() => { boardShownFor.current = playedCount; setBoard('auto'); }, 3800);
    return () => clearTimeout(t);
  }, [finished, playedCount]);
  // back in the lounge (or out of the room): the automatic board is done
  useEffect(() => { if (!room?.game && board === 'auto') setBoard(null); if (!room) setBoard(null); }, [room?.game, !room]);

  return (
    <>
      {/* connection status: a thin in-flow bar at the very top, so it never covers content (a bottom toast covered the footer text) */}
      {hasConnected && status === 'offline' && room && (
        <div className="conn-banner" role="status">النت فصل، بنرجّعك لنفس مكانك…</div>
      )}
      <div key={key} className="enter">{screen}</div>
      {autoHelp && <HelpSheet gameId={autoHelp} onClose={() => setAutoHelp(null)} />}
      {/* floating chat: in the lounge and in the bright game phases (not the dark reveal/guess screens) */}
      {room && <GameChat room={room} lounge={!room.game} discuss={!isMap && !isWave && !isQuiz && !isWords && !isAuction && phase === 'discuss'} visible={!board && (!room.game || (isWave || isQuiz || isWords || isAuction ? phase === 'final' : isMap ? phase === 'result' || phase === 'final' : phase === 'discuss' || phase === 'vote' || phase === 'result'))} />}
      {toast && <div key={toast} className="toast" role="status">{toast}</div>}
    </>
  );
}
