import { useEffect, useRef, useState } from 'react';
import { Character, GAMES, SpyIcon } from '../components/art';
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
  // (buttons hold one word or number; the summary uses each option's long form when it has one)
  const summary = schema.map((f) => { const o = f.options.find((x) => x.value === room.settings[f.key]); return o ? (o.full ?? o.label) : null; }).filter(Boolean).join(' · ');
  const [shaking, setShaking] = useState<string | null>(null);
  /** Tapping a locked option: shake, error sound, and say how many players it needs. */
  const tapLocked = (key: string, min: number) => {
    sfx.error();
    toast(`محتاج ${AR(min)} لاعيبة على الأقل`);
    setShaking(key);
    setTimeout(() => setShaking((s) => (s === key ? null : s)), 500);
  };
  /** The one helper line under a group. Groups with player-count requirements get a live one: "معاكم ٤ لاعيبة · جاسوسين من ٦ و٣ من ٩". */
  const hintFor = (f: NonNullable<RoomView['settingsSchema']>[number]) => {
    if (!f.options.some((o) => o.minPlayers)) return f.hint ?? '';
    const locked = f.options.filter((o) => o.minPlayers && online < o.minPlayers && room.settings[f.key] !== o.value);
    return `معاكم ${AR(online)} لاعيبة · ${locked.length ? locked.map((o) => `${o.hintName ?? o.label} من ${AR(o.minPlayers!)}`).join(' و') : 'كل الاختيارات متاحة'}`;
  };
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

  // "ادعي" opens a small sheet with one row per way to invite (instead of several big buttons on the page)
  const [inviteOpen, setInviteOpen] = useState(false);
  const invite = () => setInviteOpen(true);
  const link = `${location.origin}/?room=${room.code}`;
  const inviteText = `تعالى العب معانا ${game.name} في اللمّة! الكود ${room.code}`;

  const shareLink = async () => {
    setInviteOpen(false);
    try {
      if (navigator.share) { await navigator.share({ title: 'اللمّة', text: inviteText, url: link }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(`${inviteText}\n${link}`); toast('اتنسخ اللينك، ابعته لصحابك'); }
    catch { toast(`الكود: ${room.code}`); }
  };
  const copyCodeAndClose = () => { setInviteOpen(false); copyCode(); };
  // a single WhatsApp option: a wa.me link only opens a message to send
  const sendOnWhatsapp = () => {
    setInviteOpen(false);
    const text = `تعالى العب معانا في اللمّة 🎲 الكود: ${room.code}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const inviteRows = [
    { key: 'share', label: 'شارك اللينك', color: 'var(--blue)', onClick: shareLink, icon: <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 3v12M8 7l4-4 4 4" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /> },
    { key: 'code', label: 'انسخ الكود', color: 'var(--yellow)', onClick: copyCodeAndClose, icon: <><rect x="8" y="8" width="12" height="12" rx="2.5" fill="#fff" stroke="#111" strokeWidth={2} /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" /></> },
    // WhatsApp-style glyph: a white speech bubble with a small green handset, on the green tile
    { key: 'wa', label: 'ابعت على واتساب', color: 'var(--green)', onClick: sendOnWhatsapp, icon: <><path d="M12 3a9 9 0 00-7.7 13.6L3 21l4.5-1.2A9 9 0 1012 3z" fill="#fff" stroke="#111" strokeWidth={2} strokeLinejoin="round" /><path d="M9.3 8.4l1.1 2.2-.9.9a6 6 0 003.3 3.3l.9-.9 2.2 1.1c.2.1.3.3.3.5l-.2 1c0 .3-.3.5-.6.5A7.5 7.5 0 018.3 9.1c0-.3.2-.5.5-.6l1-.2c.2 0 .4.1.5.1z" fill="#3DDC97" stroke="#111" strokeWidth={1.2} strokeLinejoin="round" /></> }
  ];

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
      {inviteOpen && (
        <Sheet title="ادعي صحابك" onClose={() => setInviteOpen(false)}>
          <div className="col" style={{ gap: 8 }}>
            {inviteRows.map((r) => (
              <button key={r.key} className="invite-row" onClick={r.onClick}>
                <span className="invite-ic" style={{ background: r.color }}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{r.icon}</svg></span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {isHost && settingsOpen && (
        <Sheet title="الإعدادات" onClose={() => setSettingsOpen(false)}>
          {/* a) the selected game's settings, rendered generically from its schema */}
          <section className="card flat col" style={{ gap: 12, padding: '12px 14px' }}>
            <span className="display" style={{ fontSize: 18 }}>إعدادات اللعبة</span>
            {/* every group: title, buttons with ONE word or number each, one small helper line */}
            {schema.map((f) => (
              <div key={f.key} className="col" style={{ gap: 4 }}>
                <span className="label" style={{ fontSize: 12.5 }}>{f.label}</span>
                <div className={`seg${f.icon ? ' tall' : ''}`} role="group" aria-label={f.label}>
                  {f.options.map((o) => {
                    const selected = room.settings[f.key] === o.value;
                    // not enough players yet: faded with a lock. The selected option never shows a requirement.
                    const locked = !!o.minPlayers && online < o.minPlayers && !selected;
                    const key = `${f.key}:${o.value}`;
                    return (
                      <button
                        key={String(o.value)}
                        className={`${locked ? 'locked' : ''}${shaking === key ? ' shake' : ''}`}
                        aria-pressed={selected}
                        aria-disabled={locked}
                        aria-label={locked ? `${o.full ?? o.label}، محتاج ${AR(o.minPlayers!)} لاعيبة على الأقل` : (o.full ?? o.label)}
                        onClick={() => locked ? tapLocked(key, o.minPlayers!) : send('room:settings', { [f.key]: o.value })}
                      >
                        {f.icon === 'spy' ? (
                          <>
                            <span className="num-big">{AR(o.value)}</span>
                            <span className="hats" aria-hidden="true">{Array.from({ length: Number(o.value) }, (_, i) => <span key={i} className="hat"><SpyIcon size={14} /></span>)}</span>
                          </>
                        ) : <span>{o.label}</span>}
                        {locked && <span className="lock-corner" aria-hidden="true"><LockMini /></span>}
                      </button>
                    );
                  })}
                </div>
                <span className="muted setting-hint">{hintFor(f)}</span>
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
              <span className="label" style={{ fontSize: 12.5 }}>الخصوصية</span>
              <div className="seg" role="group" aria-label="خصوصية القعدة">
                <button aria-pressed={room.privacy === 'private'} onClick={() => send('room:privacy', { privacy: 'private' })}>خاصة</button>
                <button aria-pressed={room.privacy === 'public'} onClick={() => send('room:privacy', { privacy: 'public' })}>عامة</button>
              </div>
              <span className="muted setting-hint">{room.privacy === 'public' ? 'القعدة ظاهرة لأي حد في "قعدات مفتوحة"' : 'بالكود أو اللينك بس'}</span>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <span className="label" style={{ fontSize: 12.5 }}>الدخول</span>
              <div className="seg" role="group" aria-label="الدخول للقعدة">
                <button aria-pressed={!room.locked} onClick={() => send('room:lock', { locked: false })}>مفتوح</button>
                <button aria-pressed={room.locked} onClick={() => send('room:lock', { locked: true })}>مقفول</button>
              </div>
              <span className="muted setting-hint">{room.locked ? 'محدش جديد يقدر يدخل' : 'أي حد معاه الكود يقدر يدخل'}</span>
            </div>
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
