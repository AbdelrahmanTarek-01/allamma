import type { ReactNode } from 'react';

const BODY = 'M8 32C8 18 17 10 28 10s20 8 20 22-9 20-20 20S8 46 8 32z';
const S = { stroke: '#111', strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const eyes = (
  <>
    <circle cx="21" cy="30" r="5" fill="#fff" {...S} />
    <circle cx="35" cy="30" r="5" fill="#fff" {...S} />
    <circle cx="22" cy="31" r="2.3" fill="#111" />
    <circle cx="36" cy="31" r="2.3" fill="#111" />
  </>
);
const smile = <path d="M23 40q5 5 10 0" fill="none" {...S} />;

export const CHARACTERS: Record<string, { label: string; color: string; parts: ReactNode }> = {
  c1: {
    label: 'أبو طربوش', color: '#4D9DFF',
    parts: (<><path d="M20 14l2-10h12l2 10z" fill="#FF4F9A" {...S} /><path d="M28 4c5 0 7 3 7 8" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" />{eyes}{smile}</>)
  },
  c2: {
    label: 'الروش', color: '#3DDC97',
    parts: (<><rect x="13" y="25" width="13" height="9" rx="3" fill="#111" /><rect x="30" y="25" width="13" height="9" rx="3" fill="#111" /><path d="M26 28h4" {...S} /><path d="M16 28l3-2M33 28l3-2" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" /><path d="M21 39q7 8 14 0z" fill="#111" {...S} strokeWidth={2} /></>)
  },
  c3: {
    label: 'الدي جي', color: '#FF8A3D',
    parts: (<><path d="M7 31a21 21 0 0142 0" fill="none" stroke="#111" strokeWidth={4} strokeLinecap="round" /><rect x="3" y="25" width="9" height="14" rx="3.5" fill="#111" /><rect x="44" y="25" width="9" height="14" rx="3.5" fill="#111" /><path d="M17 31q4-4 8 0M31 31q4-4 8 0" fill="none" {...S} />{smile}</>)
  },
  c4: {
    label: 'الأميرة', color: '#B48CFF',
    parts: (<><path d="M28 12L17 5v13zM28 12l11-7v13z" fill="#FFD23F" {...S} /><circle cx="28" cy="12" r="3.5" fill="#FFD23F" {...S} /><ellipse cx="15" cy="37" rx="4" ry="2.5" fill="#FF4F9A" opacity=".6" /><ellipse cx="41" cy="37" rx="4" ry="2.5" fill="#FF4F9A" opacity=".6" />{eyes}<path d="M24 40q4 3 8 0" fill="none" {...S} /></>)
  },
  c5: {
    label: 'النعسان', color: '#FF4F9A',
    parts: (<><path d="M28 10V3" {...S} /><path d="M28 5c3-5 10-4 11 1-5 3-9 2-11-1z" fill="#3DDC97" {...S} strokeWidth={2} /><circle cx="21" cy="30" r="5" fill="#fff" {...S} /><circle cx="21" cy="31" r="2.3" fill="#111" /><path d="M30 31h9" {...S} /><circle cx="28" cy="40" r="2.6" fill="#111" /></>)
  },
  c6: {
    label: 'الكابتن', color: '#fff',
    parts: (<><path d="M10 22c0-9 8-14 18-14s18 5 18 14z" fill="#FF4F9A" {...S} /><path d="M44 21h9" stroke="#111" strokeWidth={4} strokeLinecap="round" /><g transform="translate(0 1)">{eyes}</g><path d="M21 40q7 7 14 0" fill="none" {...S} /></>)
  },
  c7: {
    label: 'الحاج', color: '#4D9DFF',
    parts: (<><path d="M15 22l8 2M41 22l-8 2" stroke="#111" strokeWidth={3} strokeLinecap="round" />{eyes}<path d="M28 39c-3-3-9-3.5-12 .5 4 2 8.5 1.5 12-.5zm0 0c3-3 9-3.5 12 .5-4 2-8.5 1.5-12-.5z" fill="#111" {...S} strokeWidth={1.5} /></>)
  },
  c8: {
    label: 'الملك', color: '#3DDC97',
    parts: (<><path d="M17 14l2-10 5 5 4-7 4 7 5-5 2 10z" fill="#FFD23F" {...S} />{eyes}<path d="M22 39q6 6 12 0" fill="none" {...S} /></>)
  }
};

export const AVATAR_IDS = Object.keys(CHARACTERS);

const spyHat = (
  <>
    <path d="M15 15l3-10c6 2.5 14 2.5 20 0l3 10z" fill="#111" {...S} />
    <path d="M16.5 11h23" stroke="#FF4F9A" strokeWidth={3} />
    <path d="M8 16h40" stroke="#111" strokeWidth={4} strokeLinecap="round" />
  </>
);

export function Character({ id, size = 56, spy = false, title }: { id: string; size?: number; spy?: boolean; title?: string }) {
  const c = CHARACTERS[id] ?? CHARACTERS.c1;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flex: 'none' }}>
      <path d={BODY} fill={c.color} stroke="#111" strokeWidth={3} />
      {spy ? (<>{spyHat}{eyes}<path d="M24 42q4-3 8 0" fill="none" {...S} /></>) : c.parts}
    </svg>
  );
}

export function SpyIcon({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M13 20l3-11c5 2.5 11 2.5 16 0l3 11z" fill="#111" {...S} />
      <path d="M14.4 15h19.2" stroke="#FFD23F" strokeWidth={3} />
      <path d="M6 21h36" stroke="#111" strokeWidth={4} strokeLinecap="round" />
      <circle cx="16" cy="30" r="6.5" fill="#fff" {...S} />
      <circle cx="32" cy="30" r="6.5" fill="#fff" {...S} />
      <path d="M22.5 30h3" {...S} />
      <path d="M13 29a3 3 0 013-3M29 29a3 3 0 013-3" fill="none" stroke="#4D9DFF" strokeWidth={2} strokeLinecap="round" />
      <path d="M24 41c-2.5-3-7.5-3.5-10 0 3.5 2 7 1.5 10 0zm0 0c2.5-3 7.5-3.5 10 0-3.5 2-7 1.5-10 0z" fill="#111" {...S} strokeWidth={1.5} />
    </svg>
  );
}

export const GAMES: { id: string; name: string; tagline: string; color: string; ready: boolean; icon: ReactNode }[] = [
  {
    id: 'spy', name: 'مين الجاسوس؟', tagline: 'واحد بس مش عارف المكان', color: '#FF4F9A', ready: true,
    icon: <SpyIcon />
  },
  {
    id: 'map', name: 'فين دي؟', tagline: 'حط الدبوس على الخريطة', color: '#3DDC97', ready: true,
    icon: (<svg width="42" height="42" viewBox="0 0 48 48" aria-hidden="true"><path d="M4 12l13-5 14 5 13-5v29l-13 5-14-5-13 5z" fill="#CFE5FF" {...S} /><path d="M17 7v29M31 12v29" {...S} strokeWidth={2} /><path d="M24 4c-5.5 0-9 4-9 8.5C15 19 24 28 24 28s9-9 9-15.5C33 8 29.500 4 24 4z" fill="#FF4F9A" {...S} /><circle cx="24" cy="12.500" r="3.300" fill="#fff" {...S} strokeWidth={2} /></svg>)
  },
  {
    id: 'wave', name: 'الموجة', tagline: 'خمّنوا المكان على المقياس', color: '#4D9DFF', ready: true,
    icon: (<svg width="42" height="42" viewBox="0 0 48 48" aria-hidden="true"><path d="M5 36a19 19 0 0138 0z" fill="#fff" {...S} /><path d="M24 36L14.5 19.5A19 19 0 0133.5 19.5z" fill="#FFD23F" {...S} /><path d="M24 36L19.2 27.8A9.5 9.5 0 0128.8 27.8z" fill="#FF4F9A" {...S} /><path d="M24 36l8-13" stroke="#111" strokeWidth={3.5} strokeLinecap="round" /><circle cx="24" cy="36" r="3.5" fill="#111" /><path d="M3 36h42" stroke="#111" strokeWidth={3} strokeLinecap="round" /></svg>)
  },
  {
    id: 'words', name: 'شبكة الكلمات', tagline: 'تلميح واحد، كلمات كتير', color: '#3DDC97', ready: true,
    icon: (<svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="5" width="17" height="17" rx="4" fill="#fff" {...S} /><rect x="26" y="5" width="17" height="17" rx="4" fill="#FF4F9A" {...S} /><rect x="5" y="26" width="17" height="17" rx="4" fill="#4D9DFF" {...S} /><rect x="26" y="26" width="17" height="17" rx="4" fill="#fff" {...S} /><path d="M10 12h7M10 16h5M31 33h7M31 37h5" {...S} /></svg>)
  },
  {
    id: 'auction', name: 'مزاد المعلومات', tagline: 'زايدوا على قد ثقتكم', color: '#FF8A3D', ready: false,
    icon: (<svg width="42" height="42" viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-40 22 18)"><rect x="19.5" y="23" width="5" height="20" rx="2.5" fill="#fff" {...S} /><rect x="9" y="11" width="26" height="12" rx="4" fill="#FFD23F" {...S} /><path d="M15 11v12M29 11v12" {...S} /></g><circle cx="10" cy="39" r="6" fill="#FFD23F" {...S} /><circle cx="10" cy="39" r="2.5" fill="none" stroke="#111" strokeWidth={2} /></svg>)
  },
  {
    id: 'quiz', name: 'حزّورة', tagline: 'لوحة أسئلة بين فريقين', color: '#B48CFF', ready: true,
    icon: (<svg width="42" height="42" viewBox="0 0 48 48" aria-hidden="true"><path d="M9 6h30a5 5 0 015 5v17a5 5 0 01-5 5H24l-9 8v-8H9a5 5 0 01-5-5V11a5 5 0 015-5z" fill="#fff" {...S} /><path d="M28.5 15.5c0-2.8-2.2-4.5-4.6-4.5s-4.4 1.8-4.4 4.2c0 3.3 4.5 3.6 4.5 7.3" fill="none" stroke="#111" strokeWidth={3.2} strokeLinecap="round" /><circle cx="24" cy="27.5" r="2" fill="#111" /></svg>)
  },
  {
    id: 'draw', name: 'ارسم وخمّن', tagline: 'ارسم وصحابك يخمّنوا', color: '#FFD23F', ready: false,
    icon: (<svg width="42" height="42" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 42q6-6 12-1t12-2" fill="none" stroke="#FF4F9A" strokeWidth={3.5} strokeLinecap="round" /><g transform="rotate(-45 26 22)"><rect x="12" y="17" width="24" height="10" fill="#fff" {...S} /><rect x="36" y="17" width="7" height="10" rx="2" fill="#FF4F9A" {...S} /><path d="M12 17L4 22l8 5z" fill="#F3D9B1" {...S} /><path d="M4 22l3-1.9v3.8z" fill="#111" /></g></svg>)
  }
];

export function Plus() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

/** Filled trophy with black outlines, like every icon in the app. */
export function Trophy({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10v6a5 5 0 01-10 0z" fill="#FFD23F" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15v3M8.500 20.500h7" stroke="#111" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
