import { useState } from 'react';
import { AVATAR_IDS, CHARACTERS, Character } from '../components/art';
import { saveProfile, useStore } from '../net';
import { sfx } from '../sound';

export function Onboarding() {
  const { profile } = useStore();
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? 'c1');
  const ok = name.trim().length > 0;

  return (
    <main className="screen">
      <div className="col" style={{ gap: 0 }}>
        <span className="label">{profile ? 'غيّر شكلك' : 'أول مرة هنا؟'}</span>
        <h1 className="display h1">اختار شخصيتك</h1>
      </div>

      <div className="card row" style={{ gap: 14 }}>
        <div key={avatar} className="pop-in float"><Character id={avatar} size={120} title={CHARACTERS[avatar].label} /></div>
        <div className="col" style={{ minWidth: 0 }}>
          <span className="chip" style={{ alignSelf: 'flex-start', background: 'var(--yellow)' }}>{CHARACTERS[avatar].label}</span>
          <span className="display h2" style={{ overflowWrap: 'anywhere' }}>{name.trim() || 'من غير اسم'}</span>
        </div>
      </div>

      <form className="col" onSubmit={(e) => { e.preventDefault(); if (ok) saveProfile(name, avatar); }}>
        <label htmlFor="pname" className="label" style={{ fontSize: 15 }}>اسمك اللي صحابك هيشوفوه</label>
        <input id="pname" className="input" value={name} maxLength={14} placeholder="اكتب اسمك" autoComplete="nickname" onChange={(e) => { setName(e.target.value); sfx.type(); }} />
      </form>

      <span className="label" style={{ fontSize: 15 }}>دوس على الشخصية اللي شبهك</span>
      <div className="grid4">
        {AVATAR_IDS.map((id) => (
          <button
            key={id}
            aria-label={CHARACTERS[id].label}
            aria-pressed={avatar === id}
            onClick={() => { setAvatar(id); sfx.select(); }}
            style={{
              height: 76, border: '2.5px solid #111', borderRadius: 18, padding: 0,
              background: avatar === id ? 'var(--yellow-soft)' : '#fff',
              boxShadow: avatar === id ? '0 0 0 3px var(--yellow), 0 0 0 6px #111' : '3px 3px 0 #111',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Character id={id} size={60} />
          </button>
        ))}
      </div>

      <button className="btn big full push" disabled={!ok} onClick={() => saveProfile(name, avatar)}>
        {ok ? 'يلا بينا' : 'اكتب اسمك الأول'}
      </button>
    </main>
  );
}
