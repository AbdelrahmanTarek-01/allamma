import { arabicNum } from '../../common/ar';
import { GameError, type Room } from '../../rooms/rooms.types';
import type { EngineCtx, GameDef, GameEngine, SettingField } from '../game-engine';
import type { Level } from '../difficulty';
import { PLACE_FAMILIES } from './places';
import type { SpyGame, SpyOutcome, SpySettings } from './spy.types';

export const VOTE_SECONDS = 45;
export const REVEAL_SECONDS = 6;
/** After a round (not the last): the result screen, then the shared standings in the last 8 seconds, then the next round starts by itself. */
export const RESULT_SECONDS = 24;
export const GUESS_SECONDS = 20;

/** One row per level (01-brainstorm/difficulty.md). A new knob is one more field here. */
export interface SpyLevel {
  discussSeconds: number;
  /** How many places the caught spy guesses from (the real one included). */
  guessOptions: number;
  /** Place tiers (1-4) that can come up at this level, inclusive. */
  tiers: [number, number];
  /** The guess options come from the real place's family first (hard to tell apart). */
  sameFamily: boolean;
  /** Points multiplier. Every award is multiplied, then rounded up to the nearest 10. */
  multiplier: number;
  /** With at least this many players there are two spies even if the host asked for one (0 = never). */
  twoSpiesFrom: number;
}
export const SPY_LEVELS: Record<Level, SpyLevel> = {
  easy: { discussSeconds: 480, guessOptions: 6, tiers: [1, 1], sameFamily: false, multiplier: 1, twoSpiesFrom: 0 },
  medium: { discussSeconds: 360, guessOptions: 9, tiers: [1, 2], sameFamily: false, multiplier: 1.5, twoSpiesFrom: 0 },
  hard: { discussSeconds: 300, guessOptions: 12, tiers: [2, 3], sameFamily: true, multiplier: 2, twoSpiesFrom: 0 },
  max: { discussSeconds: 240, guessOptions: 12, tiers: [3, 4], sameFamily: true, multiplier: 2.5, twoSpiesFrom: 6 }
};
const up10 = (n: number) => Math.ceil(n / 10) * 10;

/** Spies allowed by connected players: 3-5 => 1, 6-8 => up to 2, 9-10 => up to 3. */
export const MIN_PLAYERS_FOR_SPIES: Record<number, number> = { 1: 3, 2: 6, 3: 9 };
export const maxSpiesFor = (players: number) => (players >= 9 ? 3 : players >= 6 ? 2 : 1);
const spyWord = (n: number) => (n === 1 ? 'جاسوس واحد' : n === 2 ? 'جاسوسين' : `${arabicNum(n)} جواسيس`);

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * The settings schema: the client renders the settings sheet from this, the server validates against it.
 * Rule: one word or number per option button (`label`), explanations in the one helper line (`hint`).
 * `full` is only for the read-only summary line.
 */
const SETTINGS: SettingField[] = [
  {
    key: 'rounds', label: 'عدد الجولات', hint: 'كام جولة هتلعبوا قبل الترتيب النهائي',
    options: [{ value: 1, label: '١', full: 'جولة' }, { value: 3, label: '٣', full: '٣ جولات' }, { value: 5, label: '٥', full: '٥ جولات' }]
  },
  {
    // the button is a big number plus that many spy-hat icons; the helper line is dynamic (built from minPlayers)
    key: 'spies', label: 'عدد الجواسيس', icon: 'spy',
    options: [
      { value: 1, label: '١', full: spyWord(1), minPlayers: MIN_PLAYERS_FOR_SPIES[1] },
      { value: 2, label: '٢', full: spyWord(2), hintName: 'جاسوسين', minPlayers: MIN_PLAYERS_FOR_SPIES[2] },
      { value: 3, label: '٣', full: spyWord(3), hintName: '٣', minPlayers: MIN_PLAYERS_FOR_SPIES[3] }
    ]
  }
];

export const spyDef: GameDef<SpySettings> = {
  id: 'spy',
  name: 'مين الجاسوس؟',
  minPlayers: 3,
  settings: SETTINGS,
  levels: SPY_LEVELS,
  defaultSettings: () => ({ rounds: 3, spies: 1 }),
  create: (settings, level) => new SpyEngine(settings, level)
};

export class SpyEngine implements GameEngine {
  readonly id = 'spy';
  /** `next` (next round) and `startVote` (the host decides when the vote begins) are host-only. */
  readonly hostActions = ['next', 'startVote'] as const;

  private g!: SpyGame;
  private room?: Room; // to know who is connected when counting "ready"
  private scores: Record<string, number> = {};
  private readonly settings: SpySettings;
  private readonly level: Level;

  constructor(settings: SpySettings, level: Level) {
    this.level = level;
    this.settings = { ...settings }; // the room's saved choice stays untouched when a round clamps the spy count
  }

  // ---------- GameEngine ----------

  start(ctx: EngineCtx, participants: string[]) {
    this.room = ctx.room;
    this.scores = {};
    this.startRound(ctx, 1, participants);
  }

  handle(ctx: EngineCtx, playerId: string, action: string, payload: unknown) {
    const p = (payload ?? {}) as { targetId?: unknown; place?: unknown; ready?: unknown };
    switch (action) {
      case 'nextTurn': return this.nextTurn(ctx, playerId);
      case 'readyToVote': return this.readyToVote(ctx, playerId, p.ready);
      case 'startVote': return this.startVoteNow(ctx);
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
    g.readyIds = g.readyIds.filter((id) => id !== playerId);
    delete g.votes[playerId];
    // votes that pointed at the player who left no longer count: those voters can pick again
    Object.keys(g.votes).forEach((voter) => { if (g.votes[voter] === playerId) delete g.votes[voter]; });

    const live = ['discuss', 'vote', 'reveal', 'guess'].includes(g.phase);
    if (live && g.spyIds.includes(playerId)) {
      const spiesLeft = g.spyIds.filter((id) => g.participants.includes(id));
      const caughtOneLeft = g.caught && g.accusedId === playerId && (g.phase === 'reveal' || g.phase === 'guess');
      if (spiesLeft.length === 0 || caughtOneLeft) {
        this.finishRound(ctx, 'detectives');
        return;
      }
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

  players() {
    return this.g?.participants ?? [];
  }

  viewFor(playerId: string) {
    const g = this.g;
    const inRound = g.participants.includes(playerId);
    const isSpy = g.spyIds.includes(playerId);
    const ended = g.phase === 'result' || g.phase === 'final';
    const revealed = ['reveal', 'guess', 'result', 'final'].includes(g.phase);
    const counts: Record<string, number> = {};
    Object.values(g.votes).forEach((t) => (counts[t] = (counts[t] || 0) + 1));
    const caughtSpyId = revealed && g.caught ? g.accusedId : null;
    // "ready to vote": only connected players count, in the ready list and in the total
    const online = g.participants.filter((id) => this.room?.players.get(id)?.connected);
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
      readyToVoteIds: g.phase === 'discuss' ? online.filter((id) => g.readyIds.includes(id)) : [],
      readyTotal: online.length,
      spyCount: g.spyIds.length, // how many spies there are is public, who they are is not
      difficulty: g.difficulty,
      multiplier: g.multiplier,
      you: inRound ? { isSpy, place: isSpy && !ended ? null : g.place.name, role: isSpy ? null : g.roles[playerId] } : null,
      votedIds: Object.keys(g.votes),
      voteCounts: counts,
      myVote: g.votes[playerId] ?? null,
      accusedId: revealed ? g.accusedId : null,
      caught: revealed ? g.caught : null,
      caughtSpyId, // the one spy the votes caught: shown from the reveal on
      spyIds: ended ? g.spyIds : null, // everyone's spies only when the round is over
      guessOptions: g.phase === 'guess' && caughtSpyId === playerId ? g.guessOptions : null, // only the caught spy
      place: ended || (!isSpy && inRound) ? g.place.name : null,
      spyGuess: ended ? g.spyGuess : null,
      outcome: g.outcome,
      roundPoints: ended ? g.roundPoints : {}
    };
  }

  // ---------- rules ----------

  private startRound(ctx: EngineCtx, round: number, participants: string[]) {
    const s = this.settings;
    // round 1 is announced by the room ("بدأت لعبة ..."); later rounds get their own divider
    if (round > 1) ctx.system(`بدأت الجولة ${arabicNum(round)}`);

    // not enough players for the wanted number of spies (people left): clamp for this round and say so
    // the lounge's level decides the time, the place pool, the guess options and (on max) the second spy
    const lvl = SPY_LEVELS[this.level];
    const wanted = lvl.twoSpiesFrom && participants.length >= lvl.twoSpiesFrom ? Math.max(s.spies, 2) : s.spies;
    const spies = Math.min(wanted, maxSpiesFor(participants.length));
    if (spies < wanted) ctx.system(`اللاعيبة قلّوا، فعدد الجواسيس بقى ${spyWord(spies)}`);

    const all = PLACE_FAMILIES.flatMap((f) => f.places.map((place) => ({ family: f, place })));
    const pool = all.filter((x) => x.place.difficulty >= lvl.tiers[0] && x.place.difficulty <= lvl.tiers[1]);
    const { family, place } = pick(pool.length ? pool : all);

    const familyNames = family.places.map((p) => p.name);
    const others = shuffle(PLACE_FAMILIES.filter((f) => f !== family).flatMap((f) => f.places.map((p) => p.name)));
    const board = shuffle([...familyNames, ...others.slice(0, Math.max(0, 12 - familyNames.length))]);
    // guess options: the real place + (n-1) others. Hard/max take the real place's family first (near-identical siblings), then top up.
    const siblings = shuffle(familyNames.filter((n) => n !== place.name));
    const elsewhere = shuffle(PLACE_FAMILIES.flatMap((f) => f.places.map((x) => x.name)).filter((n) => n !== place.name && !siblings.includes(n)));
    const wrong = lvl.sameFamily ? [...siblings, ...elsewhere] : shuffle([...siblings, ...elsewhere]);
    const guessOptions = shuffle([place.name, ...wrong.slice(0, lvl.guessOptions - 1)]);

    const spyIds = shuffle(participants).slice(0, spies);
    const roles: Record<string, string> = {}; // only detectives get a role; spies just get the spy card
    let pool2: string[] = [];
    participants.forEach((id) => {
      if (spyIds.includes(id)) return;
      if (pool2.length === 0) pool2 = shuffle(place.roles);
      roles[id] = pool2.pop()!;
    });

    const askerId = pick(participants);
    this.g = {
      round,
      totalRounds: s.rounds,
      phase: 'discuss',
      endsAt: Date.now() + lvl.discussSeconds * 1000,
      place, difficulty: this.level, multiplier: lvl.multiplier,
      board, guessOptions, spyIds, roles, participants,
      askerId,
      targetId: pick(participants.filter((id) => id !== askerId)),
      readyIds: [], // reset every round
      votes: {},
      accusedId: null,
      caught: false,
      spyGuess: null,
      outcome: null,
      roundPoints: {}
    };
    ctx.schedule(lvl.discussSeconds, () => this.startVote(ctx));
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

  /** A player toggles "ready to vote". It only informs the host: nothing starts by itself when everyone is ready. */
  private readyToVote(ctx: EngineCtx, playerId: string, ready: unknown) {
    const g = this.mustPhase('discuss');
    if (!g.participants.includes(playerId)) throw new GameError('انت مش في الجولة دي');
    const has = g.readyIds.includes(playerId);
    if (ready && !has) g.readyIds.push(playerId);
    else if (!ready && has) g.readyIds = g.readyIds.filter((id) => id !== playerId);
    ctx.emit();
  }

  /** Host only (declared in hostActions): start the vote now, even if not everyone is ready. The timer still starts it automatically. */
  private startVoteNow(ctx: EngineCtx) {
    this.mustPhase('discuss');
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

  /** The votes reveal ONE player: the single top-voted one (a tie reveals nobody). If that player is a spy, that spy is caught. */
  private tally(ctx: EngineCtx) {
    const g = this.g;
    if (!g || g.phase !== 'vote') return;
    const counts: Record<string, number> = {};
    Object.values(g.votes).forEach((t) => (counts[t] = (counts[t] || 0) + 1));
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((id) => counts[id] === max);
    g.accusedId = max > 0 && top.length === 1 ? top[0] : null;
    g.caught = g.accusedId !== null && g.spyIds.includes(g.accusedId);
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
    if (!g.caught || g.accusedId !== playerId) throw new GameError('الجاسوس اللي اتمسك بس اللي بيخمّن');
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

  /**
   * Base points, then x difficulty multiplier rounded up to 10:
   *  - a spy who was not caught: 400 (every spy the votes did not catch, even when another spy was)
   *  - the caught spy: 300 if they guess the place, otherwise 0
   *  - a spy is caught: detectives who voted for them 200, other detectives 100
   *    (if the caught spy then guesses the place, the ones who voted for them get 100 instead of 200)
   *  - nobody is caught: detectives who voted for any spy 100, the rest 0
   */
  private finishRound(ctx: EngineCtx, outcome: SpyOutcome) {
    const g = this.g;
    ctx.clearTimer();
    g.outcome = outcome;
    g.phase = 'result';
    g.endsAt = g.round < g.totalRounds ? Date.now() + RESULT_SECONDS * 1000 : null;
    if (g.endsAt) ctx.schedule(RESULT_SECONDS, () => { try { this.nextRound(ctx); } catch { /* the host decides */ } });
    const caught = g.caught ? g.accusedId : null;
    const pts: Record<string, number> = {};
    g.participants.forEach((id) => {
      const votedFor = g.votes[id];
      let base: number;
      if (g.spyIds.includes(id)) {
        base = id === caught ? (outcome === 'spy-guessed' ? 300 : 0) : 400;
      } else if (outcome === 'spy-escaped') {
        base = votedFor && g.spyIds.includes(votedFor) ? 100 : 0;
      } else if (outcome === 'spy-guessed') {
        base = 100;
      } else {
        const hit = caught ? votedFor === caught : !!votedFor && g.spyIds.includes(votedFor); // caught is null when every spy left
        base = hit ? 200 : 100;
      }
      pts[id] = base ? up10(base * g.multiplier) : 0;
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
