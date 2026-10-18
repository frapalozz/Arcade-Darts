import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/lib/domain/game/Game.aggregate';
import { Multiplier as M } from '../src/lib/domain/game/Turn.valueObject';

const two = (score = 501, doubleOut = true) =>
    Game.start('r', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], score, doubleOut);
const score = (g: Game, id: string) => g.players.find((p) => p.id === id)!.score.getValue();

test('turno normale: 3 tiri poi passa al prossimo', () => {
    let g = two();
    g = g.recordThrow('a', 20, M.TRIPLE); // 60
    g = g.recordThrow('a', 20, M.SINGLE);
    g = g.recordThrow('a', null, null, true);
    assert.equal(score(g, 'a'), 421);
    assert.equal(g.currentPlayer.id, 'b');
    assert.equal(g.currentTurnThrows.length, 0);
});

test('bull senza settore vale 25/50', () => {
    let g = two();
    g = g.recordThrow('a', null, M.BULLSEYE);
    g = g.recordThrow('a', null, M.DOUBLE_BULLSEYE);
    assert.equal(score(g, 'a'), 501 - 75);
});

test('bust ripristina il punteggio di inizio turno (non solo ultimo tiro)', () => {
    let g = two(100);
    g = g.recordThrow('a', 20, M.TRIPLE); // 40
    g = g.recordThrow('a', 20, M.TRIPLE); // -20 => bust
    assert.equal(score(g, 'a'), 100);
    assert.equal(g.currentPlayer.id, 'b');
    assert.equal(g.lastBustPlayerId, 'a');
});

test('bust su 1 rimasto con double-out e ripristino dopo più tiri', () => {
    let g = two(60);
    g = g.recordThrow('a', 19, M.TRIPLE); // 57 -> 3
    g = g.recordThrow('a', 2, M.SINGLE); // 1 => bust
    assert.equal(score(g, 'a'), 60);
});

test('double-out: chiudere con single è bust, con double vince', () => {
    let g = two(40);
    const win = g.recordThrow('a', 20, M.DOUBLE); // 40 -> 0 con double: vince
    assert.equal(win.winner?.id, 'a');
    const g2 = two(20).recordThrow('a', 20, M.SINGLE); // 0 con single: bust
    assert.equal(g2.winner, null);
    assert.equal(score(g2, 'a'), 20);
    assert.equal(g2.currentPlayer.id, 'b');
});

test('bullseye (50) chiude con double-out', () => {
    const g = two(50).recordThrow('a', null, M.DOUBLE_BULLSEYE);
    assert.equal(g.winner?.id, 'a');
    const g2 = two(25).recordThrow('a', null, M.BULLSEYE);
    assert.equal(g2.winner, null); // 25 non è un double
});

test('senza double-out basta arrivare a 0 e 1 non è bust', () => {
    const g = two(20, false).recordThrow('a', 20, M.SINGLE);
    assert.equal(g.winner?.id, 'a');
    const g2 = two(20, false).recordThrow('a', 19, M.SINGLE);
    assert.equal(score(g2, 'a'), 1);
});

test('immutabilità: lo stato precedente non viene alterato', () => {
    const g0 = two();
    const g1 = g0.recordThrow('a', 20, M.SINGLE);
    assert.equal(score(g0, 'a'), 501);
    assert.equal(score(g1, 'a'), 481);
    assert.equal(g1.version, g0.version + 1);
});

test('validazione input di rete', () => {
    const g = two();
    assert.throws(() => g.recordThrow('a', 21, M.SINGLE));
    assert.throws(() => g.recordThrow('a', 0, M.SINGLE));
    assert.throws(() => g.recordThrow('a', 1.5, M.SINGLE));
    assert.throws(() => g.recordThrow('a', 5, 7 as unknown as M));
    assert.throws(() => g.recordThrow('b', 5, M.SINGLE)); // non è il suo turno
    assert.throws(() => g.recordThrow('a', null, null)); // né miss né tiro
    assert.equal(score(g, 'a'), 501);
});

test('snapshot round-trip conserva tutto (anche turno in corso e bust)', () => {
    let g = two(100);
    g = g.recordThrow('a', 10, M.SINGLE);
    const g2 = Game.fromState(JSON.parse(JSON.stringify(g.snapshot)));
    assert.deepEqual(g2.snapshot, g.snapshot);
    // il bust funziona anche dopo il ripristino
    const g3 = g2.recordThrow('a', 20, M.TRIPLE).recordThrow('a', 20, M.TRIPLE);
    assert.equal(score(g3, 'a'), 100);
});

test('snapshot legacy (senza campi nuovi) viene letto correttamente', () => {
    const legacy = {
        id: 'r', players: [{ id: 'a', name: 'A', score: 441 }, { id: 'b', name: 'B', score: 501 }],
        currentPlayerIndex: 0, winnerId: null, startingScore: 501,
        currentTurnThrows: [{ sector: 20, multiplier: M.TRIPLE, points: 60, isMiss: false }],
    };
    const g = Game.fromState(legacy);
    assert.equal(g.hasStarted(), true);
    const bust = g.recordThrow('a', 20, M.TRIPLE).recordThrow('a', 20, M.TRIPLE);
    // 441 -> 381 -> 321 non è bust, controllo di coerenza dei punteggi
    assert.equal(score(bust, 'a'), 321);
    const bust2 = Game.fromState({ ...legacy, players: [{ id: 'a', name: 'A', score: 45 }, { id: 'b', name: 'B', score: 501 }] })
        .recordThrow('a', 20, M.TRIPLE);
    assert.equal(score(bust2, 'a'), 105); // turnStart ricostruito = 45 + 60
});

test('addPlayer: niente duplicati, niente a partita iniziata, miss iniziale conta come iniziata', () => {
    let g = Game.start('r', [{ id: 'a', name: 'A' }]);
    g = g.addPlayer('B', 'b');
    assert.throws(() => g.addPlayer('B', 'b'));
    const started = g.recordThrow('a', null, null, true); // solo miss: punteggi invariati
    assert.throws(() => started.addPlayer('C', 'c'));
});

test('endTurn solo dal giocatore di turno e non dopo la vittoria', () => {
    const g = two();
    assert.throws(() => g.endTurn('b'));
    assert.equal(g.endTurn('a').currentPlayer.id, 'b');
    const won = two(2).recordThrow('a', 1, M.DOUBLE);
    assert.equal(won.endTurn('a'), won);
    assert.throws(() => won.recordThrow('a', 1, M.SINGLE));
});

test('turno vincente resta visibile (non viene azzerato dal ripristino)', () => {
    const won = two(2).recordThrow('a', 1, M.DOUBLE);
    const back = Game.fromState(won.snapshot);
    assert.equal(back.currentTurnThrows.length, 1);
    assert.equal(back.winner?.id, 'a');
});
