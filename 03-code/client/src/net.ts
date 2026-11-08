import { useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import { sfx } from './sound';

/** `score` is this game's points; `lounge` is the lounge total across games. */
export interface PlayerView { id: string; name: string; avatar: string; ready: boolean; connected: boolean; score: number; lounge: number }
export interface ChatView { id: string; from: string; text: string; at: number }
export type Phase = 'discuss' | 'vote' | 'reveal' | 'guess' | 'result' | 'final';
export interface GameView {
  type: 'spy';
  round: number;
  totalRounds: number;
  phase: Phase;
  endsAt: number | null;
  board: string[];
  participants: string[];
  askerId: string;
  targetId: string;
  you: { isSpy: boolean; place: string | null; role: string | null } | null;
  votedIds: string[];
  voteCounts: Record<string, number>;
  myVote: string | null;
  accusedId: string | null;
  caught: boolean | null;
  spyId: string | null;
  guessOptions: string[] | null;
  place: string | null;
  spyGuess: string | null;
  outcome: 'detectives' | 'spy-escaped' | 'spy-guessed' | null;
  roundPoints: Record<string, number>;
}
/** One row of the public lobby list (home screen). */
export interface LobbyRoom {
  code: string;
  name: string;
  host: { name: string; avatar: string };
  game: string;
  players: number;
  max: number;
  status: 'waiting' | 'playing';
}
export interface RoomView {
  code: string;
  name: string;
  privacy: 'private' | 'public';
  locked: boolean;
  selectedGame: string;
  hostId: string;
  youId: string;
  players: PlayerView[];
  chat: ChatView[];
  settings: { discussSeconds: number; rounds: number };
  game: GameView | null;
  serverNow: number;
}
export interface Profile { id: string; name: string; avatar: string }
type Status = 'waking' | 'online' | 'offline';

interface State { status: Status; room: RoomView | null; offset: number; toast: string | null; profile: Profile | null; hasConnected: boolean }

const KEY = 'allamma.profile';
const loadProfile = (): Profile | null => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};

let state: State = { status: 'waking', room: null, offset: 0, toast: null, profile: loadProfile(), hasConnected: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const useStore = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);

export const socket = io({ autoConnect: false, transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  set({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => set({ toast: null }), 2600);
}

type Ack = { ok: boolean; error?: string; [k: string]: any };
export function send(event: string, payload?: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket.connected) { toast('النت فاصل، بنحاول نوصل تاني…'); return resolve({ ok: false }); }
    socket.timeout(8000).emit(event, payload ?? {}, (err: unknown, res: Ack) => {
      if (err) { sfx.error(); toast('السيرفر مردش، جرّب تاني'); return resolve({ ok: false }); }
      if (!res.ok && res.error) { sfx.error(); toast(res.error); }
      resolve(res);
    });
  });
}

function inviteCodeFromUrl() {
  const c = new URLSearchParams(location.search).get('room');
  return c ? c.toUpperCase() : null;
}

async function hello() {
  const p = state.profile;
  if (!p) return;
  const res = await send('hello', { playerId: p.id, name: p.name, avatar: p.avatar });
  if (!res.ok) return;
  if (!res.roomCode) {
    set({ room: null });
    const invite = inviteCodeFromUrl();
    if (invite) {
      history.replaceState(null, '', location.pathname);
      await send('room:join', { code: invite });
    }
  }
}

socket.on('connect', () => { set({ status: 'online', hasConnected: true }); hello(); });
socket.on('disconnect', () => set({ status: 'offline' }));
socket.on('connect_error', () => set({ status: state.hasConnected ? 'offline' : 'waking' }));
socket.on('room:state', (room: RoomView) => set({ room, offset: room.serverNow - Date.now() }));
socket.on('room:kicked', () => { set({ room: null }); sfx.leave(); toast('المضيف طلّعك من الأوضة'); });

export function saveProfile(name: string, avatar: string) {
  const id = state.profile?.id ?? (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  const profile = { id, name: name.trim().slice(0, 14), avatar };
  localStorage.setItem(KEY, JSON.stringify(profile));
  set({ profile });
  if (socket.connected) hello(); else socket.connect();
}

export function start() {
  if (state.profile) socket.connect();
}

export async function leaveRoom() {
  await send('room:leave');
  set({ room: null });
}

export const serverNow = () => Date.now() + state.offset;
export const AR = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
