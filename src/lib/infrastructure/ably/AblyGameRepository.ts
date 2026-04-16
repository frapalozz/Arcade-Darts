// lib/infrastructure/ably/AblyGameRepository.ts
import { Realtime } from 'ably';
import { Game, GameSnapshot } from '../../domain/game/Game.aggregate';

export class AblyGameRepository {
  private kv: any; // KV namespace

  constructor(ably: Realtime, roomId: string) {
    // Inizializza KV per questa room (richiede Ably SDK con KV support)
    this.kv = ably.channels.get(`kv:game:${roomId}`);
  }

  async save(game: Game): Promise<void> {
    const snapshot = game.snapshot;
    await this.kv.set('snapshot', JSON.stringify(snapshot));
  }

  async findById(): Promise<Game | null> {
    const raw = await this.kv.get('snapshot');
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as GameSnapshot;
    return Game.fromState(snapshot);
  }
}