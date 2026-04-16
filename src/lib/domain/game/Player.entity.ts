import { Score } from "./Score.valueObject";

export class Player {
    constructor(
        public readonly id: string,
        public readonly name: string,
        private _score: Score
    ) {}

    get score(): Score {
        return this._score;
    }

    public updateScore(newScore: Score): void {
        this._score = newScore;
    }
}