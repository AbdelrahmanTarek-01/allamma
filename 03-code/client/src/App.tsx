import { useEffect, useState } from 'react';
import { GameChat } from './components/GameChat';
import { HelpSheet } from './components/HelpSheet';
import { takeFirstTimeHelp } from './games';
import { SkeletonHome } from './components/ui';
import { start, useStore } from './net';
import { music, type MusicName } from './sound';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Room } from './screens/Room';
import { SpyGame } from './screens/Spy';

export function App() {
  const { profile, status, room, toast, hasConnected } = useStore();
  const [editing, setEditing] = useState(false);
  const [autoHelp, setAutoHelp] = useState<string | null>(null);

  useEffect(() => { start(); }, []);
  useEffect(() => { setEditing(false); }, [profile?.name, profile?.avatar]);

  let key: string;
  let screen;
  if (!profile || editing) { key = 'onboarding'; screen = <Onboarding onCancel={() => setEditing(false)} />; }
  else if (!hasConnected) { key = 'waking'; screen = <SkeletonHome note="بنصحّي السيرفر… ثواني" />; }
  else if (!room) {
    key = status === 'online' ? 'home' : 'reconnect';
    screen = status === 'online' ? <Home onEditProfile={() => setEditing(true)} /> : <SkeletonHome note="بنرجّع الاتصال…" />;
  }
  else if (!room.game) { key = 'room'; screen = <Room room={room} />; }
  else { key = `spy-${room.game.round}-${room.game.phase}`; screen = <SpyGame room={room} g={room.game} />; }

  // the first time a game starts for this player, open its how-to-play once (remembered per game on this device)
  const gameType = room?.game?.type;
  useEffect(() => { if (gameType && takeFirstTimeHelp(gameType)) setAutoHelp(gameType); }, [gameType]);

  // background music follows the moment: lively in menus, tense while playing, silent for the drama
  const phase = room?.game?.phase;
  const track: MusicName = phase === 'discuss' || phase === 'vote' ? 'tension' : phase === 'reveal' || phase === 'guess' ? null : 'lobby';
  useEffect(() => { music.play(track); }, [track]);

  return (
    <>
      <div key={key} className="enter">{screen}</div>
      {autoHelp && <HelpSheet gameId={autoHelp} onClose={() => setAutoHelp(null)} />}
      {/* floating chat: in the lounge and in the bright game phases (not the dark reveal/guess screens) */}
      {room && <GameChat room={room} lounge={!room.game} visible={!room.game || phase === 'discuss' || phase === 'vote' || phase === 'result'} />}
      {hasConnected && status === 'offline' && room && (
        <div className="toast" role="status">النت فصل، بنرجّعك لنفس مكانك…</div>
      )}
      {toast && <div key={toast} className="toast" role="status">{toast}</div>}
    </>
  );
}
