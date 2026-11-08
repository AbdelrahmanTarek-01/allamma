import { useEffect, useRef, useState } from 'react';
import { TEAM } from '../games/teams';
import { send, type RoomView, type TeamMsg } from '../net';
import { Character } from './art';
import { Sheet } from './ui';

/** "شات الفريق": a small button with an unread badge that opens the team's private chat (only teammates ever receive it). */
export function TeamChatButton({ room, game, team, chat }: { room: RoomView; game: 'quiz' | 'words'; team: 0 | 1 | null; chat: TeamMsg[] }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  useEffect(() => { if (open) setSeen(chat.length); }, [open, chat.length]);
  if (team === null) return null;
  const unread = open ? 0 : Math.max(0, chat.length - seen);
  return (
    <>
      <button className="chat-chip" aria-label="شات الفريق" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 012 2v9a2 2 0 01-2 2h-8l-5 4v-4H4a2 2 0 01-2-2V7a2 2 0 012-2z" fill="#fff" stroke="#111" strokeWidth="2.2" strokeLinejoin="round" /><path d="M7 10h10M7 13.500h6" stroke="#111" strokeWidth="2.2" strokeLinecap="round" /></svg>
        {unread > 0 && <b className="chat-badge">{unread}</b>}
      </button>
      {open && <ChatSheet room={room} game={game} team={team} chat={chat} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatSheet({ room, game, team, chat, onClose }: { room: RoomView; game: 'quiz' | 'words'; team: 0 | 1; chat: TeamMsg[]; onClose: () => void }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: 1e6 }); }, [chat.length]);
  const who = (id: string) => room.players.find((p) => p.id === id);
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await send('game:act', { game, action: 'teamChat', payload: { text: t } });
  };
  return (
    <Sheet title={`شات فريق ${TEAM[team].name}`} onClose={onClose}>
      <span className="muted" style={{ fontSize: 12.5 }}>فريقك بس هو اللي بيشوف الكلام ده</span>
      <div className="tc-list" ref={list} aria-live="polite" style={{ maxHeight: 220 }}>
        {chat.length === 0 && <span className="muted">اتفقوا مع فريقكم…</span>}
        {chat.map((m) => (
          <div key={m.id} className={`tc-msg${m.from === room.youId ? ' mine' : ''}`}>
            <Character id={who(m.from)?.avatar ?? 'c1'} size={22} />
            <span><b>{m.from === room.youId ? 'إنت' : who(m.from)?.name ?? '؟'}:</b> {m.text}</span>
          </div>
        ))}
      </div>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="input" style={{ height: 44, fontSize: 15, borderWidth: 2.5 }} aria-label="رسالة للفريق" maxLength={120} value={text} placeholder="اكتب لفريقك" onChange={(e) => setText(e.target.value)} autoFocus />
        <button className="btn black sm" type="submit" style={{ height: 44 }}>ابعت</button>
      </form>
    </Sheet>
  );
}
