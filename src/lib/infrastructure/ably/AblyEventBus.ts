// lib/infrastructure/ably/AblyEventBus.ts
import { Realtime } from 'ably';
import { DomainEvent } from '../../domain/shared/DomainEvent';
import { DomainEventBus } from '../../application/shared/DomainEventBus';

export class AblyEventBus implements DomainEventBus {
  private channel: any;

  constructor(private ably: Realtime, roomId: string) {
    this.channel = this.ably.channels.get(`game:${roomId}`);
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.channel.publish(event.eventType, {
      aggregateId: event.aggregateId,
      data: event,
      occurredAt: event.occurredAt
    });
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    this.channel.subscribe(eventType, (message: {data: {data: DomainEvent}}) => {
      handler(message.data.data);
    });
  }
}