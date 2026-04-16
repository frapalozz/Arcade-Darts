import { DomainEvent } from "../../shared/DomainEvent";

// lib/domain/game/events/GameWon.event.ts
export class GameWonEvent implements DomainEvent {
  public readonly eventType = 'GameWon';
  public readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly winnerId: string,
    public readonly winnerName: string
  ) {}
    data: unknown;
}