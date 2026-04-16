import { DomainEvent } from "./DomainEvent";

export abstract class AggregateRoot {
    private _events: DomainEvent[] = [];

    protected addEvent(event: DomainEvent): void {
        this._events.push(event);
    }

    public pullEvents(): DomainEvent[] {
        const events = [...this._events];
        this._events = [];
        return events;
    }
}