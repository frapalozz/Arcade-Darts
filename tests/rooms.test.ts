import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeRooms, toPresenceGameInfo, PresenceGameInfo, RawRoom } from '../src/lib/application/rooms/RoomSummary';
import { Game } from '../src/lib/domain/game/Game.aggregate';
import { Multiplier as M } from '../src/lib/domain/game/Turn.valueObject';

const info = (over: Partial<PresenceGameInfo> = {}): PresenceGameInfo => ({
    v: 1, started: false, over: false, start: 501, turn: 0,
    players: [{ id: 'u1', name: 'Anna', score: 501 }],
    ...over,
});
const player = (clientId: string, game?: unknown, extra: Record<string, unknown> = {}) => ({
    clientId, data: { playerId: clientId, playerName: clientId, isSpectator: false, game, ...extra },
});
const room = (roomId: string, ...members: RawRoom['members']): RawRoom => ({ roomId, members });

test('partita non iniziata → in attesa, con i giocatori presenti', () => {
    const [r] = summarizeRooms([room('bar', player('u1', info()))]);
    assert.equal(r.roomId, 'bar');
    assert.equal(r.status, 'waiting');
    assert.deepEqual(r.players, [{ name: 'Anna', score: 501 }]);
    assert.equal(r.currentPlayerName, null);
    assert.equal(r.full, false);
});

test('partita iniziata → in corso, con punteggi e giocatore di turno', () => {
    const g = info({
        started: true, turn: 1, v: 5,
        players: [{ id: 'u1', name: 'Anna', score: 301 }, { id: 'u2', name: 'Luca', score: 250 }],
    });
    const [r] = summarizeRooms([room('bar', player('u1', g), player('u2', g))]);
    assert.equal(r.status, 'playing');
    assert.equal(r.currentPlayerName, 'Luca');
    assert.deepEqual(r.players.map((p) => p.score), [301, 250]);
});

test('partite finite e stanze con soli spettatori non compaiono', () => {
    const finished = summarizeRooms([room('x', player('u1', info({ over: true, started: true })))]);
    assert.equal(finished.length, 0);
    const onlyWatchers = summarizeRooms([room('y', player('s1', undefined, { isSpectator: true }))]);
    assert.equal(onlyWatchers.length, 0);
});

test('gli spettatori sono contati a parte (senza duplicati per lo stesso client)', () => {
    const [r] = summarizeRooms([
        room('bar', player('u1', info()), player('s1', undefined, { isSpectator: true }), player('s1', undefined, { isSpectator: true }), player('s2', undefined, { isSpectator: true })),
    ]);
    assert.equal(r.spectators, 2);
});

test('tra più giocatori vale il riepilogo con la versione più alta', () => {
    const old = info({ v: 2, started: false });
    const fresh = info({ v: 9, started: true, players: [{ id: 'u1', name: 'Anna', score: 441 }] });
    const [r] = summarizeRooms([room('bar', player('u1', old), player('u2', fresh))]);
    assert.equal(r.status, 'playing');
    assert.equal(r.players[0].score, 441);
});

test('"mine" riconosce chi ha già un posto nella partita; gli id non escono mai', () => {
    const g = info({ started: true, players: [{ id: 'abc-123', name: 'Anna', score: 400 }] });
    const rooms = [room('bar', player('abc-123', g))];
    assert.equal(summarizeRooms(rooms, 'abc-123')[0].mine, true);
    assert.equal(summarizeRooms(rooms, 'altro')[0].mine, false);
    assert.equal(summarizeRooms(rooms)[0].mine, false);
    assert.ok(!JSON.stringify(summarizeRooms(rooms, 'altro')).includes('abc-123'));
});

test('client senza riepilogo (versione vecchia / non ancora allineato) → in attesa con i nomi in presenza', () => {
    const [r] = summarizeRooms([room('bar', player('u1', undefined, { playerName: 'Gianni' }))], 'u1');
    assert.equal(r.status, 'waiting');
    assert.deepEqual(r.players, [{ name: 'Gianni', score: null }]);
    assert.equal(r.mine, true);
});

test('stanza piena (8 giocatori)', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `u${i}`, name: `P${i}`, score: 501 }));
    const [r] = summarizeRooms([room('bar', player('u0', info({ players })))]);
    assert.equal(r.full, true);
});

test('dati ostili o malformati in presenza vengono ignorati senza lanciare', () => {
    const rooms: RawRoom[] = [
        room('a', { clientId: 'u1', data: 'boh' }, { clientId: 'u2', data: null }),
        room('b', player('u1', { players: 'no' }), player('u2', { players: [{ id: 1, name: 2, score: 'x' }] })),
        room('c', player('u1', info({ players: [{ id: 'u1', name: '<img src=x onerror=1>'.repeat(5), score: 10 }] }))),
    ];
    const out = summarizeRooms(rooms);
    assert.equal(out.length, 3); // a e b: giocatori presenti ma senza riepilogo valido → in attesa
    assert.ok(out.find((r) => r.roomId === 'c')!.players[0].name.length <= 12);
});

test('ordine: le tue, poi quelle in attesa, poi in corso; a parità più giocatori', () => {
    const playing = info({ started: true });
    const two = info({ players: [{ id: 'u1', name: 'A', score: 501 }, { id: 'u2', name: 'B', score: 501 }] });
    const out = summarizeRooms(
        [room('zeta-corso', player('u1', playing)), room('beta-1', player('u1', info())), room('alfa-2', player('u1', two)), room('mia', player('me', info({ players: [{ id: 'me', name: 'Io', score: 501 }] })))],
        'me'
    );
    assert.deepEqual(out.map((r) => r.roomId), ['mia', 'alfa-2', 'beta-1', 'zeta-corso']);
});

test('toPresenceGameInfo riflette lo stato reale della partita', () => {
    let g = Game.start('room', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    let i = toPresenceGameInfo(g.snapshot);
    assert.equal(i.started, false);
    assert.equal(i.over, false);
    g = g.recordThrow('a', 20, M.TRIPLE, false);
    i = toPresenceGameInfo(g.snapshot);
    assert.equal(i.started, true);
    assert.equal(i.players[0].score, 441);
    assert.equal(i.turn, 0);
});
