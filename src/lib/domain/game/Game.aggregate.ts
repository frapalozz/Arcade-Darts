// lib/domain/game/Game.aggregate.ts
import { AggregateRoot } from '../shared/AggregateRoot';
import { Player } from './Player.entity';
import { Score } from './Score.valueObject';
import { Turn, Multiplier, Throw } from './Turn.valueObject';
import { ScoreRecordedEvent } from './events/ScoreRecorded.event';
import { TurnChangedEvent } from './events/TurnChanged.event';
import { GameWonEvent } from './events/GameWon.event';
import { GameStateDto } from '../../application/game/dto/GameStateDto';
import { randomInt } from 'crypto';

export interface GameSnapshot {
    id: string;
    players: { id: string; name: string; score: number }[];
    currentPlayerIndex: number;
    currentTurnThrows: Throw[];
    winnerId: string | null;
    startingScore: number;
}

export class Game extends AggregateRoot {
    private _currentPlayerIndex: number = 0;
    private _currentTurn: Turn = new Turn(3);
    private _winnerId: string | null = null;

    private constructor(
        public readonly id: string,
        private readonly players: Player[],
        private readonly startingScore: number
    ) {
        super();
        this._currentPlayerIndex = randomInt(0, players.length)
    }

    static start(roomId: string, playerNames: string[], startingScore: number = 501): Game {
        const players = playerNames.map((name, idx) => 
            new Player(`${roomId}-${idx}`, name, Score.create(startingScore))
        );
        return new Game(roomId, players, startingScore);
    }

    static fromState(snapshot: GameSnapshot): Game {
        const game = new Game(snapshot.id, [], snapshot.startingScore);
        // Ricostruisci giocatori
        snapshot.players.forEach(p => {
            const player = new Player(p.id, p.name, Score.create(p.score));
            game.players.push(player);
        });
        game._currentPlayerIndex = snapshot.currentPlayerIndex;
        game._currentTurn = new Turn(3);
        for (const thr of snapshot.currentTurnThrows) {
            if(thr.isMiss) {
                game._currentTurn.addMiss();
            } else {
                game._currentTurn.addThrow(thr.sector, thr.multiplier ? thr.multiplier : Multiplier.SINGLE);
            }
        }
            game._winnerId = snapshot.winnerId;
        return game;
    }

    get snapshot(): GameSnapshot {
        return {
            id: this.id,
            players: this.players.map(p => ({ id: p.id, name: p.name, score: p.score.getValue() })),
            currentPlayerIndex: this._currentPlayerIndex,
            currentTurnThrows: this._currentTurn.getThrows(),
            winnerId: this._winnerId,
            startingScore: this.startingScore
        };
    }

    get currentPlayer(): Player {
        return this.players[this._currentPlayerIndex];
    }

    get winner(): Player | null {
        return this._winnerId ? this.players.find(p => p.id === this._winnerId) || null : null;
    }

    get currentTurnThrows(): Throw[] {
        return this._currentTurn.getThrows();
    }

    // Registra un tiro (fa parte del turno corrente)
    recordThrow(playerId: string, sector: number | null, multiplier: Multiplier | null, isMiss: boolean = false): Game {
        if (this._winnerId) throw new Error('Game already finished');
        if (this.currentPlayer.id !== playerId) throw new Error('Not your turn');

        const newGame = this.clone();

        const player = newGame.currentPlayer;
        const turnPointsBefore = newGame._currentTurn.totalPoints();

        let throwResult: Throw | null = null;  
        
        if (isMiss) {
            throwResult = newGame._currentTurn.addMiss();
        } else {
            if (sector === null || multiplier === null) throw new Error('Invalid throw parameters');
            throwResult = newGame._currentTurn.addThrow(sector, multiplier);
        }
        if (!throwResult) throw new Error('Turn already complete, call endTurn first');

        const turnPointsAfter = newGame._currentTurn.totalPoints();
        const addedPoints = turnPointsAfter - turnPointsBefore; // sarà 0 per miss

        // Se è un miss, non modifica il punteggio
        if (!isMiss && addedPoints > 0) {
            let newScoreValue = player.score.getValue() - addedPoints;

            // BUST: se negativo o uguale a 1, annulla tutto il turno
            if (newScoreValue < 0 || newScoreValue === 1) {
                newGame._currentTurn.reset();
                newGame.endTurn(); // fine turno senza modifica punteggio
                return newGame;
            }

            const newScore = Score.create(newScoreValue);
            player.updateScore(newScore);

            newGame.addEvent(new ScoreRecordedEvent(newGame.id, playerId, sector!, multiplier!, addedPoints, newScoreValue));

            if (newScore.isZero()) {
                newGame._winnerId = player.id;
                newGame.addEvent(new GameWonEvent(newGame.id, player.id, player.name));
            } else if (newGame._currentTurn.isComplete()) {
                newGame.endTurn();
            }
        } else {
            // Miss: non cambia punteggio, ma registra evento (opzionale) e controlla fine turno
            newGame.addEvent(new ScoreRecordedEvent(newGame.id, playerId, null, null, 0, player.score.getValue()));
            if (newGame._currentTurn.isComplete()) {
                newGame.endTurn();
            }
        }

        return newGame;
    }

    // Forza la fine del turno (passa al prossimo giocatore)
    endTurn(): Game {
        const newGame = this.clone();
        if (newGame._winnerId) return newGame;
        const previousPlayerIndex = newGame._currentPlayerIndex;
        newGame._currentPlayerIndex = (newGame._currentPlayerIndex + 1) % newGame.players.length;
        newGame._currentTurn.reset();
        newGame.addEvent(new TurnChangedEvent(newGame.id, previousPlayerIndex, newGame._currentPlayerIndex));
        return newGame;
    }

    getStateDto(): GameStateDto {
        return {
            id: this.id,
            players: this.players.map(p => ({ id: p.id, name: p.name, score: p.score.getValue() })),
            currentPlayerId: this.currentPlayer.id,
            currentTurnThrows: this._currentTurn.getThrows(),
            winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
            startingScore: this.startingScore
        };
    }

    private clone(): Game {
        const game = new Game(this.id, [...this.players], this.startingScore);
        game._currentPlayerIndex = this._currentPlayerIndex;
        game._currentTurn = new Turn(3);
        for (const thr of this._currentTurn.getThrows()) {
            if(thr.isMiss) {
                game._currentTurn.addMiss();
            } else {
                game._currentTurn.addThrow(thr.sector, thr.multiplier ? thr.multiplier : Multiplier.SINGLE);
            }
        }
        game._winnerId = this._winnerId;
        return game;
    }
}