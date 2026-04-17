export enum Multiplier {
    SINGLE = 1,
    DOUBLE = 2,
    TRIPLE = 3,
    BULLSEYE = 25,
    DOUBLE_BULLSEYE = 50
}

export interface Throw {
    sector: number | null; // 1-20, null for bullseye
    multiplier: Multiplier | null;
    points: number;
    isMiss: boolean;
}

export class Turn {
    private throws: Throw[] = [];

    constructor(private maxThrows: number = 3) {}

    public addThrow(sector: number | null, multiplier: Multiplier): Throw | null {
        if (this.throws.length >= this.maxThrows) return null;
        let points = 0;
        if (sector === null || multiplier === Multiplier.BULLSEYE || multiplier === Multiplier.DOUBLE_BULLSEYE) {
            // Bullseye
            points = multiplier === Multiplier.DOUBLE_BULLSEYE ? 50 : 25;
        } else {
            points = sector * multiplier;
        }
        const throwRecord: Throw = { sector, multiplier, points, isMiss: false };
        this.throws.push(throwRecord);
        return throwRecord;
    }

    public addMiss(): Throw | null {
        if (this.throws.length >= this.maxThrows) return null;
        const throwRecord: Throw = { sector: null, multiplier: null, points: 0, isMiss: true };
        this.throws.push(throwRecord);
        return throwRecord;
    }

    public getThrows(): Throw[] {
        return [...this.throws];
    }

    public totalPoints(): number {
        return this.throws.reduce((sum, t) => sum + t.points, 0);
    }

    public isComplete(): boolean {
        return this.throws.length === this.maxThrows;
    }

    public reset(): void {
        this.throws = [];
    }
}