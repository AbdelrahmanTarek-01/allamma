import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HELP } from '../games';
import type { HelpIcon } from '../games/help-types';
import { SpyIcon, GAMES } from './art';
import { sfx } from '../sound';
import { Sheet } from './ui';

const S = { stroke: '#111', strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** Small filled icons with black outlines, same style as the rest of the app. */
function StepIcon({ name }: { name: HelpIcon }) {
  switch (name) {
    case 'card':
      return (<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3" fill="#FFF3C4" {...S} /><path d="M12 8.5a2.2 2.2 0 11.9 4c-.6.4-.9.8-.9 1.4" fill="none" {...S} /><circle cx="12" cy="16.6" r=".9" fill="#111" /></svg>);
    case 'chat':
      return (<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z" fill="#4D9DFF" {...S} /><circle cx="8.5" cy="10.5" r="1.2" fill="#111" /><circle cx="12" cy="10.5" r="1.2" fill="#111" /><circle cx="15.5" cy="10.5" r="1.2" fill="#111" /></svg>);
    case 'vote':
      return (<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#3DDC97" {...S} /><path d="M7.5 12.5l3 3 6-6.5" fill="none" {...S} strokeWidth={2.6} /></svg>);
    case 'spy':
      return <SpyIcon size={30} />;
    case 'trophy':
      return (<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v6a5 5 0 01-10 0z" fill="#FFD23F" {...S} /><path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3" fill="none" {...S} /><path d="M12 15v3M8.5 20h7" {...S} /></svg>);
    case 'clock':
      return (<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#FF8A3D" {...S} /><path d="M12 7v5l3 2" fill="none" {...S} /></svg>);
    case 'star':
      return (<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.6 19.6l1.1-6L3.2 9.4l6.1-.8z" fill="#FFD23F" {...S} /></svg>);
  }
}

/** "How to play" sheet, rendered generically from games/<game>/help.ts. */
export function HelpSheet({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const game = GAMES.find((g) => g.id === gameId);
  const help = HELP[gameId];
  if (!game || !help) return null;
  return (
    <Sheet title={`إزاي تلعب ${game.name}`} onClose={onClose}>
      <p className="help-idea">{help.idea.split('\n').map((line, i) => <span key={i}>{line}</span>)}</p>
      {help.comingSoon && <span className="chip dark" style={{ alignSelf: 'flex-start' }}>جاية قريب</span>}

      {help.steps.length > 0 && (
        <ol className="help-steps">
          {help.steps.map((s, i) => (
            <li key={i}>
              <span className="help-num">{['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨'][i]}</span>
              <span className="icontile help-ic"><StepIcon name={s.icon} /></span>
              <span className="help-text">{s.text}</span>
            </li>
          ))}
        </ol>
      )}

      {help.points && (
        <div className="card flat col" style={{ padding: '10px 12px', gap: 6 }}>
          <span className="display" style={{ fontSize: 17 }}>النقط</span>
          {help.points.map((p) => (
            <div key={p.label} className="help-row"><span>{p.label}</span><b className="num">{p.value}</b></div>
          ))}
          {help.multipliers && (
            <>
              <span className="label" style={{ fontSize: 12.5, marginTop: 4 }}>الصعوبة بتضرب النقط (وتتقرّب لأقرب ١٠)</span>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {help.multipliers.map((m) => <span key={m.label} className="chip soft" style={{ fontSize: 13, padding: '2px 12px' }}>{m.label} {m.value}</span>)}
              </div>
            </>
          )}
        </div>
      )}

      <div className="help-tip">
        <StepIcon name="star" />
        <span><b>نصيحة:</b> {help.tip}</span>
      </div>
    </Sheet>
  );
}

/** A small "?" that opens the how-to-play sheet of a game. Rendered through a portal so it works inside animated tiles. */
export function HelpButton({ gameId, className = '' }: { gameId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`help-btn ${className}`} aria-label="إزاي تلعب" onClick={(e) => { e.stopPropagation(); sfx.card(); setOpen(true); }}>?</button>
      {open && createPortal(<HelpSheet gameId={gameId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
