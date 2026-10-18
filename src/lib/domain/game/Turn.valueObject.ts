export enum Multiplier {
    SINGLE = 1,
    DOUBLE = 2,
    TRIPLE = 3,
    BULLSEYE = 25,
    DOUBLE_BULLSEYE = 50
}

export interface Throw {
    sector: number | null; // 1-20, null for bull / bullseye / miss
    multiplier: Multiplier | null;
    points: number;
    isMiss: boolean;
}

export const MIN_SECTOR = 1;
export const MAX_SECTOR = 20;

export const isBullMultiplier = (m: Multiplier | null): boolean =>
    m === Multiplier.BULLSEYE || m === Multiplier.DOUBLE_BULLSEYE;

/** Un tiro "double" valido per chiudere: doppio normale o bullseye (50). */
export const isDoubleMultiplier = (m: Multiplier | null): boolean =>
    m === Multiplier.DOUBLE || m === Multiplier.DOUBLE_BULLSEYE;

export const isValidMultiplier = (m: unknown): m is Multiplier =>
    m === Multiplier.SINGLE ||
    m === Multiplier.DOUBLE ||
    m === Multiplier.TRIPLE ||
    m === Multiplier.BULLSEYE ||
    m === Multiplier.DOUBLE_BULLSEYE;

export class Turn {
    private throws: Throw[] = [];

    constructor(private maxThrows: number = 3) {}

    /** Ricostruisce un turno da tiri già calcolati (snapshot / clone). */
    static fromThrows(throws: readonly Throw[], maxThrows: number = 3): Turn {
        const turn = new Turn(maxThrows);
        turn.throws = throws.slice(0, maxThrows).map((t) => ({ ...t }));
        return turn;
    }

    public addThrow(sector: number | null, multiplier: Multiplier): Throw | null {
        if (this.throws.length >= this.maxThrows) return null;
        if (!isValidMultiplier(multiplier)) throw new Error('Invalid multiplier');

        let points: number;
        let storedSector: number | null = sector;
        if (isBullMultiplier(multiplier)) {
            points = multiplier; // 25 oppure 50
            storedSector = null;
        } else {
            if (!Number.isInteger(sector) || sector! < MIN_SECTOR || sector! > MAX_SECTOR) {
                throw new Error('Invalid sector');
            }
            points = sector! * multiplier;
        }
        const throwRecord: Throw = { sector: storedSector, multiplier, points, isMiss: false };
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
        return this.throws.map((t) => ({ ...t }));
    }

    public totalPoints(): number {
        return this.throws.reduce((sum, t) => sum + t.points, 0);
    }

    public isComplete(): boolean {
        return this.throws.length >= this.maxThrows;
    }

    public reset(): void {
        this.throws = [];
    }
}
