import { useEffect, useState } from 'react';
import { AVATAR_IDS, CHARACTERS, Character } from '../components/art';
import { saveProfile, useStore } from '../net';
import { sfx } from '../sound';

const HISTORY_FLAG = 'allammaEdit';

/**
 * First time (no profile): pick a name and character, no way back.
 * Edit mode (profile exists, opened from Home): back button, "احفظ" only when something changed (otherwise "رجوع"),
 * and the phone/browser back gesture closes it without saving. Edit mode owns one history entry: the buttons
 * go through history.back() and the popstate handler does the closing, so the back gesture and the buttons
 * share one path and the history stays clean.
 */
export function Onboarding({ onCancel }: { onCancel: () => void }) {
  const { profile } = useStore();
  const editing = !!profile;
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? 'c1');
  const ok = name.trim().length > 0;
  const changed = editing && (name.trim() !== profile!.name || avatar !== profile!.avatar);

  useEffect(() => {
    if (!editing) return;
    // guarded so React StrictMode's double effect in dev can't push two entries
    if (!history.state?.[HISTORY_FLAG]) history.pushState({ [HISTORY_FLAG]: true }, '');
    window.addEventListener('popstate', onCancel);
    return () => window.removeEventListener('popstate', onCancel);
  }, []);

  /** Drop our history entry (which fires popstate -> onCancel). Falls back to closing directly if the entry is gone. */
  const popEntry = () => { if (history.state?.[HISTORY_FLAG]) history.back(); else onCancel(); };

  const act = () => {
    if (!editing) return ok ? saveProfile(name, avatar) : undefined;
    if (!changed) return popEntry(); // nothing changed: just go back
    if (!ok) return;
    saveProfile(name, avatar); // App closes edit mode when the profile changes
    if (history.state?.[HISTORY_FLAG]) history.back(); // keep history clean (popstate -> onCancel is harmless by then)
  };

  return (
    <main className="screen">
      <header className="row">
        {editing && (
          <button className="btn icon" aria-label="رجوع من غير حفظ" onClick={popEntry}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        )}
        <div className="col grow" style={{ gap: 0 }}>
          <span className="label">{editing ? 'غيّر شكلك' : 'أول مرة هنا؟'}</span>
          <h1 className="display h1">اختار شخصيتك</h1>
        </div>
      </header>

      <div className="card row" style={{ gap: 14 }}>
        <div key={avatar} className="pop-in float"><Character id={avatar} size={120} title={CHARACTERS[avatar].label} /></div>
        <div className="col" style={{ minWidth: 0 }}>
          <span className="chip" style={{ alignSelf: 'flex-start', background: 'var(--yellow)' }}>{CHARACTERS[avatar].label}</span>
          <span className="display h2" style={{ overflowWrap: 'anywhere' }}>{name.trim() || 'من غير اسم'}</span>
        </div>
      </div>

      <form className="col" onSubmit={(e) => { e.preventDefault(); act(); }}>
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

      <button className="btn big full push" disabled={!ok} onClick={act}>
        {!ok ? 'اكتب اسمك الأول' : !editing ? 'يلا بينا' : changed ? 'احفظ' : 'رجوع'}
      </button>
    </main>
  );
}
