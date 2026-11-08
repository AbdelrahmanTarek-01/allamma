import { useEffect, useRef, useState } from 'react';
import { Character, SpyIcon } from '../components/art';
import { MuteButton } from '../components/ui';
import { AR, leaveRoom, send, toast, type RoomView } from '../net';
import { sfx } from '../sound';

const MINUTES = [300, 480, 600];
const ROUNDS = [1, 3, 5];

export function Room({ room }: { room: RoomView }) {
  const me = room.players.find((p) => p.id === room.youId)!;
  const isHost = room.hostId === room.youId;
  const online = room.players.filter((p) => p.connected).length;
  const [msg, setMsg] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '؟';

  useEffect(() => { chatRef.current?.scrollTo({ top: 1e6 }); }, [room.chat.length]);

  // sounds for people joining and new chat messages from others
  const seen = useRef({ players: room.players.length, chat: room.chat[room.chat.length - 1]?.id });
  useEffect(() => {
    if (room.players.length > seen.current.players) sfx.join();
    const last = room.chat[room.chat.length - 1];
    if (last && last.id !== seen.current.chat && last.from !== room.youId) sfx.chat();
    seen.current = { players: room.players.length, chat: last?.id };
  }, [room.players.length, room.chat]);

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(room.code); sfx.select(); toast('الكود اتنسخ'); } catch { /* ignore */ }
  };

  const invite = async () => {
    const link = `${location.origin}/?room=${room.code}`;
    const text = `تعالى العب معانا مين الجاسوس في اللمّة! الكود ${room.code}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'اللمّة', text, url: link }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(`${text}\n${link}`); toast('اتنسخ اللينك، ابعته لصحابك'); }
    catch { toast(`الكود: ${room.code}`); }
  };

  const sendChat = async () => {
    const t = msg.trim();
    if (!t) return;
    setMsg('');
    await send('room:chat', { text: t });
  };

  return (
    <main className="screen">
      <header className="row">
        <button className="btn icon" aria-label="اخرج من الأوضة" onClick={leaveRoom}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <span className="label" style={{ fontSize: 12 }}>كود الأوضة</span>
          <button onClick={copyCode} aria-label={`انسخ الكود ${room.code}`} className="display" style={{ fontSize: 30, letterSpacing: 3, lineHeight: 1.1, border: 0, background: 'none', padding: 0, textAlign: 'right' }}>{room.code}</button>
        </div>
        <MuteButton />
        <button className="btn black" onClick={invite}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" /><path d="M12 3v12M8 7l4-4 4 4" /></svg>
          ادعي
        </button>
      </header>

      <section className="card col" style={{ gap: 10, padding: '14px 16px' }}>
        <div className="row">
          <span className="icontile" style={{ background: 'var(--pink)', width: 46, height: 46 }}><SpyIcon size={36} /></span>
          <div className="col grow" style={{ gap: 0 }}>
            <span className="label" style={{ fontSize: 12 }}>اللعبة</span>
            <span className="display h2">مين الجاسوس؟</span>
          </div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className="label" style={{ fontSize: 12, width: 64 }}>وقت الجولة</span>
            {MINUTES.map((s) => (
              <button key={s} className={`chip${room.settings.discussSeconds === s ? ' dark' : ' soft'}`} disabled={!isHost} aria-pressed={room.settings.discussSeconds === s}
                onClick={() => send('room:settings', { discussSeconds: s })} style={{ padding: '3px 12px', fontSize: 13 }}>
                {AR(s / 60)} دقايق
              </button>
            ))}
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className="label" style={{ fontSize: 12, width: 64 }}>الجولات</span>
            {ROUNDS.map((r) => (
              <button key={r} className={`chip${room.settings.rounds === r ? ' dark' : ' soft'}`} disabled={!isHost} aria-pressed={room.settings.rounds === r}
                onClick={() => send('room:settings', { rounds: r })} style={{ padding: '3px 12px', fontSize: 13 }}>
                {r === 1 ? 'جولة واحدة' : `${AR(r)} جولات`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="row between">
        <h2 className="display h2">اللاعيبة</h2>
        <span className="label" style={{ fontSize: 14 }}>{AR(room.players.length)} من ١٠</span>
      </div>

      <div className="grid3">
        {room.players.map((p) => (
          <div key={p.id} className="tile pop-in" style={{ alignItems: 'center', padding: '12px 6px 10px', opacity: p.connected ? 1 : 0.5 }}>
            {p.id === room.hostId && <span className="chip dark badge" style={{ insetInlineStart: '50%', transform: 'translateX(50%)' }}>المضيف</span>}
            <Character id={p.avatar} size={60} />
            <span style={{ fontWeight: 900, fontSize: 14, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}{p.id === room.youId ? ' (إنت)' : ''}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: !p.connected ? '#555' : p.ready || p.id === room.hostId ? 'var(--ok)' : '#6b5a00' }}>
              {!p.connected ? 'النت فصل' : p.id === room.hostId ? 'جاهز' : p.ready ? 'جاهز' : 'لسه'}
            </span>
          </div>
        ))}
        {room.players.length < 10 && (
          <button className="tile" onClick={invite} style={{ alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', boxShadow: 'none', background: 'transparent' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            <span style={{ fontWeight: 900, fontSize: 14 }}>ادعي حد</span>
          </button>
        )}
      </div>

      <section className="card flat col" style={{ padding: 10, gap: 8 }}>
        <div className="chat" ref={chatRef} aria-live="polite">
          {room.chat.length === 0 && <span className="muted">قول حاجة لصحابك وانتو مستنيين…</span>}
          {room.chat.map((m) => (
            <div key={m.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <b style={{ fontSize: 13, fontWeight: 900, flex: 'none' }}>{nameOf(m.from)}</b>
              <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{m.text}</span>
            </div>
          ))}
        </div>
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
          <label htmlFor="chatmsg" className="sr" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>رسالة</label>
          <input id="chatmsg" className="input" style={{ height: 42, fontSize: 14, borderWidth: 2.5 }} value={msg} maxLength={200} placeholder="اكتب رسالة" onChange={(e) => setMsg(e.target.value)} />
          <button className="btn sm black" type="submit">ابعت</button>
        </form>
      </section>

      <div className="col push" style={{ gap: 8 }}>
        {isHost ? (
          <>
            <span className="label center" style={{ textAlign: 'center' }}>محتاجين ٣ على الأقل · معاكم {AR(online)}</span>
            <button className="btn big full" disabled={online < 3} onClick={() => send('game:start')}>ابدأ اللعبة</button>
          </>
        ) : (
          <>
            <span className="label" style={{ textAlign: 'center' }}>مستنيين {nameOf(room.hostId)} يبدأ</span>
            <button className={`btn full ${me.ready ? '' : 'black'}`} style={{ height: 58 }} onClick={() => { sfx.select(); send('room:ready', { ready: !me.ready }); }}>
              {me.ready ? 'مش جاهز لسه' : 'أنا جاهز'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
