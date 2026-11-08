import { useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import type { Level } from './games/difficulty';
import { sfx } from './sound';

/** `score` is this game's points; `lounge` is the lounge total across games. */
export interface PlayerView { id: string; name: string; avatar: string; ready: boolean; connected: boolean; score: number; lounge: number }
/** `from` is a player id, or '' for a system divider ("بدأت الجولة ٢"). */
export interface ChatView { id: string; from: string; text: string; at: number; system?: boolean }
export const MAX_CHAT = 50;
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
  /** "Ready to vote" during the discussion: connected players who toggled ready, and how many connected players there are. */
  readyToVoteIds: string[];
  readyTotal: number;
  /** How many spies there are (public). Who they are is only revealed at the end of the round. */
  spyCount: number;
  difficulty: Level;
  multiplier: number;
  /** The one spy the votes caught, from the reveal on. */
  caughtSpyId: string | null;
  /** Every spy, only once the round is over. */
  spyIds: string[] | null;
  guessOptions: string[] | null;
  place: string | null;
  spyGuess: string | null;
  outcome: 'detectives' | 'spy-escaped' | 'spy-guessed' | null;
  roundPoints: Record<string, number>;
}
/** فين دي؟ (map pin game). The server only sends what each player may see: the target and the other pins arrive with the reveal. */
export type MapHint =
  | { kind: 'text'; text: string }
  | { kind: 'circle'; lat: number; lon: number; radiusKm: number }
  | { kind: 'half'; axis: 'lat' | 'lon'; at: number; shade: 'north' | 'south' | 'east' | 'west' };
export interface MapEntry { id: string; lat: number | null; lon: number | null; km: number | null; points: number; hinted: boolean; fast: boolean; auto: boolean }
export interface MapGameView {
  type: 'map';
  round: number;
  totalRounds: number;
  phase: 'guess' | 'reveal' | 'result' | 'final';
  endsAt: number | null;
  scope: 'egypt' | 'arab' | 'world';
  participants: string[];
  /** Who locked (ids only; never where). */
  lockedIds: string[];
  place: { name: string; theme: 'cities' | 'landmarks' | 'stadiums' | 'dishes'; difficulty: 'easy' | 'medium' | 'hard'; multiplier: number; hardText: boolean } | null;
  you: { pin: { lat: number; lon: number } | null; locked: boolean; hint: MapHint | null; canHint: boolean } | null;
  reveal: { target: { lat: number; lon: number }; fact: string; entries: MapEntry[] } | null;
  roundPoints: Record<string, number>;
}

/** A game's settings schema: the lounge renders its settings sheet generically from this. */
/** Rule for all settings: one word or number per button (`label`), any explanation in the group's one helper line (`hint`). */
export interface SettingOption { value: number | string; label: string; full?: string; hintName?: string; minPlayers?: number }
export interface SettingField { key: string; label: string; hint?: string; icon?: 'spy'; options: SettingOption[] }

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
  /** Players the selected game needs to start. */
  minPlayers: number;
  /** Shared lounge difficulty (host-only). Only games with a level table show it (`hasLevels`). */
  difficulty: Level;
  hasLevels: boolean;
  hostId: string;
  youId: string;
  players: PlayerView[];
  /** Settings of the selected game (keys come from its schema). */
  settings: Record<string, any>;
  /** The selected game's schema while in the lounge, null during a game. */
  settingsSchema: SettingField[] | null;
  game: GameView | MapGameView | null;
  serverNow: number;
}
export interface Profile { id: string; name: string; avatar: string }
type Status = 'waking' | 'online' | 'offline';

// chat is not part of the room snapshot: the server sends the history once (chat:history), then each message (chat:new)
// chatBase = id of the last message in the history we received: everything up to it counts as already seen (no unread badge)
interface State { status: Status; room: RoomView | null; chat: ChatView[]; chatBase: string | undefined; offset: number; toast: string | null; profile: Profile | null; hasConnected: boolean }

const KEY = 'allamma.profile';
const loadProfile = (): Profile | null => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};

let state: State = { status: 'waking', room: null, chat: [], chatBase: undefined, offset: 0, toast: null, profile: loadProfile(), hasConnected: false };
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
    set({ room: null, chat: [] });
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
socket.on('room:kicked', () => { set({ room: null, chat: [] }); sfx.leave(); toast('المضيف طلّعك من الأوضة'); });
socket.on('chat:history', (list: ChatView[]) => set({ chat: list.slice(-MAX_CHAT), chatBase: list[list.length - 1]?.id }));
socket.on('chat:new', (m: ChatView) => {
  if (state.chat.some((x) => x.id === m.id)) return;
  set({ chat: [...state.chat, m].slice(-MAX_CHAT) });
});

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
  set({ room: null, chat: [] });
}

export const serverNow = () => Date.now() + state.offset;
export const AR = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
