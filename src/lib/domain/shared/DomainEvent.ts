export interface DomainEvent {
    aggregateId: string;
    occurredAt: Date;
    eventType: string;
    data: unknown;
}