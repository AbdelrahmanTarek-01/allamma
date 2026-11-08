import { useEffect, useRef, useState } from 'react';
import { Character, SpyIcon } from '../components/art';
import { MuteButton, Sheet } from '../components/ui';
import { AR, leaveRoom, send, toast, type RoomView } from '../net';
import { sfx } from '../sound';

const MINUTES = [300, 480, 600];
const ROUNDS = [1, 3, 5];

export function Room({ room }: { room: RoomView }) {
  const me = room.players.find((p) => p.id === room.youId)!;
  const isHost = room.hostId === room.youId;
  const online = room.players.filter((p) => p.connected).length;
  const [msg, setMsg] = useState('');
  const [manageId, setManageId] = useState<string | null>(null);
  const [confirmKick, setConfirmKick] = useState(false);
  const target = room.players.find((p) => p.id === manageId && p.id !== room.youId);
  const closeManage = () => { setManageId(null); setConfirmKick(false); };
  const roundsText = (r: number) => (r === 1 ? 'جولة' : `${AR(r)} جولات`);
  const chatRef = useRef<HTMLDivElement>(null);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '؟';

  useEffect(() => { chatRef.current?.scrollTo({ top: 1e6 }); }, [room.chat.length]);

  // sounds for people joining and new chat messages from others
  const seen = useRef({ players: room.players.length, chat: room.chat[room.chat.length - 1]?.id });
  useEffect(() => {
    if (room.players.length > seen.current.players) sfx.join();
    else if (room.players.length < seen.current.players) sfx.leave();
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

  // WhatsApp can't start a call from a link, so this opens a message to a group/contact: they start the voice call there.
  const whatsapp = () => {
    const link = `${location.origin}/?room=${room.code}`;
    const text = `تعالوا نلعب مين الجاسوس في اللمّة ونفتح مكالمة صوت! الكود ${room.code}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
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

      <button className="btn full" style={{ background: 'var(--green)' }} onClick={whatsapp}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5l2.2 4.4-1.7 1.7a12 12 0 006.3 6.3l1.7-1.7 4.4 2.2c.4.2.6.6.5 1l-.5 2.1c-.1.5-.6.9-1.1.9C10.4 20.4 3.6 13.6 3.1 5.1c0-.5.4-1 .9-1.1l2.1-.5c.5-.1.9.1 1 .5z" fill="#fff" stroke="#111" strokeWidth={1.8} strokeLinejoin="round" /></svg>
        افتحوا مكالمة واتساب
      </button>

      <section className="card col" style={{ gap: 10, padding: '14px 16px' }}>
        <div className="row">
          <span className="icontile" style={{ background: 'var(--pink)', width: 46, height: 46 }}><SpyIcon size={36} /></span>
          <div className="col grow" style={{ gap: 0 }}>
            <span className="label" style={{ fontSize: 12 }}>اللعبة</span>
            <span className="display h2">مين الجاسوس؟</span>
          </div>
        </div>
        {isHost ? (
          <div className="col" style={{ gap: 10 }}>
            <div className="col" style={{ gap: 4 }}>
              <span className="label" style={{ fontSize: 12 }}>وقت الجولة</span>
              <div className="seg" role="group" aria-label="وقت الجولة">
                {MINUTES.map((s) => (
                  <button key={s} aria-pressed={room.settings.discussSeconds === s} onClick={() => send('room:settings', { discussSeconds: s })}>
                    {AR(s / 60)} دقايق
                  </button>
                ))}
              </div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <span className="label" style={{ fontSize: 12 }}>عدد الجولات</span>
              <div className="seg" role="group" aria-label="عدد الجولات">
                {ROUNDS.map((r) => (
                  <button key={r} aria-pressed={room.settings.rounds === r} onClick={() => send('room:settings', { rounds: r })}>
                    {roundsText(r)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <span style={{ fontWeight: 800, fontSize: 14 }}>{AR(room.settings.discussSeconds / 60)} دقايق · {roundsText(room.settings.rounds)}</span>
        )}
      </section>

      <div className="row between">
        <h2 className="display h2">اللاعيبة</h2>
        <span className="label" style={{ fontSize: 14 }}>{AR(room.players.length)} من ١٠</span>
      </div>

      <div className="grid3">
        {room.players.map((p) => {
          const manageable = isHost && p.id !== room.youId;
          const Tag = manageable ? 'button' : 'div';
          return (
            <Tag
              key={p.id}
              className="tile pop-in player"
              {...(manageable ? { type: 'button' as const, 'aria-label': `خيارات ${p.name}`, onClick: () => { setConfirmKick(false); setManageId(p.id); } } : {})}
              style={{ alignItems: 'center', padding: '14px 4px 8px', opacity: p.connected ? 1 : 0.5, background: p.id === room.youId ? 'var(--yellow-soft)' : '#fff', cursor: manageable ? 'pointer' : 'default' }}
            >
              {p.id === room.hostId && <span className="chip dark badge" style={{ insetInlineStart: '50%', transform: 'translateX(50%)' }}>المضيف</span>}
              <Character id={p.avatar} size={52} />
              <span style={{ fontWeight: 900, fontSize: 13.5, lineHeight: 1.3, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.id === room.youId ? 'إنت' : p.name}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: !p.connected ? '#555' : p.ready || p.id === room.hostId ? 'var(--ok)' : '#6b5a00' }}>
                {!p.connected ? 'النت فصل' : p.id === room.hostId ? 'جاهز' : p.ready ? 'جاهز' : 'لسه'}
              </span>
            </Tag>
          );
        })}
        {room.players.length < 10 && (
          <button className="tile" onClick={invite} style={{ alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', boxShadow: 'none', background: 'transparent', minHeight: 116 }}>
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
      {isHost && target && (
        <Sheet title={target.name} onClose={closeManage}>
          {confirmKick ? (
            <>
              <span style={{ fontWeight: 700 }}>تطرد {target.name} من الأوضة؟ هيرجع للصفحة الرئيسية.</span>
              <button className="btn big full danger" onClick={async () => { const t = target.id; closeManage(); await send('room:kick', { playerId: t }); }}>أيوه، اطرده</button>
              <button className="btn full" style={{ height: 52 }} onClick={() => setConfirmKick(false)}>لا، خليه</button>
            </>
          ) : (
            <>
              <button className="btn big full black" disabled={!target.connected} onClick={async () => { const t = target.id; closeManage(); await send('room:makeHost', { playerId: t }); }}>خليه المضيف</button>
              <button className="btn big full danger" onClick={() => setConfirmKick(true)}>اطرده من الأوضة</button>
            </>
          )}
        </Sheet>
      )}
    </main>
  );
}
