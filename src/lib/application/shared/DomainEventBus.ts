// lib/application/shared/DomainEventBus.ts
import { DomainEvent } from '../../domain/shared/DomainEvent';

export interface DomainEventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(eventType: string, handler: (event: DomainEvent) => void): void;
}