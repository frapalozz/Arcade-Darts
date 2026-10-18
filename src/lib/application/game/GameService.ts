// lib/application/game/GameService.ts
import { Game } from '../../domain/game/Game.aggregate';
import { Multiplier } from '../../domain/game/Turn.valueObject';
import { DomainEventBus } from '../shared/DomainEventBus';
import { GameStateDto } from './dto/GameStateDto';

export class GameService {
  constructor(private readonly eventBus: DomainEventBus) {}

  startNewGame(roomId: string, players: { id: string, name: string }[], startingScore: number = 501): Game {
    return Game.start(roomId, players, startingScore);
  }

  // Game è immutabile: ogni operazione restituisce una nuova istanza, che è quella da usare e da cui leggere gli eventi.
  recordThrow(game: Game, playerId: string, sector: number | null, multiplier: Multiplier): Game {
    const next = game.recordThrow(playerId, sector, multiplier);
    // Pubblica tutti gli eventi generati
    next.pullEvents().forEach(ev => this.eventBus.publish(ev));
    return next;
  }

  endTurn(game: Game): Game {
    const next = game.endTurn();
    next.pullEvents().forEach(ev => this.eventBus.publish(ev));
    return next;
  }

  getState(game: Game): GameStateDto {
    return game.getStateDto();
  }
}