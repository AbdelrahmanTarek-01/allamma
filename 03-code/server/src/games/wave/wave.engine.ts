import { maskBad } from '../../common/profanity';
import { arabicNum } from '../../common/ar';
import { GameError } from '../../rooms/rooms.types';
import type { EngineCtx, GameDef, GameEngine, SettingField } from '../game-engine';
import { CARDS, type CardDifficulty, type WaveCard } from './cards';

export interface WaveSettings {
  mode: 'solo' | 'teams';
  /** How many times around the table everyone is the narrator. */
  rounds: number;
  /** Guess time in seconds. */
  seconds: number;
  /** Team of each player (0 or 1), edited by the host in the lounge. Players missing here are balanced in automatically. */
  teams: Record<string, 0 | 1>;
}

type Phase = 'clue' | 'guess' | 'call' | 'reveal' | 'final';
type Call = 'left' | 'right';
type Team = 0 | 1;

export const CLUE_SECONDS = 75;
export const CALL_SECONDS = 20;
export const REVEAL_AUTO_SECONDS = 30;
export const NEEDLE_FLUSH_MS = 100; // team needle: ~10 updates per second
/** Half-widths (degrees) of the target zones: center 9 wide = 4 points, then 3, then 2. */
export const ZONE_EDGES = [4.5, 13.5, 22.5];
const MULT: Record<CardDifficulty, number> = { easy: 1, medium: 1.5, hard: 2 };

/** Points for a needle `diff` degrees from the target. */
export function zonePoints(diff: number) {
  const d = Math.abs(diff);
  return d <= ZONE_EDGES[0] ? 4 : d <= ZONE_EDGES[1] ? 3 : d <= ZONE_EDGES[2] ? 2 : 0;
}

/** Keeps the saved assignments of current members and balances everyone else into the smaller team. */
export function normalizeTeams(memberIds: string[], saved: Record<string, number | undefined>): Record<string, Team> {
  const out: Record<string, Team> = {};
  const n = [0, 0];
  memberIds.forEach((id) => { const t = saved[id]; if (t === 0 || t === 1) { out[id] = t; n[t]++; } });
  memberIds.forEach((id) => { if (!(id in out)) { const t: Team = n[0] <= n[1] ? 0 : 1; out[id] = t; n[t]++; } });
  return out;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const clampAngle = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new GameError('زاوية مش صح');
  return Math.min(180, Math.max(0, +n.toFixed(1)));
};

const SETTINGS: SettingField[] = [
  {
    key: 'mode', label: 'طريقة اللعب', hint: 'فردي: كل واحد بإبرته · فريقين: إبرة واحدة للفريق',
    options: [{ value: 'solo', label: 'فردي', full: 'كل واحد لوحده' }, { value: 'teams', label: 'فريقين' }]
  },
  {
    key: 'rounds', label: 'اللفّات', hint: 'كام مرة كل واحد يبقى الراوي',
    options: [{ value: 1, label: '١', full: 'لفّة' }, { value: 2, label: '٢', full: 'لفّتين' }, { value: 3, label: '٣', full: '٣ لفّات' }]
  },
  {
    key: 'seconds', label: 'وقت التخمين', hint: 'الثواني اللي بعد كلمة الراوي',
    options: [{ value: 30, label: '٣٠', full: '٣٠ ثانية' }, { value: 60, label: '٦٠', full: '٦٠ ثانية' }, { value: 90, label: '٩٠', full: '٩٠ ثانية' }]
  }
];

export const waveDef: GameDef<WaveSettings> = {
  id: 'wave',
  name: 'الموجة',
  minPlayers: 3,
  settings: SETTINGS,
  defaultSettings: () => ({ mode: 'solo', rounds: 1, seconds: 60, teams: {} }),
  validateStart: (s, players) => { if (s.mode === 'teams' && players < 4) throw new GameError(`فريقين محتاجين ${arabicNum(4)} لاعيبة على الأقل`); },
  create: (settings) => new WaveEngine(settings)
};

interface TeamMsg { id: string; from: string; text: string; at: number }
interface Turn {
  index: number;
  narratorId: string;
  narratorTeam: Team | null;
  card: WaveCard;
  target: number;
  redrawn: boolean;
  clue: { text: string | null; voice: boolean } | null;
  /** Solo: private needles. */
  needles: Record<string, number>;
  locked: Record<string, number>;
  /** Teams: the shared needle, each teammate's finger, and who agreed to lock. */
  shared: number | null;
  fingers: Record<string, number>;
  votes: string[];
  calls: Record<string, Call>;
  chat: [TeamMsg[], TeamMsg[]];
  points: Record<string, number>;
  /** Reveal data. */
  result: { needles: { id: string; angle: number | null; points: number }[]; narratorAvg: number | null; zone: number | null; call: { correct: boolean | null; side: Call; calls: Record<string, Call> } | null; teamPoints: [number, number] | null } | null;
}

export class WaveEngine implements GameEngine {
  readonly id = 'wave';
  readonly hostActions = ['next'] as const;

  private readonly settings: WaveSettings;
  private room?: EngineCtx['room'];
  private participants: string[] = [];
  private teams: Record<string, Team> = {};
  private order: string[] = [];
  private deck: WaveCard[] = [];
  private deckAt = 0;
  private scores: Record<string, number> = {};
  private teamScores: [number, number] = [0, 0];
  private phase: Phase = 'clue';
  private endsAt: number | null = null;
  private turnNo = 0;
  private t!: Turn;
  private lastChatAt: Record<string, number> = {};
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(settings: WaveSettings) {
    this.settings = { ...settings };
  }

  private get teamsMode() { return this.settings.mode === 'teams'; }

  // ---------- GameEngine ----------

  start(ctx: EngineCtx, participants: string[]) {
    this.room = ctx.room;
    this.participants = [...participants];
    this.deck = shuffle(CARDS);
    this.teams = this.teamsMode ? normalizeTeams(participants, this.settings.teams) : {};
    this.order = this.buildOrder();
    this.turnNo = 0;
    this.startTurn(ctx);
  }

  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown) {
    const p = (payload ?? {}) as { angle?: unknown; text?: unknown; voice?: unknown; side?: unknown };
    switch (action) {
      case 'redraw': return this.redraw(ctx, playerId);
      case 'clue': return this.sendClue(ctx, playerId, p.text, !!p.voice);
      case 'needle': return this.needle(ctx, playerId, p.angle);
      case 'lock': return this.lock(ctx, playerId, p.angle);
      case 'unlock': return this.unlock(ctx, playerId);
      case 'call': return this.call(ctx, playerId, p.side);
      case 'teamChat': return this.teamChat(ctx, playerId, p.text);
      case 'next': return this.advance(ctx);
      default: throw new GameError('مش وقته دلوقتي');
    }
  }

  onLeave(ctx: EngineCtx, playerId: string) {
    delete this.scores[playerId];
    if (!this.t || this.phase === 'final') return;
    const wasNarrator = this.t.narratorId === playerId;
    this.participants = this.participants.filter((id) => id !== playerId);
    delete this.teams[playerId];
    delete this.t.needles[playerId];
    delete this.t.locked[playerId];
    delete this.t.fingers[playerId];
    delete this.t.calls[playerId];
    this.t.votes = this.t.votes.filter((id) => id !== playerId);
    if (this.participants.length < 2) return this.finish(ctx);
    if (wasNarrator && this.phase !== 'reveal') return this.skipTurn(ctx);
    this.checkProgress(ctx);
  }

  onPresenceChange(ctx: EngineCtx) {
    this.checkProgress(ctx);
  }

  scoreOf(playerId: string) {
    return this.teamsMode ? this.teamScores[this.teams[playerId] ?? 0] : this.scores[playerId] ?? 0;
  }

  /** Host ended the game. */
  abort(ctx: EngineCtx) {
    if (this.phase !== 'final') this.finish(ctx);
  }

  /** Share of the turns played. */
  progress() {
    const done = this.phase === 'reveal' || this.phase === 'final' ? this.turnNo : this.turnNo - 1;
    return Math.min(1, Math.max(0, done / Math.max(1, this.order.length)));
  }

  /** The lounge went back without results: stop the live-needle flush timer. */
  dispose() {
    this.clearFlush();
  }

  isOver() {
    return this.phase === 'final';
  }

  players() {
    return this.participants;
  }

  /** Teams mode: the team with more points wins (a tie counts as a win for both). */
  teamResult() {
    if (!this.teamsMode) return null;
    const ids = (t: Team) => this.participants.filter((id) => this.teams[id] === t);
    const [a, b] = this.teamScores;
    if (a === b) return { winners: [...ids(0), ...ids(1)], losers: [], label: 'تعادل' };
    const w: Team = a > b ? 0 : 1;
    return { winners: ids(w), losers: ids(w === 0 ? 1 : 0), label: w === 0 ? 'الفريق الأزرق' : 'الفريق البرتقالي' };
  }

  /** Secrets: the target only for the narrator until the reveal; solo needles never; the shared needle only for its team. */
  viewFor(playerId: string) {
    const t = this.t;
    const inGame = this.participants.includes(playerId);
    const myTeam = this.teamsMode && inGame ? this.teams[playerId] : null;
    const isNarrator = t?.narratorId === playerId;
    const revealed = this.phase === 'reveal' || this.phase === 'final';
    const guessing = this.guessingIds();
    const base = {
      type: 'wave' as const,
      mode: this.settings.mode,
      phase: this.phase,
      endsAt: this.endsAt,
      turn: this.turnNo,
      totalTurns: this.order.length,
      participants: this.participants,
      teams: this.teamsMode ? this.teams : null,
      teamScores: this.teamsMode ? this.teamScores : null
    };
    if (!t || this.phase === 'final') return { ...base, narratorId: null, narratorTeam: null, card: null, multiplier: 1, difficulty: null, canRedraw: false, clue: null, target: null, lockedIds: [], you: null, team: null, reveal: null, roundPoints: {} };

    const showNeedle = this.teamsMode && (this.phase === 'call' || this.phase === 'reveal' || (this.phase === 'guess' && myTeam === t.narratorTeam));
    return {
      ...base,
      narratorId: t.narratorId,
      narratorTeam: t.narratorTeam,
      card: { left: t.card.left, right: t.card.right },
      multiplier: MULT[t.card.difficulty],
      difficulty: t.card.difficulty,
      canRedraw: isNarrator && this.phase === 'clue' && !t.redrawn,
      clue: t.clue,
      target: isNarrator || revealed || this.phase === 'reveal' ? t.target : null,
      lockedIds: this.phase === 'guess' ? (this.teamsMode ? t.votes : Object.keys(t.locked)) : this.phase === 'call' ? Object.keys(t.calls) : [],
      you: inGame
        ? {
            role: isNarrator ? 'narrator' : this.phase === 'call' && this.callIds().includes(playerId) ? 'caller' : guessing.includes(playerId) ? 'guesser' : 'watcher',
            team: myTeam,
            needle: this.teamsMode ? null : t.needles[playerId] ?? null, // your own needle only
            locked: this.teamsMode ? t.votes.includes(playerId) : playerId in t.locked,
            call: t.calls[playerId] ?? null
          }
        : null,
      team: myTeam !== null && myTeam !== undefined
        ? {
            index: myTeam,
            needle: showNeedle ? t.shared : null,
            fingers: this.phase === 'guess' && myTeam === t.narratorTeam ? Object.entries(t.fingers).map(([id, angle]) => ({ id, angle })) : [],
            chat: !isNarrator ? t.chat[myTeam] : [],
            need: this.phase === 'guess' && myTeam === t.narratorTeam ? this.majority() : 0
          }
        : null,
      reveal: this.phase === 'reveal' && t.result ? t.result : null,
      roundPoints: this.phase === 'reveal' ? t.points : {}
    };
  }

  // ---------- turns ----------

  /** Everyone narrates `rounds` times. Solo: around the table. Teams: the two teams take turns, each cycling through its members. */
  private buildOrder(): string[] {
    const r = this.settings.rounds;
    if (!this.teamsMode) {
      const ring = shuffle(this.participants);
      return Array.from({ length: r }, () => ring).flat();
    }
    const a = shuffle(this.participants.filter((id) => this.teams[id] === 0));
    const b = shuffle(this.participants.filter((id) => this.teams[id] === 1));
    const turns = r * 2 * Math.max(a.length, b.length);
    return Array.from({ length: turns }, (_, i) => {
      const q = i % 2 === 0 ? a : b;
      return q[Math.floor(i / 2) % q.length];
    });
  }

  private online(ctx: EngineCtx) {
    return this.participants.filter((id) => ctx.room.players.get(id)?.connected);
  }

  private nextCard(): WaveCard {
    if (this.deckAt >= this.deck.length) { this.deck = shuffle(CARDS); this.deckAt = 0; }
    return this.deck[this.deckAt++];
  }

  private startTurn(ctx: EngineCtx) {
    this.clearFlush();
    // skip narrators who left or are offline
    while (this.turnNo < this.order.length) {
      const id = this.order[this.turnNo];
      this.turnNo += 1;
      if (!this.participants.includes(id) || !ctx.room.players.get(id)?.connected) continue;
      if (this.teamsMode && this.teams[id] === undefined) continue;
      return this.beginTurn(ctx, id);
    }
    this.finish(ctx);
  }

  private beginTurn(ctx: EngineCtx, narratorId: string) {
    if (this.turnNo > 1) ctx.system(`الدور ${arabicNum(this.turnNo)}`);
    this.t = {
      index: this.turnNo,
      narratorId,
      narratorTeam: this.teamsMode ? this.teams[narratorId] : null,
      card: this.nextCard(),
      target: +(24 + Math.random() * 132).toFixed(1), // keeps every zone inside the dial
      redrawn: false,
      clue: null,
      needles: {}, locked: {}, shared: null, fingers: {}, votes: [], calls: {},
      chat: [[], []],
      points: {}, result: null
    };
    this.phase = 'clue';
    this.endsAt = Date.now() + CLUE_SECONDS * 1000;
    ctx.schedule(CLUE_SECONDS, () => this.skipTurn(ctx)); // the narrator never said anything: skip the turn
    ctx.emit();
  }

  private skipTurn(ctx: EngineCtx) {
    if (this.phase === 'reveal' || this.phase === 'final') return;
    this.startTurn(ctx);
  }

  private finish(ctx: EngineCtx) {
    this.clearFlush();
    ctx.clearTimer();
    this.phase = 'final';
    this.endsAt = null;
    ctx.emit();
  }

  private advance(ctx: EngineCtx) {
    if (this.phase !== 'reveal') throw new GameError('مش وقته دلوقتي');
    if (this.turnNo >= this.order.length) return this.finish(ctx);
    if (this.online(ctx).length < waveDef.minPlayers - 1) throw new GameError('اللاعيبة قلّوا أوي');
    this.startTurn(ctx);
  }

  // ---------- who plays what ----------

  /** Players who place the needle this turn: everyone but the narrator (solo), or the narrator's teammates (teams). */
  private guessingIds(): string[] {
    const t = this.t;
    if (!t) return [];
    return this.participants.filter((id) => id !== t.narratorId && (!this.teamsMode || this.teams[id] === t.narratorTeam));
  }

  /** Teams: the other team, which calls left/right after the needle is locked. */
  private callIds(): string[] {
    const t = this.t;
    return this.participants.filter((id) => this.teamsMode && this.teams[id] !== t.narratorTeam);
  }

  private connected(ctx: EngineCtx, ids: string[]) {
    return ids.filter((id) => ctx.room.players.get(id)?.connected);
  }

  /** Teams: how many agreeing teammates lock the needle (a majority of the connected guessers). */
  private majority() {
    const n = this.room ? this.connected({ room: this.room } as EngineCtx, this.guessingIds()).length : this.guessingIds().length;
    return Math.floor(Math.max(1, n) / 2) + 1;
  }

  // ---------- narrator ----------

  private mustNarrator(playerId: string) {
    if (this.phase !== 'clue') throw new GameError('مش وقته دلوقتي');
    if (this.t.narratorId !== playerId) throw new GameError('انت مش الراوي');
    return this.t;
  }

  private redraw(ctx: EngineCtx, playerId: string) {
    const t = this.mustNarrator(playerId);
    if (t.redrawn) throw new GameError('الكارت التاني اتاخد خلاص');
    t.redrawn = true;
    t.card = this.nextCard();
    t.target = +(24 + Math.random() * 132).toFixed(1);
    ctx.emit();
  }

  /** The clue is typed (shown big to everyone) or spoken out loud ("قلته بصوتي"). */
  private sendClue(ctx: EngineCtx, playerId: string, text: unknown, voice: boolean) {
    const t = this.mustNarrator(playerId);
    let clue = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!voice && !clue) throw new GameError('اكتب الكلمة أو دوس «قلته بصوتي»');
    if (this.room?.privacy === 'public') clue = maskBad(clue);
    t.clue = { text: voice ? null : clue, voice };
    this.phase = 'guess';
    this.endsAt = Date.now() + this.settings.seconds * 1000;
    ctx.schedule(this.settings.seconds, () => this.guessTimeUp(ctx));
    ctx.emit();
  }

  // ---------- guessing ----------

  private mustGuesser(playerId: string) {
    if (this.phase !== 'guess') throw new GameError('مش وقته دلوقتي');
    if (!this.guessingIds().includes(playerId)) throw new GameError(this.t.narratorId === playerId ? 'الراوي مبيخمّنش' : 'مش دورك تحط الإبرة');
    return this.t;
  }

  /** Solo: stored privately, nothing is broadcast. Teams: the shared needle goes to that team only, ~10 times a second. */
  private needle(ctx: EngineCtx, playerId: string, angle: unknown) {
    const t = this.mustGuesser(playerId);
    const a = clampAngle(angle);
    if (!this.teamsMode) {
      if (playerId in t.locked) throw new GameError('غيّر رأيك الأول');
      t.needles[playerId] = a;
      return;
    }
    t.shared = a;
    t.fingers[playerId] = a;
    if (t.votes.length) { t.votes = []; ctx.emit(); } // the needle moved: the team has to agree again
    this.flushSoon(ctx);
  }

  private flushSoon(ctx: EngineCtx) {
    if (this.flushTimer) return;
    const turn = this.t;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.t !== turn || this.phase !== 'guess') return;
      ctx.emitTo(this.participants.filter((id) => this.teams[id] === turn.narratorTeam));
    }, NEEDLE_FLUSH_MS);
  }

  private clearFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private lock(ctx: EngineCtx, playerId: string, angle: unknown) {
    const t = this.mustGuesser(playerId);
    if (this.teamsMode) {
      if (t.shared === null) throw new GameError('حرّك الإبرة الأول');
      if (!t.votes.includes(playerId)) t.votes.push(playerId);
      ctx.emit();
      return this.checkProgress(ctx);
    }
    if (angle !== undefined && angle !== null) t.needles[playerId] = clampAngle(angle);
    if (t.needles[playerId] === undefined) throw new GameError('حرّك الإبرة الأول');
    t.locked[playerId] = Date.now();
    ctx.emit();
    this.checkProgress(ctx);
  }

  private unlock(ctx: EngineCtx, playerId: string) {
    const t = this.mustGuesser(playerId);
    if (this.teamsMode) t.votes = t.votes.filter((id) => id !== playerId);
    else delete t.locked[playerId];
    ctx.emit();
  }

  private checkProgress(ctx: EngineCtx) {
    const t = this.t;
    if (!t) return;
    if (this.phase === 'guess') {
      const on = this.connected(ctx, this.guessingIds());
      if (this.teamsMode) {
        if (t.shared !== null && t.votes.filter((id) => on.includes(id)).length >= Math.floor(Math.max(1, on.length) / 2) + 1) this.toCall(ctx);
      } else if (on.length > 0 && on.every((id) => id in t.locked)) this.reveal(ctx);
    } else if (this.phase === 'call') {
      const on = this.connected(ctx, this.callIds());
      if (on.length === 0 || on.every((id) => id in t.calls)) this.reveal(ctx);
    }
  }

  private guessTimeUp(ctx: EngineCtx) {
    if (this.phase !== 'guess') return;
    if (this.teamsMode && this.t.shared !== null) return this.toCall(ctx); // the needle where it stands counts
    this.reveal(ctx);
  }

  // ---------- teams: the other team's left/right call ----------

  private toCall(ctx: EngineCtx) {
    this.clearFlush();
    if (this.connected(ctx, this.callIds()).length === 0) return this.reveal(ctx);
    this.phase = 'call';
    this.endsAt = Date.now() + CALL_SECONDS * 1000;
    ctx.schedule(CALL_SECONDS, () => this.reveal(ctx));
    ctx.emit();
  }

  private call(ctx: EngineCtx, playerId: string, side: unknown) {
    if (this.phase !== 'call') throw new GameError('مش وقته دلوقتي');
    if (!this.callIds().includes(playerId)) throw new GameError('الفريق التاني هو اللي بيقول');
    if (side !== 'left' && side !== 'right') throw new GameError('اختيار مش صح');
    this.t.calls[playerId] = side;
    ctx.emit();
    this.checkProgress(ctx);
  }

  private teamChat(ctx: EngineCtx, playerId: string, text: unknown) {
    const t = this.t;
    if (!this.teamsMode || !t || (this.phase !== 'guess' && this.phase !== 'call' && this.phase !== 'clue')) throw new GameError('مش وقته دلوقتي');
    const team = this.teams[playerId];
    if (team === undefined) throw new GameError('انت مش في فريق');
    if (playerId === t.narratorId) throw new GameError('الراوي مبيكتبش لفريقه');
    let msg = String(text ?? '').trim().slice(0, 120);
    if (!msg) return;
    const now = Date.now();
    if (now - (this.lastChatAt[playerId] ?? 0) < 1000) throw new GameError('استنى ثانية');
    this.lastChatAt[playerId] = now;
    if (this.room?.privacy === 'public') msg = maskBad(msg);
    t.chat[team] = [...t.chat[team], { id: `${now}-${playerId}`, from: playerId, text: msg, at: now }].slice(-30);
    ctx.emitTo(this.participants.filter((id) => this.teams[id] === team && id !== t.narratorId));
  }

  // ---------- reveal and scoring ----------

  /**
   * Solo: every guesser gets the zone points of their needle; the narrator gets the average of those points (rounded).
   * Teams: the narrator's team gets the zone points of the shared needle; the other team gets +1 for a correct left/right call.
   * Zone points are multiplied by the card's difficulty (x1 / x1.5 / x2).
   */
  private reveal(ctx: EngineCtx) {
    if (this.phase !== 'guess' && this.phase !== 'call') return;
    this.clearFlush();
    const t = this.t;
    const mult = MULT[t.card.difficulty];
    if (!this.teamsMode) {
      const needles = this.guessingIds().map((id) => {
        const angle = id in t.needles ? t.needles[id] : null;
        const points = angle === null ? 0 : Math.round(zonePoints(angle - t.target) * mult);
        return { id, angle, points };
      });
      const avg = needles.length ? Math.round(needles.reduce((s, n) => s + n.points, 0) / needles.length) : 0;
      needles.forEach((n) => { t.points[n.id] = n.points; this.scores[n.id] = (this.scores[n.id] ?? 0) + n.points; });
      t.points[t.narratorId] = avg;
      this.scores[t.narratorId] = (this.scores[t.narratorId] ?? 0) + avg;
      t.result = { needles: needles.sort((a, b) => b.points - a.points), narratorAvg: avg, zone: null, call: null, teamPoints: null };
    } else {
      const needle = t.shared;
      const zone = needle === null ? 0 : Math.round(zonePoints(needle - t.target) * mult);
      const teamPoints: [number, number] = [0, 0];
      teamPoints[t.narratorTeam!] = zone;
      // the other team's call: the target is left (smaller angle) or right of the needle; a tie in the votes counts as no call
      const side: Call = needle !== null && t.target < needle ? 'left' : 'right';
      const votes = Object.values(t.calls);
      const left = votes.filter((v) => v === 'left').length, right = votes.length - left;
      const decided = left === right ? null : left > right ? 'left' : 'right';
      const correct = needle === null || decided === null ? null : decided === side;
      if (correct) teamPoints[t.narratorTeam === 0 ? 1 : 0] = 1;
      this.teamScores = [this.teamScores[0] + teamPoints[0], this.teamScores[1] + teamPoints[1]];
      this.participants.forEach((id) => { t.points[id] = teamPoints[this.teams[id]]; });
      t.result = { needles: needle === null ? [] : [{ id: 'team', angle: needle, points: zone }], narratorAvg: null, zone, call: { correct, side, calls: { ...t.calls } }, teamPoints };
    }
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_AUTO_SECONDS * 1000;
    ctx.schedule(REVEAL_AUTO_SECONDS, () => { try { this.advance(ctx); } catch { /* the host decides */ } });
    ctx.emit();
  }
}
