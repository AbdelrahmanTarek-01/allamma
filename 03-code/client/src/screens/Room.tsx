import { useEffect, useRef, useState } from 'react';
import { Character, GAMES, SpyIcon, Trophy } from '../components/art';
import { GameRail } from '../components/GameRail';
import { HelpButton } from '../components/HelpSheet';
import { MuteButton, Sheet } from '../components/ui';
import { AR, leaveRoom, send, toast, type RoomView } from '../net';
import { sfx } from '../sound';
import { loadMapDef } from '../games/map/maps';
import { LEVELS, levelOf } from '../games/difficulty';

const LockMini = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5" fill="#111" /><path d="M8 10V7.5a4 4 0 018 0V10" fill="none" stroke="#111" strokeWidth={3} /></svg>
);

/** Per lounge: the games whose setup sheet the host switched off ("ماتسألنيش تاني"). Lives outside the component because the lounge unmounts while a game runs. */
const skipSetup = new Map<string, Set<string>>();
const isSkipped = (code: string, game: string) => !!skipSetup.get(code)?.has(game);
const setSkipped = (code: string, game: string, on: boolean) => {
  const set = skipSetup.get(code) ?? new Set<string>();
  on ? set.add(game) : set.delete(game);
  skipSetup.set(code, set);
};

export function Room({ room, onBoard }: { room: RoomView; onBoard: () => void }) {
  const me = room.players.find((p) => p.id === room.youId)!;
  const isHost = room.hostId === room.youId;
  const online = room.players.filter((p) => p.connected).length;
  const [manageId, setManageId] = useState<string | null>(null);
  const [confirmKick, setConfirmKick] = useState(false);
  const target = room.players.find((p) => p.id === manageId && p.id !== room.youId);
  const closeManage = () => { setManageId(null); setConfirmKick(false); };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setup, setSetup] = useState<null | 'start' | 'edit'>(null); // the "ظبّط اللعبة" sheet: before a start, or opened from the card's gear (no start button)
  const [dontAsk, setDontAsk] = useState(false);
  const openGear = () => { setDraft(room.name); setSettingsOpen(true); };
  const openSetup = (mode: 'start' | 'edit') => { setDontAsk(isSkipped(room.code, room.selectedGame)); setSetup(mode); };
  const begin = () => { setSkipped(room.code, room.selectedGame, dontAsk); setSetup(null); send('game:start'); };
  const [draft, setDraft] = useState('');
  const game = GAMES.find((g) => g.id === room.selectedGame) ?? GAMES[0];
  const schema = room.settingsSchema ?? [];
  // one compact line for everyone, built from the schema: "٨ دقايق · ٣ جولات · جاسوس واحد"
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

  // the map game is a separate download: warm it up (code + the chosen map) while the lounge is open
  const mapScope = room.settings.scope;
  useEffect(() => {
    if (room.selectedGame !== 'map') return;
    import('./MapGame').catch(() => {});
    loadMapDef(mapScope).catch(() => {});
  }, [room.selectedGame, mapScope]);

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
  const [copied, setCopied] = useState(false);
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

  /** The selected game's settings, rendered generically from its schema: used by the gear sheet (editLevel) and the start sheet (level read-only). */
  const gameFields = (editLevel: boolean) => (
    <>
        {/* shared difficulty: one control for every game that has a level table, in the level colours */}
        {room.hasLevels && (
          <div className="col" style={{ gap: 4 }}>
            <span className="label" style={{ fontSize: 12.5 }}>الصعوبة</span>
            {editLevel ? (
              <div className="seg" role="group" aria-label="الصعوبة">
                {LEVELS.map((l) => {
                  const on = room.difficulty === l.id;
                  return (
                    <button
                      key={l.id}
                      aria-pressed={on}
                      style={on ? { background: l.color, color: '#111' } : { boxShadow: `inset 0 -6px 0 ${l.color}` }}
                      onClick={() => send('room:difficulty', { level: l.id })}
                    >{l.label}</button>
                  );
                })}
              </div>
            ) : (
              <span className="chip" style={{ background: levelOf(room.difficulty).color, alignSelf: 'flex-start', fontSize: 14 }}>{levelOf(room.difficulty).label}</span>
            )}
            <span className="muted setting-hint">{editLevel ? 'بتغيّر الوقت وعدد الاختيارات والأماكن والنقط' : 'ثابتة من إعدادات القعدة، وبتغيّر الوقت والاختيارات والنقط'}</span>
          </div>
        )}
        {/* الموجة in teams mode: shuffle the teams or tap a player to move them to the other team */}
        {room.teams && (
          <div className="col" style={{ gap: 6 }}>
            <div className="row between">
              <span className="label" style={{ fontSize: 12.5 }}>الفريقين</span>
              <button className="btn sm" onClick={() => { sfx.select(); send('room:teams', { op: 'shuffle' }); }}>اخلط</button>
            </div>
            <div className="grid2">
              {[0, 1].map((t) => (
                <div key={t} className="team-col" style={{ ['--tc' as any]: t === 0 ? '#4D9DFF' : '#FF8A3D' }}>
                  <span className="display" style={{ fontSize: 15 }}>{t === 0 ? 'الأزرق' : 'البرتقالي'}</span>
                  {room.players.filter((p) => room.teams![p.id] === t).map((p) => (
                    <button key={p.id} className="team-player" aria-label={`انقل ${p.name} للفريق التاني`} onClick={() => { sfx.card(); send('room:teams', { op: 'move', playerId: p.id }); }}>
                      <Character id={p.avatar} size={26} /><span>{p.id === room.youId ? 'إنت' : p.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <span className="muted setting-hint">دوس على لاعب علشان ينتقل للفريق التاني · محتاجين ٤ لاعيبة على الأقل</span>
          </div>
        )}
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
    </>
  );

  return (
    <main className="screen">
      <header className="row">
        <button className="btn icon" aria-label="اخرج من الأوضة" onClick={leaveRoom}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <div className="col grow" style={{ gap: 0, minWidth: 0, lineHeight: 1.2 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="label" style={{ fontSize: 12 }}>القعدة</span>
            <span className="chip soft" style={{ minHeight: 0, height: 20, fontSize: 11, padding: '0 7px', gap: 3 }}>
              {room.privacy !== 'public' && <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" fill="#111" /><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#111" strokeWidth={3} /></svg>}
              {room.privacy === 'public' ? 'عامة' : 'خاصة'}
            </span>
            {room.locked && <span className="chip dark" style={{ minHeight: 0, height: 20, fontSize: 11, padding: '0 7px' }}>مقفولة</span>}
          </div>
          <span className="display" style={{ fontSize: 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.name}</span>
        </div>
        {/* one grouped bar: trophy, settings (host only), sound */}
        <div className="hbar">
          <button className="hbar-btn" aria-label="ترتيب القعدة" onClick={() => { sfx.tap(); onBoard(); }}><Trophy size={28} /></button>
          {isHost && (
            <>
              <span className="hbar-sep" />
              <button className="hbar-btn" aria-label="إعدادات اللعبة والقعدة" onClick={openGear}>
                <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3h3.4l.5 2.4 1.7.7 2.1-1.3 2.4 2.4-1.3 2.1.7 1.7 2.4.5v3.4l-2.4.5-.7 1.7 1.3 2.1-2.4 2.4-2.1-1.3-1.7.7-.5 2.4h-3.4l-.5-2.4-1.7-.7-2.1 1.3-2.4-2.4 1.3-2.1-.7-1.7L3 13.7v-3.4l2.4-.5.7-1.7-1.3-2.1 2.4-2.4 2.1 1.3 1.7-.7z" fill="#B48CFF" stroke="#111" strokeWidth={1.8} strokeLinejoin="round" /><circle cx="12" cy="12" r="3.2" fill="#fff" stroke="#111" strokeWidth={1.8} /></svg>
              </button>
            </>
          )}
          <span className="hbar-sep" />
          <MuteButton bare />
        </div>
      </header>

      {/* the room code as a ticket: never wraps or truncates; tap to copy */}
      <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
        <button className="ticket" onClick={() => { copyCode(); setCopied(true); setTimeout(() => setCopied(false), 1400); }} aria-label={`انسخ الكود ${room.code}`}>
          <span className="ticket-notch r" aria-hidden="true" /><span className="ticket-notch l" aria-hidden="true" />
          <span className="col grow" style={{ gap: 0, lineHeight: 1.1, paddingInlineStart: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 900, opacity: 0.65 }}>كود الأوضة</span>
            <span dir="ltr" className="display ticket-code">{room.code}</span>
          </span>
          <span className="ticket-cut" aria-hidden="true" />
          <span className="col center" style={{ gap: 1, fontSize: 11, fontWeight: 900, paddingInlineEnd: 4, minWidth: 40 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.4} strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3" fill="#FFF3C4" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></svg>
            {copied ? 'اتنسخ' : 'انسخ'}
          </span>
        </button>
        <button className="invite-big" onClick={invite}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFD23F" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0112 0M18 8v6M15 11h6" /></svg>
          ادعي
        </button>
      </div>

      <div className="col" style={{ gap: 6 }}>
        <span className="label" style={{ fontSize: 12 }}>هتلعبوا إيه؟</span>
        <GameRail selected={room.selectedGame} onPick={isHost ? (id) => { sfx.tap(); const g = GAMES.find((x) => x.id === id)!; if (g.ready) send('room:selectGame', { game: id }); else toast(`${g.name} جاية قريب`); } : undefined} />
      </div>

      {/* the selected game stays a small card: icon, name, one summary line, "?" help. Settings live behind the host's gear. */}
      <section className="card row" style={{ gap: 12, padding: '12px 14px' }}>
        <span className="icontile" style={{ background: game.color, width: 46, height: 46, flex: 'none' }}>{game.icon}</span>
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <span className="row" style={{ gap: 8 }}>
            <span className="display" style={{ fontSize: 19 }}>{game.name}</span>
            {/* the shared level as a coloured chip for everyone (the host changes it in the gear) */}
            {room.hasLevels && <span className="chip" style={{ background: levelOf(room.difficulty).color, fontSize: 12 }}>{levelOf(room.difficulty).label}</span>}
          </span>
          {summary && <span style={{ fontSize: 13, fontWeight: 800 }}>{summary}</span>}
        </div>
        <div className="col" style={{ gap: 6, alignItems: 'center', flex: 'none' }}>
          <HelpButton gameId={game.id} />
        </div>
      </section>
      {isHost && (
        <button className="btn full gear-btn" onClick={() => { sfx.tap(); openSetup('edit'); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3h3.4l.5 2.4 1.7.7 2.1-1.3 2.4 2.4-1.3 2.1.7 1.7 2.4.5v3.4l-2.4.5-.7 1.7 1.3 2.1-2.4 2.4-2.1-1.3-1.7.7-.5 2.4h-3.4l-.5-2.4-1.7-.7-2.1 1.3-2.4-2.4 1.3-2.1-.7-1.7L3 13.7v-3.4l2.4-.5.7-1.7-1.3-2.1 2.4-2.4 2.1 1.3 1.7-.7z" fill="#B48CFF" stroke="#111" strokeWidth={1.8} strokeLinejoin="round" /><circle cx="12" cy="12" r="3.2" fill="#fff" stroke="#111" strokeWidth={1.8} /></svg>
          إعدادات اللعبة
        </button>
      )}

      <div className="row" style={{ gap: 10 }}>
        <h2 className="display h2">اللاعيبة</h2>
        <span className="chip">{AR(room.players.length)} من {AR(room.maxPlayers)}</span>
      </div>

      <div className="strip">
        {room.players.length < room.maxPlayers && (
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
            <span className="label center" style={{ textAlign: 'center' }}>محتاجين {AR(room.minPlayers)} على الأقل · معاكم {AR(online)}</span>
            <button className="btn big full" disabled={online < room.minPlayers} onClick={() => { if (isSkipped(room.code, room.selectedGame)) send('game:start'); else { sfx.tap(); openSetup('start'); } }}>ابدأ اللعبة</button>
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
      {isHost && setup && (
        <Sheet title="ظبّط اللعبة" onClose={() => setSetup(null)}>
          <section className="card flat col" style={{ gap: 12, padding: '12px 14px' }}>
            <span className="row" style={{ gap: 8 }}><span className="display" style={{ fontSize: 18 }}>{game.name}</span></span>
            {gameFields(true)}
          </section>
          <div className="col" style={{ gap: 4 }}>
            <label className="row" style={{ gap: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" className="ck" checked={dontAsk} onChange={(e) => { e.target.checked ? sfx.toggleOn() : sfx.toggleOff(); setDontAsk(e.target.checked); if (setup === 'edit') setSkipped(room.code, room.selectedGame, e.target.checked); }} />
              ماتسألنيش تاني عن «{game.name}» في القعدة دي
            </label>
            <span className="muted setting-hint">تقدر تغيّر الإعدادات دي في أي وقت من «إعدادات اللعبة» في كارت اللعبة</span>
          </div>
          {setup === 'start' && <button className="btn big full" disabled={online < room.minPlayers} onClick={begin}>يلا نبدأ</button>}
        </Sheet>
      )}
      {isHost && settingsOpen && (
        <Sheet title="الإعدادات" onClose={() => setSettingsOpen(false)}>
          {/* a) the selected game's settings, rendered generically from its schema */}
          <section className="card flat col" style={{ gap: 12, padding: '12px 14px' }}>
            <span className="display" style={{ fontSize: 18 }}>إعدادات اللعبة</span>
            {gameFields(true)}
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
                {([['open', 'مفتوح'], ['ask', 'بإذن'], ['locked', 'مقفول']] as const).map(([m, label]) => (
                  <button key={m} aria-pressed={room.joinMode === m} onClick={() => send('room:joinMode', { mode: m })}>{label}</button>
                ))}
              </div>
              <span className="muted setting-hint">{room.joinMode === 'locked' ? 'محدش جديد يقدر يدخل' : room.joinMode === 'ask' ? 'أي حد جديد يبعتلك طلب وإنت توافق (اللي كانوا فيها بيرجعوا لوحدهم)' : 'أي حد معاه الكود يقدر يدخل'}</span>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <span className="label" style={{ fontSize: 12.5 }}>أقصى عدد</span>
              <div className="seg" role="group" aria-label="أقصى عدد للاعيبة">
                {[4, 6, 8, 12].map((n) => {
                  // below who is here now or below what the selected game needs: locked, like the spy count
                  const tooFew = n < room.players.length, tooSmall = n < room.minPlayers;
                  const locked = tooFew || tooSmall;
                  return (
                    <button
                      key={n}
                      className={`${locked ? 'locked' : ''}${shaking === `cap${n}` ? ' shake' : ''}`}
                      aria-pressed={room.maxPlayers === n}
                      aria-disabled={locked}
                      aria-label={locked ? `${AR(n)}، ${tooFew ? `فيه ${AR(room.players.length)} لاعيبة دلوقتي` : `اللعبة محتاجة ${AR(room.minPlayers)} لاعيبة`}` : AR(n)}
                      onClick={() => {
                        if (!locked) return void send('room:maxPlayers', { max: n });
                        sfx.error();
                        toast(tooFew ? `فيه ${AR(room.players.length)} لاعيبة في القعدة دلوقتي` : `اللعبة دي محتاجة ${AR(room.minPlayers)} لاعيبة على الأقل`);
                        setShaking(`cap${n}`);
                        setTimeout(() => setShaking((s) => (s === `cap${n}` ? null : s)), 500);
                      }}
                    >
                      <span>{AR(n)}</span>
                      {locked && <span className="lock-corner" aria-hidden="true"><LockMini /></span>}
                    </button>
                  );
                })}
              </div>
              <span className="muted setting-hint">القعدة بتقفل لوحدها لما يبقوا {AR(room.maxPlayers)}</span>
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
