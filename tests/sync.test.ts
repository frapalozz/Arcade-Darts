import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/lib/domain/game/Game.aggregate';
import { Multiplier as M } from '../src/lib/domain/game/Turn.valueObject';
import { GameSyncEngine, ChannelLike, ConnectionLike, ChannelMessage, PresenceMember, SyncStatus } from '../src/lib/infrastructure/sync/GameSyncEngine';
import { LocalGameStore } from '../src/lib/infrastructure/persistence/LocalGameStore';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FAST = { snapshotRetryMs: 25, snapshotAttempts: 2, spectatorRetryMs: 60, saveDebounceMs: 5, publishTimeoutMs: 200, outboxRetryMs: 20 };

/* ---------- mini broker che imita Ably: ordine totale, echo, presenza, offline ---------- */
class Broker {
    clients: FakeClient[] = [];
    seq = 0;
    deliver(from: FakeClient, name: string, data: unknown) {
        const msg: ChannelMessage = { name, data: JSON.parse(JSON.stringify(data)), clientId: from.id };
        for (const c of this.clients) if (c.connState === 'connected') setTimeout(() => c.receive(msg), 1);
    }
    presenceEvent(m: PresenceMember) {
        for (const c of this.clients) if (c.connState === 'connected') setTimeout(() => c.presenceListeners.forEach((l) => l(m)), 1);
    }
}
class FakeClient implements ChannelLike, ConnectionLike {
    connState = 'connected';
    chanState = 'attached';
    subs = new Map<string, Set<(m: ChannelMessage) => void>>();
    presenceListeners = new Set<(m: PresenceMember) => void>();
    chanListeners = new Set<(c: { resumed?: boolean }) => void>();
    connListeners = new Set<(c: { current: string }) => void>();
    presenceData: unknown;
    constructor(public id: string, public broker: Broker) { broker.clients.push(this); }
    get state() { return this.connState; }
    // ChannelLike
    subscribe(name: string, l: (m: ChannelMessage) => void) { (this.subs.get(name) ?? this.subs.set(name, new Set()).get(name)!).add(l); }
    unsubscribe(name: string, l: (m: ChannelMessage) => void) { this.subs.get(name)?.delete(l); }
    async publish(name: string, data: unknown) {
        if (this.connState !== 'connected') throw new Error('not connected');
        this.broker.deliver(this, name, data);
    }
    on(event: string | ((c: { current: string }) => void), l?: (c: { resumed?: boolean }) => void) {
        if (typeof event === 'function') this.connListeners.add(event);
        else if (event === 'attached') this.chanListeners.add(l!);
    }
    off(event: string | ((c: { current: string }) => void), l?: (c: { resumed?: boolean }) => void) {
        if (typeof event === 'function') this.connListeners.delete(event); else this.chanListeners.delete(l!);
    }
    presence = {
        enter: async (data?: unknown) => { this.presenceData = data; this.broker.presenceEvent({ clientId: this.id, action: 'enter', data }); },
        get: async () => this.broker.clients.filter((c) => c.connState === 'connected' && c.presenceData).map((c) => ({ clientId: c.id, data: c.presenceData })),
        subscribe: (l: (m: PresenceMember) => void) => { this.presenceListeners.add(l); },
        unsubscribe: (l: (m: PresenceMember) => void) => { this.presenceListeners.delete(l); },
    };
    connect() { this.goOnline(false); }
    receive(msg: ChannelMessage) { if (this.connState === 'connected') this.subs.get(msg.name)?.forEach((l) => l(msg)); }
    goOffline() { this.connState = 'disconnected'; this.connListeners.forEach((l) => l({ current: 'disconnected' })); }
    goOnline(resumed: boolean) {
        if (this.connState === 'connected') return;
        this.connState = 'connected';
        this.connListeners.forEach((l) => l({ current: 'connected' }));
        this.chanListeners.forEach((l) => l({ resumed }));
    }
}
class MemStore { m = new Map<string, string>(); getItem = (k: string) => this.m.get(k) ?? null; setItem = (k: string, v: string) => void this.m.set(k, v); removeItem = (k: string) => void this.m.delete(k); }

function peer(broker: Broker, id: string, opts: { spectator?: boolean; mem?: MemStore } = {}) {
    const client = new FakeClient(id, broker);
    const mem = opts.mem ?? new MemStore();
    const state: { game: Game | null; status: SyncStatus | null } = { game: null, status: null };
    const effects: unknown[] = [];
    const engine = new GameSyncEngine({
        roomId: 'room', playerId: id, playerName: id.toUpperCase(), isSpectator: !!opts.spectator,
        channel: Object.create(client, { state: { get: () => client.chanState } }) as ChannelLike, connection: client, store: new LocalGameStore('room', mem), timing: FAST,
        handlers: { onGame: (g) => (state.game = g), onPlayers: () => {}, onStatus: (s) => (state.status = s), onEffect: (e) => effects.push(e) },
    });
    return { client, engine, state, mem, effects };
}
const score = (g: Game | null, id: string) => g!.players.find((p) => p.id === id)!.score.getValue();

test('due giocatori: creazione, ingresso e tiri convergono', async () => {
    const b = new Broker();
    const a = peer(b, 'a'); a.engine.start(); await sleep(30);
    assert.ok(a.state.game); assert.equal(a.state.game!.players.length, 1);
    const p2 = peer(b, 'b'); p2.engine.start(); await sleep(120);
    assert.deepEqual(a.state.game!.players.map((p) => p.id), ['a', 'b']);
    assert.deepEqual(p2.state.game!.players.map((p) => p.id), ['a', 'b']);   // add-player applicato una sola volta
    a.engine.recordThrow(20, M.TRIPLE, false); await sleep(30);
    assert.equal(score(a.state.game, 'a'), 441); assert.equal(score(p2.state.game, 'a'), 441);
    assert.equal(a.state.status!.pending, 0);
});

test('offline: il tiro resta in coda, è salvato in locale e parte alla riconnessione', async () => {
    const b = new Broker();
    const a = peer(b, 'a'); a.engine.start(); await sleep(30);
    const p2 = peer(b, 'b'); p2.engine.start(); await sleep(120);
    a.engine.recordThrow(1, M.SINGLE, false); a.engine.recordThrow(1, M.SINGLE, false); a.engine.recordThrow(1, M.SINGLE, false);
    await sleep(40);
    assert.equal(p2.state.game!.currentPlayer.id, 'b');
    p2.client.goOffline(); await sleep(10);
    assert.equal(p2.state.status!.connection, 'offline');
    p2.engine.recordThrow(20, M.SINGLE, false); await sleep(30);
    assert.equal(p2.state.status!.pending, 1);
    assert.equal(score(a.state.game, 'b'), 501);          // gli altri non lo vedono ancora
    assert.ok(p2.mem.getItem('darts:v2:room:outbox'));     // ...ma è salvato in locale
    p2.client.goOnline(true); await sleep(80);
    assert.equal(p2.state.status!.pending, 0);
    assert.equal(score(a.state.game, 'b'), 481); assert.equal(score(p2.state.game, 'b'), 481);
    assert.equal(p2.mem.getItem('darts:v2:room:outbox'), null);
});

test('reload offline: la partita viene ripristinata subito dal salvataggio locale e la coda sopravvive', async () => {
    const b = new Broker();
    const a = peer(b, 'a'); a.engine.start(); await sleep(30);
    const p2 = peer(b, 'b'); p2.engine.start(); await sleep(120);
    a.engine.recordThrow(5, M.SINGLE, false); await sleep(40);
    a.engine.persistNow();
    // "ricarico la pagina" di A rimanendo offline
    a.engine.stop();
    const a2 = peer(b, 'a', { mem: a.mem }); a2.client.connState = 'disconnected'; a2.client.chanState = 'detached';
    a2.engine.start();
    assert.equal(score(a2.state.game, 'a'), 496);          // subito, senza rete
    assert.equal(a2.state.status!.connection, 'offline');
    a2.engine.recordThrow(5, M.SINGLE, false); await sleep(10);
    assert.equal(a2.state.status!.pending, 1);
    a2.engine.stop();
    const a3 = peer(b, 'a', { mem: a.mem }); a3.engine.start(); await sleep(60);   // di nuovo online
    assert.equal(a3.state.status!.pending, 0);
    assert.equal(score(p2.state.game, 'a'), 491); assert.equal(score(a3.state.game, 'a'), 491);
});

test('duplicati: la stessa azione re-inviata viene applicata una volta sola', async () => {
    const b = new Broker();
    const a = peer(b, 'a'); a.engine.start(); await sleep(30);
    const p2 = peer(b, 'b'); p2.engine.start(); await sleep(120);
    const msg = { id: 'dup-1', playerId: 'a', sector: 10, multiplier: M.SINGLE, isMiss: false };
    await a.client.publish('throw', msg); await a.client.publish('throw', msg); await sleep(30);
    assert.equal(score(a.state.game, 'a'), 491); assert.equal(score(p2.state.game, 'a'), 491);
});

test('resync: chi ha perso messaggi con la rete assente si riallinea allo snapshot dei peer', async () => {
    const b = new Broker();
    const a = peer(b, 'a'); a.engine.start(); await sleep(30);
    const p2 = peer(b, 'b'); p2.engine.start(); await sleep(120);
    p2.client.goOffline(); await sleep(10);
    a.engine.recordThrow(20, M.SINGLE, false); a.engine.recordThrow(20, M.SINGLE, false); await sleep(40);
    assert.equal(score(p2.state.game, 'a'), 501);
    p2.client.goOnline(false); await sleep(120);          // canale NON ripreso → resync
    assert.equal(score(p2.state.game, 'a'), 461);
    assert.equal(p2.state.status!.synced, true);
});

test('creazione simultanea: converge su una sola partita con entrambi i giocatori', async () => {
    const b = new Broker();
    const a = peer(b, 'a'); const c = peer(b, 'c');
    a.client.presenceData = undefined;
    a.engine.start(); c.engine.start(); await sleep(250);
    const ids = (g: Game | null) => g!.players.map((p) => p.id).sort();
    assert.deepEqual(ids(a.state.game), ['a', 'c']);
    assert.deepEqual(ids(c.state.game), ['a', 'c']);
});

test('spettatore riceve lo stato e non può tirare', async () => {
    const b = new Broker();
    const a = peer(b, 'a'); a.engine.start(); await sleep(30);
    const s = peer(b, 's', { spectator: true }); s.engine.start(); await sleep(120);
    assert.ok(s.state.game); assert.equal(s.state.game!.players.length, 1);
    s.engine.recordThrow(20, M.SINGLE, false); await sleep(30);
    assert.equal(score(a.state.game, 'a'), 501);
});

test('snapshot salvato corrotto o scaduto viene ignorato', async () => {
    const mem = new MemStore(); mem.setItem('darts:v2:room:game', '{not json');
    const b = new Broker(); const a = peer(b, 'a', { mem }); a.engine.start(); await sleep(30);
    assert.equal(a.state.game!.players.length, 1);
    const old = new MemStore();
    old.setItem('game_snapshot_room', JSON.stringify({ snapshot: Game.start('room', [{ id: 'x', name: 'X' }]).snapshot, timestamp: Date.now() - 3 * 3600_000 }));
    assert.equal(new LocalGameStore('room', old).loadGame(), null);
    // formato legacy ancora valido viene migrato
    old.setItem('game_snapshot_room', JSON.stringify({ snapshot: Game.start('room', [{ id: 'x', name: 'X' }]).snapshot, timestamp: Date.now() }));
    assert.ok(new LocalGameStore('room', old).loadGame());
});
