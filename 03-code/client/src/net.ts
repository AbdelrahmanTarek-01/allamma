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

/** الموجة (wave). The target only reaches the narrator until the reveal; in solo only your own needle is here; in teams only your team's. */
export interface WaveReveal {
  needles: { id: string; angle: number | null; points: number }[];
  narratorAvg: number | null;
  zone: number | null;
  call: { correct: boolean | null; side: 'left' | 'right'; calls: Record<string, 'left' | 'right'> } | null;
  teamPoints: [number, number] | null;
}
export interface WaveGameView {
  type: 'wave';
  mode: 'solo' | 'teams';
  phase: 'clue' | 'guess' | 'call' | 'reveal' | 'final';
  endsAt: number | null;
  turn: number;
  totalTurns: number;
  participants: string[];
  teams: Record<string, 0 | 1> | null;
  teamScores: [number, number] | null;
  narratorId: string | null;
  narratorTeam: 0 | 1 | null;
  card: { left: string; right: string } | null;
  multiplier: number;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  canRedraw: boolean;
  clue: { text: string | null; voice: boolean } | null;
  target: number | null;
  /** Who locked (ids only; never where). In teams: who agreed to lock. In the call phase: who already called. */
  lockedIds: string[];
  you: { role: 'narrator' | 'guesser' | 'caller' | 'watcher'; team: 0 | 1 | null; needle: number | null; locked: boolean; call: 'left' | 'right' | null } | null;
  team: { index: 0 | 1; needle: number | null; fingers: { id: string; angle: number }[]; chat: { id: string; from: string; text: string; at: number }[]; need: number } | null;
  reveal: WaveReveal | null;
  roundPoints: Record<string, number>;
}

/** One row of the room leaderboard (placement points across the games played in this lounge). */
export interface TeamMsg { id: string; from: string; text: string; at: number }

/** حزّورة (quiz). The right answer and the other team's votes only arrive at the reveal / for the answering team. */
export interface QuizQuestionView {
  cat: string; value: number; worth: number; special: 'treasure' | 'bomb' | null; doubled: boolean; early: boolean; text: string;
  answering: 0 | 1 | null;
  options: { text: string; gone: boolean; struck: boolean }[];
  votes: { id: string; option: number }[];
  correct: number | null;
  first: { team: 0 | 1; option: number | null } | null;
  second: { team: 0 | 1; option: number | null; secondsLeft: number } | null;
  outcome: { kind: 'right' | 'steal' | 'wrong' | 'none'; team: 0 | 1 | null; delta: [number, number]; note: string } | null;
  fact: string | null;
}
export interface QuizGameView {
  type: 'quiz';
  phase: 'draft' | 'board' | 'question' | 'steal' | 'reveal' | 'final';
  endsAt: number | null;
  participants: string[];
  teams: Record<string, 0 | 1>;
  teamScores: [number, number];
  turnTeam: 0 | 1;
  level: string;
  cardsOn: boolean;
  cards: { double: number; fifty: number; steal: number }[];
  team: 0 | 1 | null;
  chat: TeamMsg[];
  pickerId: string | null;
  doubleArmed: boolean;
  left: number;
  cats: { id: string; name: string; sub: string; owner: 0 | 1 | null }[];
  draftTurn: 0 | 1 | null;
  rows: { id: string; name: string; owner: 0 | 1; cells: { value: number; used: boolean; winner: 0 | 1 | 'x' | null }[] }[];
  total: number;
  question: QuizQuestionView | null;
  you: { role: string; vote: number | null } | null;
  final: { star: { id: string; right: number; total: number } | null; moment: { text: string; sub: string } | null } | null;
}

/** شبكة الكلمات (words). The colour key (`keys`) only reaches the two guides until the board is over. */
export interface WordsGameView {
  type: 'words';
  phase: 'clue' | 'guess' | 'boardEnd' | 'final';
  endsAt: number | null;
  participants: string[];
  teams: Record<string, 0 | 1>;
  team: 0 | 1 | null;
  level: string;
  boards: number;
  boardNo: number;
  wins: [number, number];
  need: number;
  history: { n: number; how: string; winner: 0 | 1 }[];
  chat: TeamMsg[];
  knobs: { extra: boolean; bombLoses: boolean; secretPicks: boolean; guideSecs: number | null; perTeam: number; bombs: number };
  turn: 0 | 1;
  guides: [string | null, string | null];
  role: 'guide' | 'guide-wait' | 'guesser' | 'watcher';
  cards: { word: string; flipped: boolean; kind: 't0' | 't1' | 'n' | 'b' | null; by: string | null }[];
  keys: ('t0' | 't1' | 'n' | 'b')[] | null;
  clue: { word: string; num: number; guideId: string } | null;
  tries: number;
  remaining: [number, number];
  marks: Record<number, string[]>;
  myMark: number | null;
  last: { word: string; kind: 'own' | 'neutral' | 'enemy' | 'bomb'; by: string | null; team: 0 | 1 } | null;
  result: { kind: 'bomb' | 'win'; winner: 0 | 1; loser: 0 | 1 | null; by: string | null; word: string | null; margin: number } | null;
  final: { winner: 0 | 1 | null; awards: { k: string; id: string | null; why: string }[] } | null;
}

/** مزاد المعلومات (auction). The question only exists here once the lot is sold; the right answer only at the reveal. */
export interface AuctionGameView {
  type: 'auction';
  phase: 'bid' | 'sold' | 'answer' | 'reveal' | 'final';
  endsAt: number | null;
  level: string;
  participants: string[];
  money: Record<string, number>;
  lotNo: number;
  lots: number;
  bidSecs: number;
  penalty: number;
  topic: string | null;
  tier: number | null;
  price: number;
  buyer: string | null;
  log: { by: string; amount: number }[];
  steps: number[];
  question: { text: string; options: string[] } | null;
  pick: number | null;
  locked: boolean;
  predicted: boolean | null;
  predictors: string[];
  result: { kind: 'right' | 'wrong' | 'none'; buyer: string | null; price: number; delta: number; chosen: number | null; correct: number; predictions: { id: string; yes: boolean; ok: boolean }[] } | null;
  fact: string | null;
  final: { awards: { k: string; id: string | null; why: string }[] } | null;
  you: { money: number; role: 'buyer' | 'watcher' | 'bidder' } | null;
  revealCorrect: number | null;
}

/** ارسم وخمّن (draw). The word only reaches the drawer until the reveal; strokes stream live through the `draw:delta` event. */
export interface DrawStroke { id: number; c: string; w: number; pts: number[] }
export type DrawOp = { op: 'start'; id: number; c: string; w: number } | { op: 'pts'; id: number; pts: number[] } | { op: 'undo' } | { op: 'clear' };
export interface DrawGameView {
  type: 'draw';
  phase: 'pick' | 'draw' | 'guess' | 'reveal' | 'final';
  endsAt: number | null;
  level: string;
  participants: string[];
  scores: Record<string, number>;
  round: number;
  rounds: number;
  cfg: { eraser: boolean; drawSecs: number; guessSecs: number; attempts: number; hints: number; colors: string[] };
  queue: string[];
  drawer: string | null;
  isDrawer: boolean;
  choices: { i: number; w: string; shape: number; pts: number }[] | null;
  word: string | null;
  pts: number;
  strokes: DrawStroke[];
  rev: number;
  solvedIds: string[];
  feed: { id: string; text: string | null; ok: boolean }[];
  me: { attemptsLeft: number; guessed: boolean; gain: number; mine: { text: string; near: boolean }[]; hintLetter: string | null; hintsLeft: number; canHint: boolean } | null;
  result: { word: string | null; skipped: boolean; gains: { id: string; gain: number; left: number; hinted: boolean }[]; outOf: string[]; drawerGain: number; total: number } | null;
  final: { ranked: string[]; gallery: { round: number; drawer: string; word: string; strokes: DrawStroke[]; likes: number; mine: boolean }[]; artist: { id: string; hearts: number } | null } | null;
}

export interface BoardRow {
  id: string; name: string; avatar: string;
  /** Still in the lounge (rows of players who left stay, greyed). */
  inRoom: boolean; connected: boolean;
  total: number;
  /** Points of the latest finished game. */
  gain: number;
  /** Rank (0 = first) before the latest game, null if new. */
  prevRank: number | null;
  byGame: Record<string, number>;
}
export interface BoardView { rows: BoardRow[]; played: { n: number; game: string; winner: string; at: number }[]; games: string[] }

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
  /** First four members (avatar ids) for the card. */
  avatars: string[];
  /** The lounge asks the host before a new player comes in. */
  ask: boolean;
  difficulty: string;
  max: number;
  /** No free seat left. */
  full: boolean;
  status: 'waiting' | 'playing';
}
export interface RoomView {
  code: string;
  name: string;
  privacy: 'private' | 'public';
  locked: boolean;
  /** Who may come in: anyone with the code, new players ask the host, or nobody new. */
  joinMode: 'open' | 'ask' | 'locked';
  /** Host only: players asking to come in (empty for everyone else). */
  requests: { id: string; name: string; avatar: string; returning: boolean; at: number }[];
  selectedGame: string;
  /** Players the selected game needs to start. */
  minPlayers: number;
  /** Shared lounge difficulty (host-only). Only games with a level table show it (`hasLevels`). */
  difficulty: Level;
  hasLevels: boolean;
  /** Seats in the lounge (4 / 6 / 8 / 12). */
  maxPlayers: number;
  /** Room leaderboard (placement points across the games played here). */
  board: BoardView;
  /** الموجة: the team (0 or 1) of every player, for the host's teams editor. */
  teams: Record<string, 0 | 1> | null;
  hostId: string;
  youId: string;
  players: PlayerView[];
  /** Settings of the selected game (keys come from its schema). */
  settings: Record<string, any>;
  /** The selected game's schema while in the lounge, null during a game. */
  settingsSchema: SettingField[] | null;
  game: GameView | MapGameView | WaveGameView | QuizGameView | WordsGameView | AuctionGameView | DrawGameView | null;
  serverNow: number;
}
export interface Profile { id: string; name: string; avatar: string }
type Status = 'waking' | 'online' | 'offline';

// chat is not part of the room snapshot: the server sends the history once (chat:history), then each message (chat:new)
// chatBase = id of the last message in the history we received: everything up to it counts as already seen (no unread badge)
interface State { status: Status; room: RoomView | null; chat: ChatView[]; chatBase: string | undefined; offset: number; toast: string | null; profile: Profile | null; hasConnected: boolean; pending: { code: string; roomName: string; hostName: string; until: number } | null; backToRooms: boolean }

const KEY = 'allamma.profile';
const loadProfile = (): Profile | null => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};

let state: State = { status: 'waking', room: null, chat: [], chatBase: undefined, offset: 0, toast: null, profile: loadProfile(), hasConnected: false, pending: null, backToRooms: false };
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
      await joinRoom(invite);
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

/** Join by code (list, code box or invite link). A lounge in ask mode answers with a pending request: the waiting screen shows until the host decides. */
export async function joinRoom(code: string) {
  const res = await send('room:join', { code });
  if (res.ok && res.pending) set({ pending: { code: res.code, roomName: res.pending.roomName, hostName: res.pending.hostName, until: res.pending.until } });
  return res;
}

/** The requester pressed "إلغاء الطلب". */
export function cancelJoinRequest() {
  send('room:requestCancel');
  set({ pending: null, backToRooms: true });
}

/** Home asks once on mount: did a failed or cancelled join send us back to the open-rooms list? */
export function takeBackToRooms() {
  const b = state.backToRooms;
  if (b) state = { ...state, backToRooms: false };
  return b;
}

// the host's answer (or the clock) reaches a waiting requester
const RESULT_TOAST: Record<string, string> = { rejected: 'الهوست رفض', expired: 'الهوست مردّش', full: 'القعدة مليانة', closed: 'الهوست غيّر الدخول للقعدة' };
socket.on('join:result', (d: { code: string; status: string }) => {
  if (!state.pending || state.pending.code !== d.code) return;
  set({ pending: null, backToRooms: d.status !== 'accepted' });
  if (RESULT_TOAST[d.status]) { sfx.error(); toast(RESULT_TOAST[d.status]); }
  else sfx.join();
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
