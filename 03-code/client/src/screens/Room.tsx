import { useEffect, useRef, useState } from 'react';
import { Character, GAMES } from '../components/art';
import { GameTile } from '../components/GameTile';
import { HelpButton } from '../components/HelpSheet';
import { MuteButton, Sheet } from '../components/ui';
import { AR, leaveRoom, send, toast, type RoomView } from '../net';
import { sfx } from '../sound';

const LockMini = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5" fill="#111" /><path d="M8 10V7.5a4 4 0 018 0V10" fill="none" stroke="#111" strokeWidth={3} /></svg>
);

export function Room({ room }: { room: RoomView }) {
  const me = room.players.find((p) => p.id === room.youId)!;
  const isHost = room.hostId === room.youId;
  const online = room.players.filter((p) => p.connected).length;
  const [manageId, setManageId] = useState<string | null>(null);
  const [confirmKick, setConfirmKick] = useState(false);
  const target = room.players.find((p) => p.id === manageId && p.id !== room.youId);
  const closeManage = () => { setManageId(null); setConfirmKick(false); };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const game = GAMES.find((g) => g.id === room.selectedGame) ?? GAMES[0];
  const schema = room.settingsSchema ?? [];
  // one compact line for everyone, built from the schema: "٨ دقايق · ٣ جولات · جاسوس واحد · مكس"
  const summary = schema.map((f) => f.options.find((o) => o.value === room.settings[f.key])?.label).filter(Boolean).join(' · ');
  const saveName = async () => {
    const n = draft.trim();
    if (!n) return toast('اكتب اسم للقعدة');
    if (n !== room.name) await send('room:rename', { name: n });
  };
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '؟';

  // sound for people joining and leaving (chat sounds and bubbles come from the floating chat)
  const seen = useRef(room.players.length);
  useEffect(() => {
    if (room.players.length > seen.current) sfx.join();
    else if (room.players.length < seen.current) sfx.leave();
    seen.current = room.players.length;
  }, [room.players.length]);

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(room.code); sfx.select(); toast('الكود اتنسخ'); } catch { /* ignore */ }
  };

  const invite = async () => {
    const link = `${location.origin}/?room=${room.code}`;
    const text = `تعالى العب معانا ${game.name} في اللمّة! الكود ${room.code}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'اللمّة', text, url: link }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(`${text}\n${link}`); toast('اتنسخ اللينك، ابعته لصحابك'); }
    catch { toast(`الكود: ${room.code}`); }
  };

  // WhatsApp can't start a call from a link, so this opens a message to a group/contact: they start the voice call there.
  const whatsapp = () => {
    const link = `${location.origin}/?room=${room.code}`;
    const text = `تعالوا نلعب ${game.name} في اللمّة ونفتح مكالمة صوت! الكود ${room.code}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
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

      {room.privacy === 'private' && (
        <button className="btn full" style={{ background: 'var(--green)' }} onClick={whatsapp}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5l2.2 4.4-1.7 1.7a12 12 0 006.3 6.3l1.7-1.7 4.4 2.2c.4.2.6.6.5 1l-.5 2.1c-.1.5-.6.9-1.1.9C10.4 20.4 3.6 13.6 3.1 5.1c0-.5.4-1 .9-1.1l2.1-.5c.5-.1.9.1 1 .5z" fill="#fff" stroke="#111" strokeWidth={1.8} strokeLinejoin="round" /></svg>
          افتحوا مكالمة واتساب
        </button>
      )}

      <div className="row" style={{ gap: 10 }}>
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="label" style={{ fontSize: 12 }}>القعدة</span>
            <span className="chip soft">{room.privacy === 'public' ? 'عامة' : 'خاصة'}</span>
            {room.locked && <span className="chip dark">مقفولة</span>}
          </div>
          <span className="display h2" style={{ overflowWrap: 'anywhere' }}>{room.name}</span>
        </div>
        {isHost && (
          <button className="btn icon" aria-label="إعدادات اللعبة والقعدة" onClick={() => { setDraft(room.name); setSettingsOpen(true); }}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3h3.4l.5 2.4 1.7.7 2.1-1.3 2.4 2.4-1.3 2.1.7 1.7 2.4.5v3.4l-2.4.5-.7 1.7 1.3 2.1-2.4 2.4-2.1-1.3-1.7.7-.5 2.4h-3.4l-.5-2.4-1.7-.7-2.1 1.3-2.4-2.4 1.3-2.1-.7-1.7L3 13.7v-3.4l2.4-.5.7-1.7-1.3-2.1 2.4-2.4 2.1 1.3 1.7-.7z" fill="#B48CFF" stroke="#111" strokeWidth={1.8} strokeLinejoin="round" /><circle cx="12" cy="12" r="3.2" fill="#fff" stroke="#111" strokeWidth={1.8} /></svg>
          </button>
        )}
      </div>

      <div className="col" style={{ gap: 6 }}>
        <span className="label" style={{ fontSize: 12 }}>هتلعبوا إيه؟</span>
        <div className="game-row">
          {GAMES.map((g) => (
            <GameTile
              key={g.id}
              g={g}
              selected={g.id === room.selectedGame}
              onClick={isHost ? () => { sfx.tap(); if (g.ready) send('room:selectGame', { game: g.id }); else toast(`${g.name} جاية قريب`); } : undefined}
            />
          ))}
        </div>
      </div>

      {/* the selected game stays a small card: icon, name, one summary line, "?" help. Settings live behind the host's gear. */}
      <section className="card row" style={{ gap: 12, padding: '12px 14px' }}>
        <span className="icontile" style={{ background: game.color, width: 46, height: 46, flex: 'none' }}>{game.icon}</span>
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <span className="display" style={{ fontSize: 19 }}>{game.name}</span>
          {summary && <span style={{ fontSize: 13, fontWeight: 800 }}>{summary}</span>}
        </div>
        <HelpButton gameId={game.id} />
      </section>

      <div className="row" style={{ gap: 10 }}>
        <h2 className="display h2">اللاعيبة</h2>
        <span className="chip">{AR(room.players.length)} من {AR(10)}</span>
      </div>

      <div className="strip">
        {room.players.length < 10 && (
          <button className="tile player" onClick={invite} style={{ alignItems: 'center', borderStyle: 'dashed', boxShadow: 'none', background: 'transparent' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            <span style={{ fontWeight: 900, fontSize: 14 }}>ادعي حد</span>
          </button>
        )}
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
              <Character id={p.avatar} size={46} />
              <span style={{ fontWeight: 900, fontSize: 13.5, lineHeight: 1.3, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.id === room.youId ? 'إنت' : p.name}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: !p.connected ? '#555' : p.ready || p.id === room.hostId ? 'var(--ok)' : '#6b5a00' }}>
                {!p.connected ? 'النت فصل' : p.id === room.hostId ? 'جاهز' : p.ready ? 'جاهز' : 'لسه'}
              </span>
              {p.lounge > 0 && <span className="chip soft" style={{ fontSize: 11, padding: '0 8px' }}>{AR(p.lounge)} نقطة</span>}
            </Tag>
          );
        })}
      </div>

      {/* pinned to the bottom of the screen so the start/ready button is always reachable */}
      <div className="dock push">
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
      {isHost && settingsOpen && (
        <Sheet title="الإعدادات" onClose={() => setSettingsOpen(false)}>
          {/* a) the selected game's settings, rendered generically from its schema */}
          <section className="card flat col" style={{ gap: 12, padding: '12px 14px' }}>
            <span className="display" style={{ fontSize: 18 }}>إعدادات اللعبة</span>
            {schema.map((f) => (
              <div key={f.key} className="col" style={{ gap: 4 }}>
                <span className="label" style={{ fontSize: 12.5 }}>{f.label}</span>
                <div className="seg" role="group" aria-label={f.label}>
                  {f.options.map((o) => {
                    const locked = !!o.minPlayers && online < o.minPlayers;
                    return (
                      <button key={String(o.value)} className={locked ? 'locked' : ''} disabled={locked} aria-pressed={room.settings[f.key] === o.value} onClick={() => send('room:settings', { [f.key]: o.value })}>
                        <span>{o.label}</span>
                        {locked && <small><LockMini /> محتاج {AR(o.minPlayers!)} لاعيبة</small>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          {/* b) the lounge itself, shared by every game */}
          <section className="card flat col" style={{ gap: 12, padding: '12px 14px' }}>
            <span className="display" style={{ fontSize: 18 }}>إعدادات القعدة</span>
            <form className="col" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); saveName(); }}>
              <label htmlFor="roomname" className="label" style={{ fontSize: 12.5 }}>اسم القعدة</label>
              <div className="row" style={{ gap: 6 }}>
                <input id="roomname" className="input" style={{ height: 44, fontSize: 16 }} value={draft} maxLength={24} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn black" style={{ height: 44 }} type="submit" disabled={!draft.trim() || draft.trim() === room.name}>احفظ</button>
              </div>
            </form>
            <div className="col" style={{ gap: 4 }}>
              <span className="label" style={{ fontSize: 12.5 }}>مين يقدر يدخل؟</span>
              <div className="seg" role="group" aria-label="خصوصية القعدة">
                <button aria-pressed={room.privacy === 'private'} onClick={() => send('room:privacy', { privacy: 'private' })}>خاصة</button>
                <button aria-pressed={room.privacy === 'public'} onClick={() => send('room:privacy', { privacy: 'public' })}>عامة</button>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{room.privacy === 'public' ? 'القعدة ظاهرة لأي حد في "قعدات مفتوحة"' : 'بالكود أو اللينك بس'}</span>
            </div>
            <button className={`btn sm ${room.locked ? 'black' : ''}`} aria-pressed={room.locked} onClick={() => send('room:lock', { locked: !room.locked })}>
              {room.locked ? 'الدخول مقفول، دوس تفتحه' : 'اقفل الدخول'}
            </button>
          </section>
        </Sheet>
      )}
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
