import { GameError } from '../../rooms/rooms.types';
import type { EngineCtx, GameDef, GameEngine } from '../game-engine';
import { PLACE_FAMILIES } from './places';
import type { SpyGame, SpyOutcome, SpySettings } from './spy.types';

export const VOTE_SECONDS = 45;
export const REVEAL_SECONDS = 6;
export const GUESS_SECONDS = 20;

const arabicNum = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const spyDef: GameDef<SpySettings> = {
  id: 'spy',
  name: 'مين الجاسوس؟',
  minPlayers: 3,
  defaultSettings: () => ({ discussSeconds: 480, rounds: 3 }),
  parseSettings(current, patch) {
    const p = (patch ?? {}) as { discussSeconds?: unknown; rounds?: unknown };
    const secs = Number(p.discussSeconds);
    const rounds = Number(p.rounds);
    return {
      discussSeconds: [300, 480, 600].includes(secs) ? secs : current.discussSeconds,
      rounds: [1, 3, 5].includes(rounds) ? rounds : current.rounds
    };
  },
  create: (settings) => new SpyEngine(settings)
};

export class SpyEngine implements GameEngine {
  readonly id = 'spy';
  readonly hostActions = ['next'] as const;

  private g!: SpyGame;
  private scores: Record<string, number> = {};

  constructor(private readonly settings: SpySettings) {}

  // ---------- GameEngine ----------

  start(ctx: EngineCtx, participants: string[]) {
    this.scores = {};
    this.startRound(ctx, 1, participants);
  }

  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown) {
    const p = (payload ?? {}) as { targetId?: unknown; place?: unknown };
    switch (action) {
      case 'nextTurn': return this.nextTurn(ctx, playerId);
      case 'callVote': return this.callVote(ctx, playerId);
      case 'vote': return this.vote(ctx, playerId, p.targetId);
      case 'guess': return this.guess(ctx, playerId, p.place);
      case 'next': return this.nextRound(ctx);
      default: throw new GameError('مش وقته دلوقتي');
    }
  }

  onLeave(ctx: EngineCtx, playerId: string) {
    const g = this.g;
    delete this.scores[playerId];
    if (!g.participants.includes(playerId)) return;
    g.participants = g.participants.filter((id) => id !== playerId);
    delete g.votes[playerId];
    if (g.spyId === playerId && ['discuss', 'vote', 'reveal', 'guess'].includes(g.phase)) {
      this.finishRound(ctx, 'detectives');
      return;
    }
    if (g.askerId === playerId || g.targetId === playerId) this.rotateTurn(true);
    this.checkAllVoted(ctx);
  }

  onPresenceChange(ctx: EngineCtx) {
    this.checkAllVoted(ctx);
  }

  scoreOf(playerId: string) {
    return this.scores[playerId] ?? 0;
  }

  isOver() {
    return this.g?.phase === 'final';
  }

  viewFor(playerId: string) {
    const g = this.g;
    const inRound = g.participants.includes(playerId);
    const isSpy = g.spyId === playerId;
    const ended = g.phase === 'result' || g.phase === 'final';
    const counts: Record<string, number> = {};
    Object.values(g.votes).forEach((t) => (counts[t] = (counts[t] || 0) + 1));
    return {
      type: 'spy',
      round: g.round,
      totalRounds: g.totalRounds,
      phase: g.phase,
      endsAt: g.endsAt,
      board: g.board,
      participants: g.participants,
      askerId: g.askerId,
      targetId: g.targetId,
      you: inRound ? { isSpy, place: isSpy && !ended ? null : g.place.name, role: isSpy ? null : g.roles[playerId] } : null,
      votedIds: Object.keys(g.votes),
      voteCounts: counts,
      myVote: g.votes[playerId] ?? null,
      accusedId: ['reveal', 'guess', 'result', 'final'].includes(g.phase) ? g.accusedId : null,
      caught: ['reveal', 'guess', 'result', 'final'].includes(g.phase) ? g.caught : null,
      spyId: ended || (g.phase !== 'discuss' && g.phase !== 'vote' && g.caught) ? g.spyId : null,
      guessOptions: g.phase === 'guess' && isSpy ? g.guessOptions : null,
      place: ended || (!isSpy && inRound) ? g.place.name : null,
      spyGuess: ended ? g.spyGuess : null,
      outcome: g.outcome,
      roundPoints: ended ? g.roundPoints : {}
    };
  }

  // ---------- rules ----------

  private startRound(ctx: EngineCtx, round: number, participants: string[]) {
    const family = pick(PLACE_FAMILIES);
    const place = pick(family.places);
    const familyNames = family.places.map((p) => p.name);
    const others = shuffle(PLACE_FAMILIES.filter((f) => f !== family).flatMap((f) => f.places.map((p) => p.name)));
    const board = shuffle([...familyNames, ...others.slice(0, Math.max(0, 12 - familyNames.length))]);
    const guessOptions = shuffle([place.name, ...shuffle(familyNames.filter((n) => n !== place.name)).slice(0, 5)]);
    const spyId = pick(participants);
    const roles: Record<string, string> = {};
    let pool: string[] = [];
    participants.forEach((id) => {
      if (id === spyId) return;
      if (pool.length === 0) pool = shuffle(place.roles);
      roles[id] = pool.pop()!;
    });
    const askerId = pick(participants);
    const seconds = this.settings.discussSeconds;
    // round 1 is announced by the room ("بدأت لعبة ..."); later rounds get their own divider
    if (round > 1) ctx.system(`بدأت الجولة ${arabicNum(round)}`);
    this.g = {
      round,
      totalRounds: this.settings.rounds,
      phase: 'discuss',
      endsAt: Date.now() + seconds * 1000,
      place, board, guessOptions, spyId, roles, participants,
      askerId,
      targetId: pick(participants.filter((id) => id !== askerId)),
      votes: {},
      accusedId: null,
      caught: false,
      spyGuess: null,
      outcome: null,
      roundPoints: {}
    };
    ctx.schedule(seconds, () => this.startVote(ctx));
    ctx.emit();
  }

  private mustPhase(phase: SpyGame['phase']) {
    if (this.g.phase !== phase) throw new GameError('مش وقته دلوقتي');
    return this.g;
  }

  private nextTurn(ctx: EngineCtx, playerId: string) {
    const g = this.mustPhase('discuss');
    if (g.askerId !== playerId) throw new GameError('مش دورك تسأل');
    this.rotateTurn(false);
    ctx.emit();
  }

  private rotateTurn(reset: boolean) {
    const g = this.g;
    const ids = g.participants;
    if (ids.length < 2) return;
    const prevAsker = g.askerId;
    g.askerId = reset || !ids.includes(g.targetId) ? pick(ids) : g.targetId;
    const choices = ids.filter((id) => id !== g.askerId && id !== prevAsker);
    g.targetId = pick(choices.length ? choices : ids.filter((id) => id !== g.askerId));
  }

  private callVote(ctx: EngineCtx, playerId: string) {
    const g = this.mustPhase('discuss');
    if (!g.participants.includes(playerId)) throw new GameError('انت مش في الجولة دي');
    this.startVote(ctx);
  }

  private startVote(ctx: EngineCtx) {
    const g = this.g;
    if (g.phase !== 'discuss') return;
    g.phase = 'vote';
    g.votes = {};
    g.endsAt = Date.now() + VOTE_SECONDS * 1000;
    ctx.schedule(VOTE_SECONDS, () => this.tally(ctx));
    ctx.emit();
  }

  private vote(ctx: EngineCtx, playerId: string, targetId: unknown) {
    const g = this.mustPhase('vote');
    const t = String(targetId ?? '');
    if (!g.participants.includes(playerId)) throw new GameError('انت مش في الجولة دي');
    if (t === playerId) throw new GameError('مينفعش تصوّت على نفسك');
    if (!g.participants.includes(t)) throw new GameError('اللاعب ده مش موجود');
    g.votes[playerId] = t;
    ctx.emit();
    this.checkAllVoted(ctx);
  }

  private checkAllVoted(ctx: EngineCtx) {
    const g = this.g;
    if (!g || g.phase !== 'vote') return;
    const voters = g.participants.filter((id) => ctx.room.players.get(id)?.connected);
    if (voters.length > 0 && voters.every((id) => g.votes[id])) this.tally(ctx);
  }

  private tally(ctx: EngineCtx) {
    const g = this.g;
    if (!g || g.phase !== 'vote') return;
    const counts: Record<string, number> = {};
    Object.values(g.votes).forEach((t) => (counts[t] = (counts[t] || 0) + 1));
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((id) => counts[id] === max);
    g.accusedId = max > 0 && top.length === 1 ? top[0] : null;
    g.caught = g.accusedId === g.spyId;
    g.phase = 'reveal';
    g.endsAt = Date.now() + REVEAL_SECONDS * 1000;
    ctx.schedule(REVEAL_SECONDS, () => {
      if (this.g !== g || g.phase !== 'reveal') return;
      if (g.caught) {
        g.phase = 'guess';
        g.endsAt = Date.now() + GUESS_SECONDS * 1000;
        ctx.schedule(GUESS_SECONDS, () => this.resolveGuess(ctx, null));
        ctx.emit();
      } else {
        this.finishRound(ctx, 'spy-escaped');
      }
    });
    ctx.emit();
  }

  private guess(ctx: EngineCtx, playerId: string, placeName: unknown) {
    const g = this.mustPhase('guess');
    if (g.spyId !== playerId) throw new GameError('الجاسوس بس اللي بيخمّن');
    const name = String(placeName ?? '');
    if (!g.guessOptions.includes(name)) throw new GameError('اختار من الاختيارات');
    this.resolveGuess(ctx, name);
  }

  private resolveGuess(ctx: EngineCtx, name: string | null) {
    const g = this.g;
    if (!g || g.phase !== 'guess') return;
    g.spyGuess = name;
    this.finishRound(ctx, name === g.place.name ? 'spy-guessed' : 'detectives');
  }

  private finishRound(ctx: EngineCtx, outcome: SpyOutcome) {
    const g = this.g;
    ctx.clearTimer();
    g.outcome = outcome;
    g.phase = 'result';
    g.endsAt = null;
    const pts: Record<string, number> = {};
    g.participants.forEach((id) => {
      const votedSpy = g.votes[id] === g.spyId;
      if (id === g.spyId) pts[id] = outcome === 'spy-escaped' ? 400 : outcome === 'spy-guessed' ? 300 : 0;
      else if (outcome === 'detectives') pts[id] = votedSpy ? 200 : 100;
      else pts[id] = votedSpy ? 100 : 0;
    });
    g.roundPoints = pts;
    Object.entries(pts).forEach(([id, n]) => {
      this.scores[id] = (this.scores[id] ?? 0) + n;
    });
    ctx.emit();
  }

  private nextRound(ctx: EngineCtx) {
    const g = this.mustPhase('result');
    if (g.round >= g.totalRounds) {
      g.phase = 'final';
      ctx.emit();
      return;
    }
    const online = [...ctx.room.players.values()].filter((p) => p.connected).map((p) => p.id);
    if (online.length < spyDef.minPlayers) throw new GameError(`محتاجين ${spyDef.minPlayers} لاعيبة على الأقل`);
    this.startRound(ctx, g.round + 1, online);
  }
}
