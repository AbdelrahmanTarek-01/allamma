import { useState } from 'react';
import { Character, GAMES, Plus } from '../components/art';
import { MuteButton } from '../components/ui';
import { send, toast, useStore } from '../net';
import { sfx } from '../sound';

export function Home({ onEditProfile }: { onEditProfile: () => void }) {
  const { profile } = useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async () => {
    if (code.trim().length < 4) return toast('اكتب كود الأوضة كامل');
    setBusy(true);
    await send('room:join', { code: code.trim().toUpperCase() });
    setBusy(false);
  };
  const create = async () => {
    setBusy(true);
    await send('room:create');
    setBusy(false);
  };

  return (
    <main className="screen">
      <header className="row between">
        <span className="logo">اللمّة<i>.</i></span>
        <div className="row" style={{ gap: 8 }}>
          <MuteButton />
          <button className="float" onClick={onEditProfile} aria-label="غيّر اسمك أو شخصيتك" style={{ border: 0, background: 'none', padding: 0 }}>
            <Character id={profile!.avatar} size={54} />
          </button>
        </div>
      </header>

      <section className="card col" style={{ gap: 10 }}>
        <label htmlFor="code" className="label" style={{ fontSize: 17 }}>معاك كود؟ ادخل على طول</label>
        <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); join(); }}>
          <input id="code" className="input code" placeholder="الكود" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
          <button className="btn black" disabled={busy} type="submit">يلا</button>
        </form>
        <button className="btn yellow full" disabled={busy} onClick={create}><Plus /> اعمل أوضة جديدة</button>
      </section>

      <h2 className="display" style={{ fontSize: 28 }}>هتلعبوا إيه النهارده؟</h2>

      <div className="grid2 stagger">
        {GAMES.map((g, i) => (
          <button
            key={g.id}
            className={`tile${g.ready ? '' : ' off'}`}
            style={{ height: 134, animationDelay: `${i * 60}ms` }}
            onClick={() => { sfx.tap(); if (g.ready) create(); else toast(`${g.name} جاية قريب`); }}
          >
            {!g.ready && <span className="chip badge">قريباً</span>}
            <span className="icontile" style={{ background: g.color }}>{g.icon}</span>
            <span className="display" style={{ fontSize: 21, marginTop: 4 }}>{g.name}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>{g.tagline}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
