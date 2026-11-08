import { Injectable } from '@nestjs/common';
import { GameError } from './rooms.types';

/** The "بنحضّر ٧ كمان" ideas people can vote for on Home. The texts live in the client; the server only knows the ids. */
export const IDEA_IDS = ['categories', 'mafia', 'taboo', 'bluff', 'whoami', 'twotruths', 'telephone'] as const;

/**
 * Votes for upcoming game ideas. In memory only (gone on a restart, like rooms): one vote per playerId per idea,
 * a second tap takes it back. The set per idea makes a repeat vote from the same player a no-op.
 */
@Injectable()
export class IdeasService {
  private votes = new Map<string, Set<string>>(IDEA_IDS.map((id) => [id, new Set<string>()]));

  /** Vote counts for everyone, and the ideas this player voted for. */
  state(playerId: string) {
    const counts: Record<string, number> = {};
    const mine: string[] = [];
    this.votes.forEach((who, id) => {
      counts[id] = who.size;
      if (who.has(playerId)) mine.push(id);
    });
    return { counts, mine };
  }

  vote(playerId: string, idea: unknown, on: unknown) {
    const who = this.votes.get(String(idea ?? ''));
    if (!who) throw new GameError('الفكرة دي مش موجودة');
    if (on === false) who.delete(playerId);
    else who.add(playerId);
    return this.state(playerId);
  }
}
