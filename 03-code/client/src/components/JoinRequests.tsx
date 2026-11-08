import { useEffect, useRef, useState } from 'react';
import { AR, cancelJoinRequest, send, serverNow, useStore, type RoomView } from '../net';
import { sfx } from '../sound';
import { Character } from './art';
import { Sheet } from './ui';

/** Host: live bottom sheet "طلبات دخول (N)" with accept / reject per request (canvas JoinRequest, host side). */
export function RequestsSheet({ room }: { room: RoomView }) {
  const list = room.requests ?? [];
  const [hidden, setHidden] = useState(0); // how many requests were there when the host closed the sheet (it reopens for new ones)
  const prev = useRef(0);
  useEffect(() => {
    if (list.length > prev.current) sfx.notify(); // somebody new is asking
    prev.current = list.length;
    setHidden((h) => Math.min(h, list.length));
  }, [list.length]);
  if (list.length === 0 || list.length <= hidden) return null;
  const answer = (id: string, accept: boolean) => { accept ? sfx.confirm() : sfx.toggleOff(); send('room:request', { id, accept }); };
  return (
    <Sheet title={`طلبات دخول (${AR(list.length)})`} onClose={() => setHidden(list.length)}>
      <div className="col" style={{ gap: 10 }}>
        {list.map((r) => (
          <div key={r.id} className="jr-row">
            <Character id={r.avatar} size={42} />
            <div className="col grow" style={{ lineHeight: 1.25, minWidth: 0 }}>
              <b style={{ fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</b>
              <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>{r.returning ? 'لعبت معاكم قبل كده' : 'أول مرة'}</span>
            </div>
            <button className="jr-no" aria-label={`رفض ${r.name}`} data-sfx="none" onClick={() => answer(r.id, false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E2433B" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <button className="jr-yes" data-sfx="none" onClick={() => answer(r.id, true)}>قبول</button>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, textAlign: 'center' }}>الطلب بيتلغي لوحده بعد دقيقة لو مردّتش</span>
    </Sheet>
  );
}

/** Requester: waiting for the host (canvas JoinRequest, guest side): countdown and "إلغاء الطلب". Accept joins automatically (the room snapshot arrives). */
export function JoinWaiting() {
  const { pending, profile } = useStore();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(i); }, []);
  if (!pending || !profile) return null;
  const secs = Math.max(0, Math.ceil((pending.until - serverNow()) / 1000));
  return (
    <main className="screen jr-screen">
      <div className="col center grow" style={{ gap: 16, textAlign: 'center' }}>
        <div className="jr-ring">
          <span style={{ animation: 'jrBob 2s ease-in-out infinite', display: 'flex' }}><Character id={profile.avatar} size={96} /></span>
          <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', bottom: 6, left: 6 }}><rect x="5" y="10" width="14" height="11" rx="3" fill="#FFD23F" stroke="#111" strokeWidth="2.4" /><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#111" strokeWidth="2.4" /></svg>
        </div>
        <span className="display" style={{ fontSize: 28, lineHeight: 1.2 }}>بعتنا طلبك لـ {pending.hostName}</span>
        <span style={{ fontSize: 14, fontWeight: 800 }}>«{pending.roomName}» قعدة بإذن، أول ما يوافق هتدخل على طول</span>
        <span style={{ fontSize: 13, fontWeight: 900, background: '#fff', border: '2px solid #111', borderRadius: 99, padding: '2px 12px' }}>مستنيين ({AR(secs)} ثانية)</span>
      </div>
      <button className="btn full" style={{ height: 56, fontSize: 17 }} onClick={() => { sfx.tap(); cancelJoinRequest(); }}>إلغاء الطلب</button>
    </main>
  );
}
