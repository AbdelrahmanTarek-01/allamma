import { useEffect, useState } from 'react';
import { AR, send } from '../net';
import { sfx } from '../sound';
import { Sheet } from './ui';

/** The games we are cooking next (01-brainstorm/home-v2.md). Ids match the server's IDEA_IDS. */
const IDEAS = [
  { id: 'categories', name: 'اسم حيوان جماد بلاد', text: 'حرف عشوائي وكل واحد يكتب إجابة لكل خانة. الإجابة اللي محدش كتبها بتجيب نقط أكتر.', color: '#3DDC97' },
  { id: 'mafia', name: 'المافيا', text: 'قتلة مخفيين: بالليل بيختاروا ضحية، وبالنهار بنتناقش ونصوّت.', color: '#FF4F9A' },
  { id: 'taboo', name: 'ماتقولش الكلمة', text: 'وصّف الكلمة لفريقك من غير ٣ كلمات ممنوعة.', color: '#FF8A3D' },
  { id: 'bluff', name: 'الكدبة الحلوة', text: 'سؤال غريب، وكل واحد يألّف إجابة مقنعة، والباقي يدوّروا على الصح.', color: '#B48CFF' },
  { id: 'whoami', name: 'مين فينا؟', text: '«مين أكتر واحد فينا ممكن…» وكلنا نصوّت.', color: '#4D9DFF' },
  { id: 'twotruths', name: 'صدق ولا كدب', text: '٣ جمل عن نفسك، واحدة منهم كدبة.', color: '#FFD23F' },
  { id: 'telephone', name: 'تليفون مكسور', text: 'جملة، بعدين رسمة، بعدين جملة، وبتتغيّر على طول السلسلة.', color: '#3DDC97' }
];

type VoteState = { counts: Record<string, number>; mine: string[] };

/** "بنحضّر ٧ كمان": one vote per idea per player. A second tap takes the vote back. */
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

  return (
    <Sheet title="بنحضّر ٧ كمان" onClose={onClose}>
      <span className="muted">صوّت للألعاب اللي نفسك نشوفها الأول.</span>
      <div className="col" style={{ gap: 8 }}>
        {IDEAS.map((idea, i) => {
          const voted = !!state?.mine.includes(idea.id);
          return (
            <div key={idea.id} className="idea-row pop-in" style={{ animationDelay: `${i * 40}ms`, ['--ic' as any]: idea.color }}>
              <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                <span className="display" style={{ fontSize: 17 }}>{idea.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{idea.text}</span>
              </div>
              <button className={`vote-btn${voted ? ' on' : ''}`} disabled={!state} aria-pressed={voted} aria-label={`${voted ? 'شيل صوتك من' : 'صوّت لـ'} ${idea.name}`} onClick={() => vote(idea.id)}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.600 4.600 0 018-3 4.600 4.600 0 018 3c0 5.800-8 11-8 11z" fill={voted ? '#FF4F9A' : '#fff'} stroke="#111" strokeWidth="2.200" strokeLinejoin="round" /></svg>
                <b className="num">{state ? AR(state.counts[idea.id] ?? 0) : '–'}</b>
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
