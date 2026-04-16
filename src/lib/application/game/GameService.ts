// lib/application/game/GameService.ts
import { Game } from '../../domain/game/Game.aggregate';
import { Multiplier } from '../../domain/game/Turn.valueObject';
import { DomainEventBus } from '../shared/DomainEventBus';
import { GameStateDto } from './dto/GameStateDto';

export class GameService {
  constructor(private readonly eventBus: DomainEventBus) {}

  startNewGame(roomId: string, playerNames: string[], startingScore: number = 501): Game {
    return Game.start(roomId, playerNames, startingScore);
  }

  recordThrow(game: Game, playerId: string, sector: number | null, multiplier: Multiplier): Game {
    game.recordThrow(playerId, sector, multiplier);
    // Pubblica tutti gli eventi generati
    game.pullEvents().forEach(ev => this.eventBus.publish(ev));
    return game;
  }

  endTurn(game: Game): Game {
    game.endTurn();
    game.pullEvents().forEach(ev => this.eventBus.publish(ev));
    return game;
  }

  getState(game: Game): GameStateDto {
    return game.getStateDto();
  }
}