import { useEffect, useRef, useState } from 'react';
import { AR, send, useStore, type ChatView, type RoomView } from '../net';
import { sfx } from '../sound';
import { Character } from './art';
import { Sheet } from './ui';

const QUICK = ['مشكوك فيك 🤨', 'أنا بريء!', 'سؤال حلو 👌', '😂', 'استنوا…'];
const BUBBLE_MS = 2000;

/**
 * In-game chat: floating button with unread badge, a sheet with the messages and quick replies,
 * and a short bubble at the top when a message arrives while the sheet is closed.
 * Mounted once in App (outside the per-phase keyed screen) so unread state survives phase changes.
 */
export function GameChat({ room, visible, lounge }: { room: RoomView; visible: boolean; lounge?: boolean }) {
  const { chat, chatBase } = useStore(); // the client's own list (server sends history once, then each new message)
  const lastMsg = chat[chat.length - 1];
  const lastId = lastMsg?.id;
  const [open, setOpen] = useState(false);
  const [readId, setReadId] = useState(chatBase); // what was in the history when we got here counts as read
  const [bubble, setBubble] = useState<ChatView | null>(null);
  const [text, setText] = useState('');
  const prevId = useRef(lastId);
  const listRef = useRef<HTMLDivElement>(null);
  const who = (id: string) => room.players.find((p) => p.id === id);

  // new message from someone else: sound + bubble (bubble only while the sheet is closed)
  useEffect(() => {
    if (lastId === prevId.current) return;
    prevId.current = lastId;
    if (lastId === chatBase) { setReadId(chatBase); return; } // the history just arrived: not "new"
    if (!lastMsg || lastMsg.system || lastMsg.from === room.youId || !visible) return;
    sfx.chat();
    if (!open) setBubble(lastMsg);
  }, [lastId]);

  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), BUBBLE_MS);
    return () => clearTimeout(t);
  }, [bubble?.id]);

  // while the sheet is open everything is read
  useEffect(() => { if (open) { setReadId(lastId); setBubble(null); } }, [open, lastId]);
  // the dark reveal screens have no chat
  useEffect(() => { if (!visible) { setOpen(false); setBubble(null); } }, [visible]);
  useEffect(() => { if (open) listRef.current?.scrollTo({ top: 1e6 }); }, [open, chat.length]);

  if (!visible) return null;

  const readIdx = chat.findIndex((m) => m.id === readId);
  const unread = chat.slice(readIdx + 1).filter((m) => !m.system && m.from !== room.youId).length;

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await send('room:chat', { text: t });
  };

  return (
    <>
      {!open && (
        <button className={`chat-fab${lounge ? ' lounge' : ''}`} aria-label={unread ? `الشات، ${AR(unread)} رسايل جديدة` : 'الشات'} onClick={() => setOpen(true)}>
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z" fill="var(--blue)" stroke="#111" strokeWidth={2} strokeLinejoin="round" />
            <circle cx="8.5" cy="10.5" r="1.2" fill="#111" /><circle cx="12" cy="10.5" r="1.2" fill="#111" /><circle cx="15.5" cy="10.5" r="1.2" fill="#111" />
          </svg>
          {unread > 0 && <span className="chat-badge">{unread > 9 ? '٩+' : AR(unread)}</span>}
        </button>
      )}

      {bubble && !open && (() => {
        const p = who(bubble.from);
        return (
          <button key={bubble.id} className="chat-bubble" onClick={() => setOpen(true)} aria-label="افتح الشات">
            {p && <Character id={p.avatar} size={34} />}
            <span className="col" style={{ gap: 0, minWidth: 0, textAlign: 'right' }}>
              <span className="display" style={{ fontSize: 15 }}>{p?.name ?? '؟'}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{bubble.text.length > 40 ? `${bubble.text.slice(0, 40)}…` : bubble.text}</span>
            </span>
          </button>
        );
      })()}

      {open && (
        <Sheet title="الشات" onClose={() => setOpen(false)}>
          <div className="chat-list" ref={listRef} aria-live="polite">
            {chat.length === 0 && <span className="muted">قول حاجة لصحابك…</span>}
            {chat.map((m) => {
              if (m.system) return <span key={m.id} className="chat-system">{m.text}</span>;
              const mine = m.from === room.youId;
              const p = who(m.from);
              return (
                <div key={m.id} className={`chat-msg${mine ? ' mine' : ''}`}>
                  {p && <Character id={p.avatar} size={30} />}
                  <div className="chat-card">
                    <span className="display" style={{ fontSize: 13 }}>{mine ? 'إنت' : p?.name ?? '؟'}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{m.text}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {QUICK.map((q) => (
              <button key={q} className="chip" style={{ fontSize: 14, padding: '5px 12px' }} onClick={() => send('room:chat', { text: q })}>{q}</button>
            ))}
          </div>
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <input className="input" style={{ height: 46, fontSize: 16, borderWidth: 2.5 }} aria-label="رسالة" value={text} maxLength={200} placeholder="اكتب رسالة" onChange={(e) => setText(e.target.value)} />
            <button className="btn black" style={{ height: 46 }} type="submit">ابعت</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
