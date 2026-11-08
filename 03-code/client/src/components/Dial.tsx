import { useRef } from 'react';
import { Character } from './art';

/** The half-circle dial of الموجة. Angle 0 is the left pole, 90 straight up, 180 the right pole. */
const W = 320, CX = 160, CY = 168, R = 142;
const pt = (angle: number, r: number): [number, number] => {
  const a = (angle * Math.PI) / 180;
  return [CX - r * Math.cos(a), CY - r * Math.sin(a)];
};
const wedge = (a0: number, a1: number, r = R) => {
  const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
  return `M${CX} ${CY}L${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z`;
};

/** Zone half-widths in degrees (the server's ZONE_EDGES): 9 wide in the middle = 4 points, then 3, then 2. */
export const ZONES = [{ edge: 22.5, pts: '٢', color: '#FFE9A8' }, { edge: 13.5, pts: '٣', color: '#FF8A3D' }, { edge: 4.5, pts: '٤', color: '#FF4F9A' }] as const;

/** `avatar` is missing for a team's shared needle (it belongs to everyone on the team: just the team colour). */
export interface DialNeedle { id: string; angle: number; avatar?: string; color: string; small?: boolean }
export interface DialDot { id: string; angle: number; avatar: string }

interface Props {
  left: string;
  right: string;
  /** Shows the target zones around this angle (narrator, and everybody at the reveal). */
  target?: number | null;
  needles?: DialNeedle[];
  /** Teammates' fingers (small avatar dots on the rim). */
  dots?: DialDot[];
  /** Makes the dial draggable. `end` is true when the finger lifts. */
  onAngle?: (angle: number, end: boolean) => void;
  /** The reveal cover: closed hides the zones, open rotates it away. */
  cover?: 'closed' | 'open';
  label?: string;
}

export function Dial({ left, right, target = null, needles = [], dots = [], onAngle, cover, label = 'مقياس الموجة' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  /** Pointer position -> angle on the dial (below the baseline snaps to the nearest end). */
  const angleOf = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const k = r.width / W;
    const dx = e.clientX - (r.left + CX * k), dy = r.top + CY * k - e.clientY;
    if (dy <= 0) return dx < 0 ? 0 : 180;
    return Math.min(180, Math.max(0, (Math.atan2(dy, -dx) * 180) / Math.PI));
  };
  const down = (e: React.PointerEvent) => {
    if (!onAngle) return;
    dragging.current = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    onAngle(+angleOf(e).toFixed(1), false);
  };
  const move = (e: React.PointerEvent) => { if (dragging.current && onAngle) onAngle(+angleOf(e).toFixed(1), false); };
  const up = (e: React.PointerEvent) => {
    if (!dragging.current || !onAngle) return;
    dragging.current = false;
    onAngle(+angleOf(e).toFixed(1), true);
  };

  return (
    <div className="dial-wrap">
      <svg
        ref={svgRef}
        className={`dial${onAngle ? ' live' : ''}`}
        viewBox={`0 0 ${W} ${CY + 14}`}
        role={onAngle ? 'slider' : 'img'}
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <path d={wedge(0, 180)} className="dial-face" />
        {target !== null && ZONES.map((z) => (
          <path key={z.pts} d={wedge(Math.max(0, target - z.edge), Math.min(180, target + z.edge))} fill={z.color} stroke="#111" strokeWidth="1.500" strokeLinejoin="round" className="dial-zone" />
        ))}
        {/* the points of each zone: 4 in the middle, 3 on both sides, 2 beyond */}
        {target !== null && ([[0, '٤'], [-9, '٣'], [9, '٣'], [-18, '٢'], [18, '٢']] as const).map(([off, n]) => {
          const a = target + off;
          if (a < 1 || a > 179) return null;
          const [x, y] = pt(a, R - 17);
          return <text key={off} x={x} y={y + 4} className="dial-zone-n" textAnchor="middle">{n}</text>;
        })}
        {/* tick marks every 15 degrees */}
        {Array.from({ length: 13 }, (_, i) => {
          const [x0, y0] = pt(i * 15, R), [x1, y1] = pt(i * 15, R - (i % 6 === 0 ? 12 : 7));
          return <path key={i} d={`M${x0} ${y0}L${x1} ${y1}`} className="dial-tick" />;
        })}
        <path d={`M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}`} className="dial-rim" />
        <path d={`M${CX - R - 8} ${CY}H${CX + R + 8}`} className="dial-base" />

        {dots.map((d) => {
          const [x, y] = pt(d.angle, R - 34);
          return (
            <g key={d.id} transform={`translate(${x} ${y})`} className="dial-dot">
              <circle r="11" fill="#fff" stroke="#111" strokeWidth="2.500" />
              <g transform="translate(-9 -9)"><Character id={d.avatar} size={18} /></g>
            </g>
          );
        })}

        {needles.map((n) => {
          const [tx, ty] = pt(n.angle, R - 6);
          const hr = n.small ? 12 : 16;
          return (
            <g key={n.id} className="dial-needle">
              <path d={`M${CX} ${CY}L${tx} ${ty}`} stroke="#111" strokeWidth={n.small ? 3.500 : 5.500} strokeLinecap="round" />
              <g transform={`translate(${tx} ${ty})`}>
                <circle r={hr} fill="#fff" stroke={n.color} strokeWidth="5" />
                <circle r={hr + 2.500} fill="none" stroke="#111" strokeWidth="2.500" />
                {n.avatar ? <g transform={`translate(${-hr + 3} ${-hr + 3})`}><Character id={n.avatar} size={(hr - 3) * 2} /></g> : <circle r={hr - 6} fill={n.color} />}
              </g>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r="9" fill="#111" />

        {cover && (
          <g className={`dial-cover${cover === 'open' ? ' open' : ''}`}>
            <path d={wedge(0, 180, R + 3)} fill="#B48CFF" stroke="#111" strokeWidth="3.500" strokeLinejoin="round" />
            <text x={CX} y={CY - 52} textAnchor="middle" className="dial-cover-q">؟</text>
          </g>
        )}
      </svg>
      <div className="dial-poles">
        <span className="pole right">{right}</span>
        <span className="pole left">{left}</span>
      </div>
    </div>
  );
}
