import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { IdeasService } from './ideas.service';
import { RoomsService } from './rooms.service';
import { GameError, Room } from './rooms.types';

type Ack = { ok: true; [k: string]: unknown } | { ok: false; error: string };

@WebSocketGateway({ cors: { origin: true } })
export class RoomsGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly rooms: RoomsService, private readonly ideas: IdeasService) {}

  afterInit() {
    this.rooms.setListener((room, only) => this.broadcast(room, only));
    this.rooms.setLobbyListener((list) => this.server.to('lobby').emit('lobby:update', list));
    this.rooms.setPushListener((room, ids, event, data) => {
      room.players.forEach((p) => { if (ids.includes(p.id)) p.socketIds.forEach((sid) => this.server.to(sid).emit(event, data)); });
    });
    // chat is not part of room:state: each new message is pushed on its own
    this.rooms.setChatListener((room, msg) => {
      room.players.forEach((p) => p.socketIds.forEach((sid) => this.server.to(sid).emit('chat:new', msg)));
    });
  }

  /** The last messages, sent once when a socket enters a room (join, create, reconnect). */
  private sendHistory(client: Socket, room: Room) {
    client.emit('chat:history', room.chat);
  }

  private broadcast(room: Room, only?: string[]) {
    room.players.forEach((p) => {
      if (p.socketIds.size === 0 || (only && !only.includes(p.id))) return;
      const view = this.rooms.viewFor(room, p.id);
      p.socketIds.forEach((sid) => this.server.to(sid).emit('room:state', view));
    });
  }

  private run(client: Socket, fn: (playerId: string) => Record<string, unknown> | void): Ack {
    try {
      const playerId: string | undefined = client.data.playerId;
      if (!playerId) throw new GameError('عرّفنا بنفسك الأول');
      return { ok: true, ...(fn(playerId) || {}) };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      console.error(e);
      return { ok: false, error: 'حصلت مشكلة، جرّب تاني' };
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.playerId) this.rooms.detachSocket(client.data.playerId, client.id);
  }

  @SubscribeMessage('hello')
  hello(@ConnectedSocket() client: Socket, @MessageBody() body: any): Ack {
    try {
      const id = String(body?.playerId ?? '');
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) throw new GameError('هوية غير صالحة');
      const { name, avatar } = this.rooms.cleanProfile(body?.name, body?.avatar);
      client.data.playerId = id;
      client.data.name = name;
      client.data.avatar = avatar;
      const room = this.rooms.attachSocket(id, client.id, name, avatar);
      if (room) this.sendHistory(client, room);
      return { ok: true, roomCode: room?.code ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof GameError ? e.message : 'حصلت مشكلة' };
    }
  }

  @SubscribeMessage('room:create')
  create(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => {
      const room = this.rooms.createRoom(id, c.data.name, c.data.avatar, c.id, b?.game);
      this.sendHistory(c, room);
      return { code: room.code };
    });
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => {
      const room = this.rooms.joinRoom(b?.code, id, c.data.name, c.data.avatar, c.id);
      this.sendHistory(c, room);
      return { code: room.code };
    });
  }

  // The home screen asks for the list once (this also subscribes it to pushes) and unsubscribes when it closes.
  @SubscribeMessage('lobby:list')
  lobbyList(@ConnectedSocket() c: Socket): Ack {
    c.join('lobby');
    return { ok: true, rooms: this.rooms.lobbyList() };
  }

  @SubscribeMessage('lobby:leave')
  lobbyLeave(@ConnectedSocket() c: Socket): Ack {
    c.leave('lobby');
    return { ok: true };
  }

  @SubscribeMessage('lobby:quick')
  quick(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => {
      const { room, created } = this.rooms.quickPlay(id, c.data.name, c.data.avatar, c.id);
      this.sendHistory(c, room);
      return { code: room.code, created };
    });
  }

  // Home: votes for the upcoming game ideas (one per player per idea, kept in server memory)
  @SubscribeMessage('ideas:list')
  ideasList(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.ideas.state(id));
  }

  @SubscribeMessage('ideas:vote')
  ideasVote(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.ideas.vote(id, b?.idea, b?.on));
  }

  @SubscribeMessage('room:privacy')
  privacy(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.setPrivacy(id, b?.privacy));
  }

  @SubscribeMessage('room:lock')
  lock(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.setLocked(id, b?.locked));
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.leave(id));
  }

  @SubscribeMessage('room:kick')
  kick(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => {
      const sockets = this.rooms.kick(id, b?.playerId);
      sockets.forEach((sid) => this.server.to(sid).emit('room:kicked'));
    });
  }

  @SubscribeMessage('room:makeHost')
  makeHost(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.makeHost(id, b?.playerId));
  }

  @SubscribeMessage('room:ready')
  ready(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.setReady(id, !!b?.ready));
  }

  @SubscribeMessage('room:chat')
  chat(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.chat(id, b?.text));
  }

  @SubscribeMessage('room:settings')
  settings(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.updateSettings(id, b ?? {}));
  }

  @SubscribeMessage('room:difficulty')
  difficulty(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.setDifficulty(id, b?.level));
  }

  @SubscribeMessage('room:rename')
  rename(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.renameRoom(id, b?.name));
  }

  @SubscribeMessage('room:selectGame')
  selectGame(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.selectGame(id, b?.game));
  }

  @SubscribeMessage('game:start')
  start(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.startGame(id));
  }

  @SubscribeMessage('game:again')
  again(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.again(id));
  }

  // حزّورة and شبكة الكلمات: one generic action event ({ game, action, payload }); the engine validates everything.
  @SubscribeMessage('game:act')
  act(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    const game = String(b?.game ?? '');
    if (!['quiz', 'words', 'auction', 'draw'].includes(game)) return this.run(c, () => { throw new GameError('مش وقته دلوقتي'); });
    return this.run(c, (id) => this.rooms.gameAction(id, game, String(b?.action ?? ''), b?.payload));
  }

  // Spy actions: the service delegates them to the room's active engine.
  @SubscribeMessage('spy:nextTurn')
  nextTurn(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'nextTurn'));
  }

  @SubscribeMessage('spy:readyToVote')
  readyToVote(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'readyToVote', { ready: !!b?.ready }));
  }

  @SubscribeMessage('spy:startVote')
  startVote(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'startVote'));
  }

  @SubscribeMessage('spy:vote')
  vote(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'vote', { targetId: b?.targetId }));
  }

  @SubscribeMessage('spy:guess')
  guess(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'spy', 'guess', { place: b?.place }));
  }

  // فين دي؟ (map pin game): the pin stays private on the server until the reveal.
  @SubscribeMessage('map:pin')
  mapPin(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'map', 'pin', { lat: b?.lat, lon: b?.lon }));
  }

  @SubscribeMessage('map:lock')
  mapLock(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'map', 'lock'));
  }

  @SubscribeMessage('map:unlock')
  mapUnlock(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'map', 'unlock'));
  }

  @SubscribeMessage('map:hint')
  mapHint(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'map', 'hint'));
  }

  // الموجة (wave): the target, solo needles and the team needle stay on the server until they may be shown.
  @SubscribeMessage('wave:redraw')
  waveRedraw(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'wave', 'redraw'));
  }

  @SubscribeMessage('wave:clue')
  waveClue(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'wave', 'clue', { text: b?.text, voice: !!b?.voice }));
  }

  @SubscribeMessage('wave:needle')
  waveNeedle(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'wave', 'needle', { angle: b?.angle }));
  }

  @SubscribeMessage('wave:lock')
  waveLock(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'wave', 'lock', { angle: b?.angle }));
  }

  @SubscribeMessage('wave:unlock')
  waveUnlock(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'wave', 'unlock'));
  }

  @SubscribeMessage('wave:call')
  waveCall(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'wave', 'call', { side: b?.side }));
  }

  @SubscribeMessage('wave:teamChat')
  waveTeamChat(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, 'wave', 'teamChat', { text: b?.text }));
  }

  @SubscribeMessage('room:teams')
  teams(@ConnectedSocket() c: Socket, @MessageBody() b: any): Ack {
    return this.run(c, (id) => this.rooms.teamsAction(id, b?.op, b?.playerId));
  }

  @SubscribeMessage('game:next')
  next(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.gameAction(id, null, 'next'));
  }

  @SubscribeMessage('game:backToRoom')
  back(@ConnectedSocket() c: Socket): Ack {
    return this.run(c, (id) => this.rooms.backToRoom(id));
  }
}
