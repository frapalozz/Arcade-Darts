export class Score {
    private constructor(private readonly value: number) {}

    static create(initial: number): Score {
        if (initial < 0) throw new Error('Score must be positive');
        return new Score(initial);
    }

    public subtract(points: number): Score {
        const newValue = this.value - points;
        if (newValue < 0) throw new Error('Cannot go below zero');
        return new Score(newValue);
    }

    public isZero(): boolean {
        return this.value === 0;
    }

    public getValue(): number {
        return this.value;
    }
}