// lib/domain/game/Game.aggregate.ts
import { AggregateRoot } from '../shared/AggregateRoot';
import { Player } from './Player.entity';
import { Score } from './Score.valueObject';
import { Turn, Multiplier, Throw, isDoubleMultiplier } from './Turn.valueObject';
import { ScoreRecordedEvent } from './events/ScoreRecorded.event';
import { TurnChangedEvent } from './events/TurnChanged.event';
import { GameWonEvent } from './events/GameWon.event';
import { GameStateDto } from '../../application/game/dto/GameStateDto';

export interface GameSnapshot {
    id: string;
    players: { id: string; name: string; score: number }[];
    currentPlayerIndex: number;
    currentTurnThrows: Throw[];
    winnerId: string | null;
    startingScore: number;
    // Campi aggiunti: opzionali per restare compatibili con snapshot salvati in precedenza
    turnStartScore?: number;
    started?: boolean;
    version?: number;
    doubleOut?: boolean;
    lastBustPlayerId?: string | null;
}

export const MAX_PLAYERS = 8;

export class Game extends AggregateRoot {
    private _currentPlayerIndex: number = 0;
    private _currentTurn: Turn = new Turn(3);
    private _winnerId: string | null = null;
    /** Punteggio del giocatore di turno all'inizio del turno: serve a ripristinarlo in caso di bust. */
    private _turnStartScore: number;
    private _started = false;
    /** Incrementa a ogni modifica di stato: permette di capire quale snapshot è più recente. */
    private _version = 0;
    private _lastBustPlayerId: string | null = null;

    private constructor(
        public readonly id: string,
        public readonly players: Player[],
        private readonly startingScore: number,
        private readonly doubleOut: boolean
    ) {
        super();
        this._turnStartScore = startingScore;
    }

    /**
     * @param doubleOut se true (regola standard) si chiude solo con un double o bullseye;
     *                  se false basta arrivare esattamente a 0.
     */
    static start(
        roomId: string,
        players: { id: string; name: string }[],
        startingScore: number = 501,
        doubleOut: boolean = true
    ): Game {
        const gamePlayers = players.map((p) => new Player(p.id, p.name, Score.create(startingScore)));
        return new Game(roomId, gamePlayers, startingScore, doubleOut);
    }

    static fromState(snapshot: GameSnapshot): Game {
        const game = new Game(snapshot.id, [], snapshot.startingScore, snapshot.doubleOut ?? true);
        for (const p of snapshot.players) {
            game.players.push(new Player(p.id, p.name, Score.create(p.score)));
        }
        const idx = snapshot.currentPlayerIndex;
        game._currentPlayerIndex = idx >= 0 && idx < game.players.length ? idx : 0;
        game._currentTurn = Turn.fromThrows(snapshot.currentTurnThrows ?? []);
        game._winnerId = snapshot.winnerId ?? null;
        game._turnStartScore =
            snapshot.turnStartScore ??
            // Snapshot vecchi: nel turno corrente non ci sono bust, quindi il punteggio iniziale è ricostruibile.
            (game.players[game._currentPlayerIndex]?.score.getValue() ?? snapshot.startingScore) +
                game._currentTurn.totalPoints();
        game._started =
            snapshot.started ?? game.players.some((p) => p.score.getValue() !== snapshot.startingScore);
        game._version = snapshot.version ?? 0;
        game._lastBustPlayerId = snapshot.lastBustPlayerId ?? null;
        return game;
    }

    get snapshot(): GameSnapshot {
        return {
            id: this.id,
            players: this.players.map((p) => ({ id: p.id, name: p.name, score: p.score.getValue() })),
            currentPlayerIndex: this._currentPlayerIndex,
            currentTurnThrows: this._currentTurn.getThrows(),
            winnerId: this._winnerId,
            startingScore: this.startingScore,
            turnStartScore: this._turnStartScore,
            started: this._started,
            version: this._version,
            doubleOut: this.doubleOut,
            lastBustPlayerId: this._lastBustPlayerId,
        };
    }

    get currentPlayer(): Player {
        return this.players[this._currentPlayerIndex];
    }

    get winner(): Player | null {
        return this._winnerId ? this.players.find((p) => p.id === this._winnerId) || null : null;
    }

    get winnerId(): string | null {
        return this._winnerId;
    }

    get currentTurnThrows(): Throw[] {
        return this._currentTurn.getThrows();
    }

    get version(): number {
        return this._version;
    }

    get lastBustPlayerId(): string | null {
        return this._lastBustPlayerId;
    }

    hasPlayer(playerId: string): boolean {
        return this.players.some((p) => p.id === playerId);
    }

    // Registra un tiro (fa parte del turno corrente)
    recordThrow(playerId: string, sector: number | null, multiplier: Multiplier | null, isMiss: boolean = false): Game {
        if (this._winnerId) throw new Error('Game already finished');
        if (this.currentPlayer.id !== playerId) throw new Error('Not your turn');

        const newGame = this.clone();
        newGame._version++;
        newGame._started = true;
        newGame._lastBustPlayerId = null;
        const player = newGame.currentPlayer;

        let throwResult: Throw | null;
        if (isMiss) {
            throwResult = newGame._currentTurn.addMiss();
        } else {
            if (multiplier === null) throw new Error('Invalid throw parameters');
            throwResult = newGame._currentTurn.addThrow(sector, multiplier); // valida settore e moltiplicatore
        }
        if (!throwResult) throw new Error('Turn already complete, call endTurn first');

        if (throwResult.isMiss) {
            newGame.addEvent(new ScoreRecordedEvent(newGame.id, playerId, null, null, 0, player.score.getValue()));
            if (newGame._currentTurn.isComplete()) newGame.advanceTurn();
            return newGame;
        }

        const remaining = player.score.getValue() - throwResult.points;
        const isBust =
            remaining < 0 ||
            (newGame.doubleOut && (remaining === 1 || (remaining === 0 && !isDoubleMultiplier(throwResult.multiplier))));

        if (isBust) {
            // Il turno viene annullato: il punteggio torna a quello di inizio turno.
            player.updateScore(Score.create(newGame._turnStartScore));
            newGame._lastBustPlayerId = player.id;
            newGame.advanceTurn();
            return newGame;
        }

        player.updateScore(Score.create(remaining));
        newGame.addEvent(
            new ScoreRecordedEvent(newGame.id, playerId, throwResult.sector, throwResult.multiplier, throwResult.points, remaining)
        );

        if (remaining === 0) {
            newGame._winnerId = player.id;
            newGame.addEvent(new GameWonEvent(newGame.id, player.id, player.name));
        } else if (newGame._currentTurn.isComplete()) {
            newGame.advanceTurn();
        }
        return newGame;
    }

    // Termina il turno del giocatore corrente (passa al prossimo)
    endTurn(playerId?: string): Game {
        if (this._winnerId) return this;
        if (playerId !== undefined && this.currentPlayer.id !== playerId) throw new Error('Not your turn');
        const newGame = this.clone();
        newGame._version++;
        newGame._lastBustPlayerId = null;
        newGame.advanceTurn();
        return newGame;
    }

    getStateDto(): GameStateDto {
        return {
            id: this.id,
            players: this.players.map((p) => ({ id: p.id, name: p.name, score: p.score.getValue() })),
            currentPlayerId: this.currentPlayer.id,
            currentTurnThrows: this._currentTurn.getThrows(),
            winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
            startingScore: this.startingScore,
        };
    }

    addPlayer(name: string, id: string): Game {
        if (this._winnerId) throw new Error('Game already finished');
        if (this.hasStarted()) throw new Error('Game already started, cannot add players');
        if (this.players.length >= MAX_PLAYERS) throw new Error('Game is full');
        if (!id) throw new Error('Missing player id');
        if (this.hasPlayer(id)) throw new Error('Player already in game');

        const newGame = this.clone();
        newGame._version++;
        newGame.players.push(new Player(id, name, Score.create(this.startingScore)));
        // Se era l'unico giocatore il turno non è ancora iniziato: lo score di inizio turno resta valido.
        return newGame;
    }

    // Verifica se è stato già effettuato almeno un tiro
    hasStarted(): boolean {
        return this._started;
    }

    /** Passa il turno al giocatore successivo (muta l'istanza: usare solo su cloni). */
    private advanceTurn(): void {
        const previous = this._currentPlayerIndex;
        this._currentPlayerIndex = (previous + 1) % this.players.length;
        this._currentTurn.reset();
        this._turnStartScore = this.currentPlayer.score.getValue();
        this.addEvent(new TurnChangedEvent(this.id, previous, this._currentPlayerIndex));
    }

    private clone(): Game {
        // I Player sono mutabili (updateScore): vanno copiati, altrimenti si altera anche lo stato precedente.
        const players = this.players.map((p) => new Player(p.id, p.name, p.score));
        const game = new Game(this.id, players, this.startingScore, this.doubleOut);
        game._currentPlayerIndex = this._currentPlayerIndex;
        game._currentTurn = Turn.fromThrows(this._currentTurn.getThrows());
        game._winnerId = this._winnerId;
        game._turnStartScore = this._turnStartScore;
        game._started = this._started;
        game._version = this._version;
        game._lastBustPlayerId = this._lastBustPlayerId;
        return game;
    }
}
