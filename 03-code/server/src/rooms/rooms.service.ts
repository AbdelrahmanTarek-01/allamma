import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { EngineCtx } from '../games/game-engine';
import { DEFAULT_GAME, GAME_DEFS } from '../games/registry';
import { AVATARS, GameError, Player, Room } from './rooms.types';

const MAX_PLAYERS = 10;
const MAX_ROOM_NAME = 24;
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Room concerns only: players, host, chat, settings, lounge scores and lifecycle.
 * Everything game-specific is delegated to the room's active GameEngine.
 */
@Injectable()
export class RoomsService implements OnModuleDestroy {
  private rooms = new Map<string, Room>();
  private playerRoom = new Map<string, string>();
  private onChange: (room: Room) => void = () => {};
  private sweeper = setInterval(() => this.sweep(), 60 * 1000);

  onModuleDestroy() {
    clearInterval(this.sweeper);
    this.rooms.forEach((r) => r.timer && clearTimeout(r.timer));
  }

  setListener(fn: (room: Room) => void) {
    this.onChange = fn;
  }

  getRoom(code: string) {
    return this.rooms.get(code);
  }

  roomOf(playerId: string) {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  // ---------- identity & connection ----------

  cleanProfile(name: unknown, avatar: unknown) {
    const n = String(name ?? '').trim().slice(0, 14);
    if (!n) throw new GameError('اكتب اسمك الأول');
    const a = AVATARS.includes(avatar as any) ? String(avatar) : 'c1';
    return { name: n, avatar: a };
  }

  attachSocket(playerId: string, socketId: string, name: string, avatar: string) {
    const room = this.roomOf(playerId);
    if (!room) return undefined;
    const p = room.players.get(playerId)!;
    p.socketIds.add(socketId);
    p.connected = true;
    p.name = name;
    p.avatar = avatar;
    room.emptySince = null;
    this.emit(room);
    return room;
  }

  detachSocket(playerId: string, socketId: string) {
    const room = this.roomOf(playerId);
    if (!room) return;
    const p = room.players.get(playerId);
    if (!p) return;
    p.socketIds.delete(socketId);
    if (p.socketIds.size > 0) return;
    p.connected = false;
    if (room.hostId === playerId) this.passHost(room);
    if (![...room.players.values()].some((x) => x.connected)) room.emptySince = Date.now();
    room.engine?.onPresenceChange(this.ctx(room));
    this.emit(room);
  }

  // ---------- rooms ----------

  createRoom(playerId: string, name: string, avatar: string, socketId: string) {
    this.leave(playerId);
    let code = '';
    do code = Array.from({ length: 5 }, () => pick([...CODE_CHARS])).join('');
    while (this.rooms.has(code));
    const def = GAME_DEFS[DEFAULT_GAME];
    const room: Room = {
      code,
      name: this.cleanRoomName(`قعدة ${name}`),
      hostId: playerId,
      players: new Map(),
      chat: [],
      selectedGame: def.id,
      settings: { [def.id]: def.defaultSettings() },
      engine: null,
      settled: false,
      timer: null,
      emptySince: null
    };
    this.rooms.set(code, room);
    this.addPlayer(room, playerId, name, avatar, socketId);
    return room;
  }

  joinRoom(code: string, playerId: string, name: string, avatar: string, socketId: string) {
    const room = this.rooms.get(String(code ?? '').trim().toUpperCase());
    if (!room) throw new GameError('مفيش أوضة بالكود ده');
    if (room.players.has(playerId)) {
      this.attachSocket(playerId, socketId, name, avatar);
      return room;
    }
    if (room.players.size >= MAX_PLAYERS) throw new GameError('الأوضة مليانة');
    this.leave(playerId);
    this.addPlayer(room, playerId, name, avatar, socketId);
    return room;
  }

  private addPlayer(room: Room, id: string, name: string, avatar: string, socketId: string) {
    const p: Player = {
      id, name, avatar, ready: false, connected: true, lounge: 0, joinedAt: Date.now(),
      socketIds: new Set([socketId])
    };
    room.players.set(id, p);
    room.emptySince = null;
    this.playerRoom.set(id, room.code);
    this.emit(room);
  }

  leave(playerId: string) {
    const room = this.roomOf(playerId);
    if (!room) return;
    room.players.delete(playerId);
    this.playerRoom.delete(playerId);
    if (room.players.size === 0) {
      this.destroy(room);
      return;
    }
    if (room.hostId === playerId) this.passHost(room);
    room.engine?.onLeave(this.ctx(room), playerId);
    this.emit(room);
  }

  /** Host removes another player. Returns the kicked player's socket ids so the gateway can notify them. */
  kick(hostId: string, targetId: unknown): string[] {
    const room = this.mustHost(hostId);
    const t = this.mustOtherMember(room, hostId, targetId);
    const socketIds = [...t.socketIds];
    this.leave(t.id);
    return socketIds;
  }

  makeHost(hostId: string, targetId: unknown) {
    const room = this.mustHost(hostId);
    const t = this.mustOtherMember(room, hostId, targetId);
    if (!t.connected) throw new GameError('اللاعب ده النت فاصل عنده');
    room.hostId = t.id;
    this.emit(room);
  }

  setReady(playerId: string, ready: boolean) {
    const room = this.mustRoom(playerId);
    room.players.get(playerId)!.ready = !!ready;
    this.emit(room);
  }

  chat(playerId: string, text: unknown) {
    const room = this.mustRoom(playerId);
    const t = String(text ?? '').trim().slice(0, 200);
    if (!t) return;
    room.chat.push({ id: randomUUID(), from: playerId, text: t, at: Date.now() });
    if (room.chat.length > 40) room.chat.splice(0, room.chat.length - 40);
    this.emit(room);
  }

  renameRoom(playerId: string, name: unknown) {
    const room = this.mustHost(playerId);
    const n = this.cleanRoomName(name);
    if (!n) throw new GameError('اكتب اسم للقعدة');
    room.name = n;
    this.emit(room);
  }

  selectGame(playerId: string, game: unknown) {
    const room = this.mustHost(playerId);
    if (room.engine) throw new GameError('مينفعش تغيّر اللعبة واللعبة شغالة');
    const def = GAME_DEFS[String(game ?? '')];
    if (!def) throw new GameError('اللعبة دي جاية قريب');
    room.selectedGame = def.id;
    room.settings[def.id] ??= def.defaultSettings();
    this.emit(room);
  }

  /** Settings of the selected game. */
  updateSettings(playerId: string, patch: unknown) {
    const room = this.mustHost(playerId);
    if (room.engine) throw new GameError('مينفعش تغيّر الإعدادات واللعبة شغالة');
    const def = GAME_DEFS[room.selectedGame];
    room.settings[def.id] = def.parseSettings(room.settings[def.id], patch);
    this.emit(room);
  }

  // ---------- games ----------

  /** Start the selected game from the lounge. */
  startGame(playerId: string) {
    const room = this.mustHost(playerId);
    if (room.engine && !room.engine.isOver()) throw new GameError('اللعبة شغالة فعلاً');
    this.begin(room);
  }

  /** After the final screen: same game, same settings, fresh round scores. */
  again(playerId: string) {
    const room = this.mustHost(playerId);
    if (!room.engine || !room.engine.isOver()) throw new GameError('مش وقته دلوقتي');
    this.begin(room);
  }

  /** Back to the lounge to pick a game. Lounge scores stay. */
  backToRoom(playerId: string) {
    const room = this.mustHost(playerId);
    this.clearTimer(room);
    room.engine = null;
    room.settled = false;
    room.players.forEach((p) => (p.ready = false));
    this.emit(room);
  }

  /** A game action (`spy:vote` -> game 'spy', action 'vote'). Host-only actions are declared by the engine. */
  gameAction(playerId: string, gameId: string | null, action: string, payload?: unknown) {
    const room = this.mustRoom(playerId);
    const e = room.engine;
    if (!e || (gameId && e.id !== gameId)) throw new GameError('مش وقته دلوقتي');
    if (e.hostActions.includes(action)) this.mustHost(playerId);
    e.handle(this.ctx(room), playerId, action, payload);
  }

  private begin(room: Room) {
    const def = GAME_DEFS[room.selectedGame];
    const online = [...room.players.values()].filter((p) => p.connected);
    if (online.length < def.minPlayers) throw new GameError(`محتاجين ${def.minPlayers} لاعيبة على الأقل`);
    this.clearTimer(room);
    room.engine = def.create(room.settings[def.id]);
    room.settled = false;
    room.engine.start(this.ctx(room), online.map((p) => p.id));
  }

  /** Add the finished game's points to the lounge scores, once. */
  private settle(room: Room) {
    const e = room.engine;
    if (!e || room.settled || !e.isOver()) return;
    room.settled = true;
    room.players.forEach((p) => (p.lounge += e.scoreOf(p.id)));
  }

  // ---------- view ----------

  viewFor(room: Room, playerId: string) {
    const e = room.engine;
    const players = [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, ready: p.ready, connected: p.connected,
        score: e ? e.scoreOf(p.id) : 0, // this game's points
        lounge: p.lounge // lounge total across games
      }));
    return {
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      youId: playerId,
      players,
      chat: room.chat.slice(-30),
      selectedGame: room.selectedGame,
      settings: room.settings[room.selectedGame],
      game: e ? e.viewFor(playerId) : null,
      serverNow: Date.now()
    };
  }

  // ---------- helpers ----------

  private ctx(room: Room): EngineCtx {
    return {
      room,
      emit: () => this.emit(room),
      schedule: (seconds, fn) => this.schedule(room, seconds, fn),
      clearTimer: () => this.clearTimer(room)
    };
  }

  private cleanRoomName(name: unknown) {
    return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ROOM_NAME);
  }

  private mustRoom(playerId: string) {
    const room = this.roomOf(playerId);
    if (!room) throw new GameError('انت مش في أوضة');
    return room;
  }

  private mustHost(playerId: string) {
    const room = this.mustRoom(playerId);
    if (room.hostId !== playerId) throw new GameError('المضيف بس اللي يقدر يعمل كده');
    return room;
  }

  private mustOtherMember(room: Room, selfId: string, targetId: unknown) {
    const id = String(targetId ?? '');
    if (id === selfId) throw new GameError('مينفعش تعمل كده في نفسك');
    const t = room.players.get(id);
    if (!t) throw new GameError('اللاعب ده مش في الأوضة');
    return t;
  }

  private passHost(room: Room) {
    const next = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).find((p) => p.connected);
    if (next) room.hostId = next.id;
  }

  private schedule(room: Room, seconds: number, fn: () => void) {
    this.clearTimer(room);
    room.timer = setTimeout(() => {
      room.timer = null;
      fn();
    }, seconds * 1000);
  }

  private clearTimer(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  }

  private destroy(room: Room) {
    this.clearTimer(room);
    room.players.forEach((p) => this.playerRoom.delete(p.id));
    this.rooms.delete(room.code);
  }

  private sweep() {
    const now = Date.now();
    this.rooms.forEach((room) => {
      if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) this.destroy(room);
    });
  }

  private emit(room: Room) {
    if (!this.rooms.has(room.code)) return;
    this.settle(room);
    this.onChange(room);
  }

  stats() {
    return { rooms: this.rooms.size, players: this.playerRoom.size };
  }
}
