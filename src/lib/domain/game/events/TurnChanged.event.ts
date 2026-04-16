import { DomainEvent } from "../../shared/DomainEvent";

// lib/domain/game/events/TurnChanged.event.ts
export class TurnChangedEvent implements DomainEvent {
  public readonly eventType = 'TurnChanged';
  public readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly fromPlayerIndex: number,
    public readonly toPlayerIndex: number
  ) {}
    data: unknown;
}