import { DomainEvent } from "../../shared/DomainEvent";

// lib/domain/game/events/ScoreRecorded.event.ts
export class ScoreRecordedEvent implements DomainEvent {
  public readonly eventType = 'ScoreRecorded';
  public readonly occurredAt = new Date();

  constructor(
    public readonly aggregateId: string,
    public readonly playerId: string,
    public readonly sector: number | null,
    public readonly multiplier: number | null, // ora può essere null per miss
    public readonly points: number,
    public readonly newScore: number
  ) {}
  data: unknown;
}