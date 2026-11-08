/** The shared difficulty levels: same names and colours in every game (01-brainstorm/difficulty.md). The server owns what each level does. */
export type Level = 'easy' | 'medium' | 'hard' | 'max';
export const LEVELS: { id: Level; label: string; color: string }[] = [
  { id: 'easy', label: 'سهل', color: '#3DDC97' },
  { id: 'medium', label: 'متوسط', color: '#4D9DFF' },
  { id: 'hard', label: 'صعب', color: '#FF8A3D' },
  { id: 'max', label: 'ماكس', color: '#FF4F9A' }
];
export const levelOf = (id: Level) => LEVELS.find((l) => l.id === id) ?? LEVELS[1];
