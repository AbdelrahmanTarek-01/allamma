import { useState } from 'react';
import { send, useStore } from '../net';
import { sfx } from '../sound';
import { Sheet } from './ui';

/**
 * Host only, in every in-game header (next to the sound button): "⋯" opens a sheet to end the game early.
 * "إنهاء وعرض النتيجة" goes to the shared results with the points so far, "إنهاء ورجوع للأوضة" drops the game, "كمّل اللعب" just closes.
 * Hidden for everyone else and on the final screens.
 */
export function GameMenu() {
  const { room } = useStore();
  const [open, setOpen] = useState(false);
  if (!room || room.hostId !== room.youId || !room.game || room.game.phase === 'final') return null;
  const end = (mode: 'results' | 'lobby') => { setOpen(false); sfx.confirm(); send('room:endGame', { mode }); };
  return (
    <>
      <button className="btn icon sm" aria-label="خيارات الهوست" style={{ width: 40, height: 40, boxShadow: 'none', background: '#fff' }} onClick={() => { sfx.tap(); setOpen(true); }}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.3" fill="#111" /><circle cx="12" cy="12" r="2.3" fill="#111" /><circle cx="19" cy="12" r="2.3" fill="#111" /></svg>
      </button>
      {open && (
        <Sheet title="خيارات الهوست" onClose={() => setOpen(false)}>
          <button className="btn big full" onClick={() => end('results')}>إنهاء وعرض النتيجة</button>
          <button className="btn full" style={{ height: 52 }} onClick={() => end('lobby')}>إنهاء ورجوع للأوضة</button>
          <button className="btn full" style={{ height: 52, boxShadow: 'none', background: 'transparent' }} onClick={() => setOpen(false)}>كمّل اللعب</button>
        </Sheet>
      )}
    </>
  );
}
