import { useEffect, useMemo, useState } from 'react';
import { AR, send } from '../net';
import { sfx } from '../sound';
import { Sheet } from './ui';

/** The games we are cooking next (01-brainstorm/home-v2.md). Ids match the server's IDEA_IDS. */
export const IDEAS = [
  { id: 'categories', name: 'اسم حيوان جماد بلاد', min: 2, text: 'حرف عشوائي وكل واحد يكتب في كل خانة · الإجابة اللي محدش كتبها بتاخد نقط أكتر', color: '#3DDC97' },
  { id: 'mafia', name: 'المافيا', min: 5, text: 'فيه قتلة مستخبيين وسطكم · بالليل بيختاروا، وبالنهار الكل يتناقش ويصوّت', color: '#B48CFF' },
  { id: 'taboo', name: 'ماتقولش الكلمة', min: 4, text: 'وصّف الكلمة لفريقك من غير ما تقول ٣ كلمات ممنوعة', color: '#FF8A3D' },
  { id: 'bluff', name: 'الكدبة الحلوة', min: 3, text: 'سؤال غريب · كل واحد يألّف إجابة كدب تقنع، والباقي يدوّروا على الحقيقية', color: '#FF4F9A' },
  { id: 'whoami', name: 'مين فينا؟', min: 3, text: '«مين فينا هيتأخر على فرحه؟» · الكل يصوّت وتطلع النتيجة', color: '#4D9DFF' },
  { id: 'twotruths', name: 'صدق ولا كدب', min: 3, text: 'كل واحد يقول ٣ حاجات عن نفسه، واحدة فيهم كدب', color: '#FFD23F' },
  { id: 'telephone', name: 'تليفون مكسور', min: 4, text: 'جملة تتحوّل رسمة وترجع جملة · وتشوفوا وصلت لفين', color: '#9ADFFF' }
];

const S = { stroke: '#111', strokeWidth: 2.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** Filled icon with black outlines for each idea (viewBox 48). */
export function IdeaIcon({ id, size = 34 }: { id: string; size?: number }) {
  let g: JSX.Element;
  switch (id) {
    case 'categories':
      g = <><rect x="5" y="5" width="17" height="17" rx="4" fill="#fff" {...S} /><rect x="26" y="5" width="17" height="17" rx="4" fill="#FF4F9A" {...S} /><rect x="5" y="26" width="17" height="17" rx="4" fill="#4D9DFF" {...S} /><rect x="26" y="26" width="17" height="17" rx="4" fill="#fff" {...S} /><path d="M10 12h7M10 16h5M31 33h7M31 37h5" {...S} fill="none" /></>;
      break;
    case 'mafia': // a fedora
      g = <><path d="M14 28l2-14c5-3 11-3 16 0l2 14z" fill="#111" {...S} /><path d="M15 24h18" stroke="#FF4F9A" strokeWidth={4} /><path d="M5 30c0 4 8 7 19 7s19-3 19-7c0-2-3-3-5-3H10c-2 0-5 1-5 3z" fill="#fff" {...S} /></>;
      break;
    case 'taboo': // a forbidden word
      g = <><circle cx="24" cy="24" r="17" fill="#fff" {...S} /><path d="M17 20h14M17 28h9" {...S} fill="none" /><path d="M12 36L36 12" stroke="#FF4F9A" strokeWidth={5} strokeLinecap="round" /><circle cx="24" cy="24" r="17" fill="none" {...S} /></>;
      break;
    case 'bluff': // a winking face with a tongue
      g = <><circle cx="24" cy="24" r="18" fill="#FFD23F" {...S} /><circle cx="17" cy="20" r="2.8" fill="#111" /><path d="M27 20h8" {...S} fill="none" /><path d="M14 29q10 9 20 0z" fill="#fff" {...S} /><path d="M21 33q3 6 6 0z" fill="#FF4F9A" {...S} strokeWidth={2} /></>;
      break;
    case 'whoami': // a "?" over a head
      g = <><circle cx="24" cy="32" r="9" fill="#fff" {...S} /><path d="M7 45c1-8 8-9 17-9s16 1 17 9z" fill="#4D9DFF" {...S} /><path d="M18 14c0-4 3-6 6-6s6 2 6 5c0 4-6 4-6 8" fill="none" {...S} strokeWidth={3.4} /><circle cx="24" cy="25" r="1.8" fill="#111" /></>;
      break;
    case 'twotruths': // a tick and a cross
      g = <><rect x="4" y="5" width="21" height="21" rx="6" fill="#3DDC97" {...S} /><path d="M9 16l4 4 8-9" {...S} fill="none" strokeWidth={3.2} /><rect x="23" y="22" width="21" height="21" rx="6" fill="#FF4F9A" {...S} /><path d="M29 28l9 9M38 28l-9 9" {...S} fill="none" strokeWidth={3.2} /></>;
      break;
    default: // telephone: a phone with a sentence
      g = <><rect x="12" y="4" width="24" height="40" rx="7" fill="#fff" {...S} /><rect x="16" y="10" width="16" height="22" rx="3" fill="#9ADFFF" {...S} strokeWidth={2} /><path d="M19 17h10M19 22h6" {...S} fill="none" strokeWidth={2} /><circle cx="24" cy="38" r="2.2" fill="#111" /></>;
  }
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">{g}</svg>;
}

function Flame({ on }: { on: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className={on ? 'flame on' : 'flame'}>
      <path d="M12 2.5c.8 3.3 5.5 5.8 5.5 11a5.5 5.5 0 01-11 0c0-2 .9-3.400 2-4.500.2 1.600.9 2.400 1.700 2.800C10 8 10.600 5 12 2.500z" fill={on ? '#FF8A3D' : '#fff'} stroke="#111" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 13.500c1.500 1.200 2.200 2 2.200 3.200a2.200 2.200 0 01-4.400 0c0-1 .8-1.900 2.200-3.200z" fill={on ? '#FFD23F' : '#FFF3C4'} stroke="#111" strokeWidth="1.500" strokeLinejoin="round" />
    </svg>
  );
}

type VoteState = { counts: Record<string, number>; mine: string[] };

/** "بنحضّر ٧ كمان": one vote per idea per player. A second tap takes the vote back. Sorted by votes, live. */
export function IdeasSheet({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<VoteState | null>(null);

  useEffect(() => {
    send('ideas:list').then((r) => { if (r.ok) setState({ counts: r.counts, mine: r.mine }); else setState({ counts: {}, mine: [] }); });
  }, []);

  const vote = async (id: string) => {
    if (!state) return;
    const on = !state.mine.includes(id);
    // instant feedback, then the server's numbers
    setState({ counts: { ...state.counts, [id]: Math.max(0, (state.counts[id] ?? 0) + (on ? 1 : -1)) }, mine: on ? [...state.mine, id] : state.mine.filter((x) => x !== id) });
    on ? sfx.select() : sfx.toggleOff();
    const r = await send('ideas:vote', { idea: id, on });
    if (r.ok) setState({ counts: r.counts, mine: r.mine });
  };

  const count = (id: string) => state?.counts[id] ?? 0;
  // most votes first; ties keep the doc's order
  const sorted = useMemo(() => IDEAS.map((x, i) => ({ x, i })).sort((a, b) => count(b.x.id) - count(a.x.id) || a.i - b.i).map((o) => o.x), [state]);
  const max = Math.max(1, ...IDEAS.map((x) => count(x.id)));

  return (
    <Sheet title="ألعاب جاية" onClose={onClose}>
      <span style={{ fontSize: 12.5, fontWeight: 800 }}>صوّت للعبة اللي عاوزها، والأكتر أصوات بنبدأ بيها</span>
      <div className="col" style={{ gap: 8 }}>
        {sorted.map((idea, i) => {
          const voted = !!state?.mine.includes(idea.id);
          const n = count(idea.id);
          const top = i === 0 && n > 0;
          return (
            <div key={idea.id} className="idea-row" style={{ ['--ic' as any]: idea.color }}>
              <span className="idea-ic" style={{ background: idea.color }}><IdeaIcon id={idea.id} /></span>
              <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className="display" style={{ fontSize: 16, lineHeight: 1.25 }}>{idea.name}</span>
                  <span className="idea-min">من {AR(idea.min)}+</span>
                  {top && <span className="idea-top">الأكتر طلباً</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>{idea.text}</span>
                <span className="idea-bar" aria-hidden="true"><i style={{ width: `${(n / max) * 100}%`, background: idea.color }} /></span>
              </div>
              <button className={`vote-btn${voted ? ' on' : ''}`} disabled={!state} aria-pressed={voted} aria-label={`${voted ? 'شيل صوتك من' : 'صوّت لـ'} ${idea.name}`} onClick={() => vote(idea.id)}>
                <span key={String(voted)} className="flick"><Flame on={voted} /></span>
                <b className="display num vote-n">{state ? AR(n) : '–'}</b>
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
