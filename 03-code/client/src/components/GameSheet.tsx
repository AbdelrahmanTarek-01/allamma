import { HELP } from '../games';
import { AR } from '../net';
import { sfx } from '../sound';
import { GAMES } from './art';
import { Sheet } from './ui';

/** Players each game needs (same numbers as the server's GameDef.minPlayers). */
export const MIN: Record<string, number> = { spy: 3, map: 2, wave: 3, words: 4, auction: 2, quiz: 4, draw: 3 };

/**
 * Tapping a game tile on Home: its icon, name, minimum players, a three-line how-to-play (from the game's help content),
 * and the big button that opens a lounge with this game already selected. Coming-soon games get a disabled button.
 */
export function GameSheet({ gameId, busy, onCreate, onClose }: { gameId: string; busy: boolean; onCreate: (id: string) => void; onClose: () => void }) {
  const g = GAMES.find((x) => x.id === gameId);
  if (!g) return null;
  const help = HELP[gameId];
  const [line1, line2] = (help?.idea ?? g.tagline).split('\n');
  const lines = [line1, line2, help?.steps[0]?.text].filter(Boolean) as string[];
  return (
    <Sheet title={g.name} onClose={onClose}>
      <div className="row" style={{ gap: 12 }}>
        <span className="icontile" style={{ background: g.color, width: 64, height: 64, flex: 'none', borderRadius: 18 }}>{g.icon}</span>
        <div className="col" style={{ gap: 4, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>{g.tagline}</span>
          <span className="chip" style={{ alignSelf: 'flex-start' }}>من {AR(MIN[gameId] ?? 2)}+ لاعيبة</span>
        </div>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {lines.map((t, i) => (
          <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start', background: '#fff', border: '2.5px solid #111', borderRadius: 14, padding: '6px 10px' }}>
            <b className="display" style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', background: '#111', color: '#FFD23F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{AR(i + 1)}</b>
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.55 }}>{t}</span>
          </div>
        ))}
      </div>
      <button className="btn big full" disabled={!g.ready || busy} style={{ boxShadow: g.ready ? `0 6px 0 ${g.color}` : undefined }} onClick={() => { if (g.ready) { sfx.confirm(); onCreate(g.id); } }}>
        {g.ready ? 'اعمل قعدة بيها' : 'قريباً'}
      </button>
    </Sheet>
  );
}
