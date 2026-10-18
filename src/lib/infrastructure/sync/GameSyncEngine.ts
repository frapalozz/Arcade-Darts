import { Game, GameSnapshot } from '../../domain/game/Game.aggregate';
import { Multiplier } from '../../domain/game/Turn.valueObject';
import { LocalGameStore, OutboxItem } from '../persistence/LocalGameStore';
import { toPresenceGameInfo } from '../../application/rooms/RoomSummary';

/* ------------------------------------------------------------------ */
/* Interfacce minime di Ably (sottoinsieme usato): permettono i test   */
/* con un canale finto e tengono il motore indipendente dall'SDK.      */
/* ------------------------------------------------------------------ */
export interface ChannelMessage {
    name: string;
    data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    clientId?: string;
}
export interface PresenceMember {
    clientId: string;
    action?: string;
    data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface ChannelLike {
    readonly state: string;
    subscribe(name: string, listener: (m: ChannelMessage) => void): unknown;
    unsubscribe(name: string, listener: (m: ChannelMessage) => void): unknown;
    publish(name: string, data: unknown): Promise<unknown>;
    on(event: string, listener: (change: { resumed?: boolean }) => void): unknown;
    off(event: string, listener: (change: { resumed?: boolean }) => void): unknown;
    presence: {
        enter(data?: unknown): Promise<unknown>;
        /** Opzionale: se presente, il riepilogo della partita viene pubblicato nella presenza (lista partite). */
        update?(data?: unknown): Promise<unknown>;
        get(params?: { waitForSync?: boolean }): Promise<PresenceMember[]>;
        subscribe(listener: (m: PresenceMember) => void): unknown;
        unsubscribe(listener: (m: PresenceMember) => void): unknown;
    };
}
export interface ConnectionLike {
    readonly state: string;
    on(listener: (change: { current: string }) => void): unknown;
    off(listener: (change: { current: string }) => void): unknown;
    connect(): void;
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline';
export interface SyncStatus {
    connection: ConnectionStatus;
    /** Azioni create localmente e non ancora consegnate al canale. */
    pending: number;
    /** true quando lo stato locale è allineato con gli altri giocatori (o siamo noi l'host). */
    synced: boolean;
}
export type SyncEffect =
    | { type: 'throw'; multiplier: Multiplier | null; isMiss: boolean }
    | { type: 'game-created' };

export interface SyncHandlers {
    onGame(game: Game | null): void;
    onPlayers(players: { playerId: string; playerName: string; isSpectator: boolean }[]): void;
    onStatus(status: SyncStatus): void;
    onEffect?(effect: SyncEffect): void;
}

export interface SyncOptions {
    roomId: string;
    playerId: string;
    playerName: string;
    isSpectator: boolean;
    channel: ChannelLike;
    connection: ConnectionLike;
    store: LocalGameStore;
    handlers: SyncHandlers;
    startingScore?: number;
    newId?: () => string;
    /** Tempi in ms (sovrascrivibili nei test). */
    timing?: Partial<typeof DEFAULT_TIMING>;
}

export const DEFAULT_TIMING = {
    snapshotRetryMs: 1500,
    snapshotAttempts: 3,
    spectatorRetryMs: 5000,
    saveDebounceMs: 250,
    publishTimeoutMs: 8000,
    outboxRetryMs: 2000,
};

const PROCESSED_CAP = 100;
const BUFFER_CAP = 50;
const MAX_NAME = 12;

interface Buffered {
    name: string;
    data: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const swallow = (result: unknown): void => {
    const p = result as Promise<unknown> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => {});
};

const ACTIONS = new Set(['throw', 'end-turn', 'add-player']);

const sanitizeName = (n: unknown): string => {
    const s = typeof n === 'string' ? n.trim().slice(0, MAX_NAME) : '';
    return s || 'Player';
};

const defaultId = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Sincronizzazione della partita sopra un canale pub/sub ordinato (Ably).
 *
 * Modello: ogni azione (tiro, fine turno, ingresso) viene pubblicata sul canale e applicata
 * da TUTTI i client, compreso chi l'ha inviata, nello stesso ordine → stati identici.
 * Le azioni non valide vengono scartate allo stesso modo ovunque.
 *
 * Resilienza:
 *  - lo stato (e la coda di invio) è salvato in locale a ogni modifica;
 *  - le azioni create offline restano in coda e partono alla riconnessione;
 *  - ogni azione ha un id: i duplicati (re-invii dopo un timeout) vengono ignorati;
 *  - se si perde la continuità del canale si richiede uno snapshot ai peer (resync).
 */
export class GameSyncEngine {
    private readonly o: SyncOptions;
    private readonly t: typeof DEFAULT_TIMING;
    private readonly newId: () => string;

    private game: Game | null = null;
    private processed: string[] = [];
    private processedSet = new Set<string>();
    private buffer: Buffered[] = [];
    private outbox: OutboxItem[] = [];

    private synced = false;
    private forceAdopt = false;
    private firstAttach = true;
    private addRequested = false;
    private stopped = false;
    private flushing = false;
    private networkOnline = true;
    private presenceKey = '';

    private members = new Map<string, { playerId: string; playerName: string; isSpectator: boolean }>();
    private timers = new Set<ReturnType<typeof setTimeout>>();
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private requestToken = 0;

    constructor(options: SyncOptions) {
        this.o = options;
        this.t = { ...DEFAULT_TIMING, ...options.timing };
        this.newId = options.newId ?? defaultId;
    }

    /* ------------------------------ API pubblica ------------------------------ */

    start(): void {
        const { channel, connection, store } = this.o;

        // 1) Ripristino immediato da locale: la UI si popola anche offline / prima della rete.
        const saved = store.loadGame();
        if (saved) {
            try {
                this.game = Game.fromState(saved.snapshot);
                this.setProcessed(saved.ids);
                this.o.handlers.onGame(this.game);
            } catch {
                store.clearGame();
            }
        }
        this.outbox = store.loadOutbox();
        store.saveOutbox(this.outbox);

        // 2) Sottoscrizioni
        // In Ably v2 subscribe() restituisce una promise (attach implicito) che viene RIFIUTATA se il client
        // viene chiuso mentre si sta ancora connettendo (es. doppio mount di React StrictMode): va gestita.
        for (const name of ACTIONS) swallow(channel.subscribe(name, this.onActionMessage));
        swallow(channel.subscribe('snapshot-request', this.onSnapshotRequest));
        swallow(channel.subscribe('snapshot', this.onSnapshotMessage));
        swallow(channel.presence.subscribe(this.onPresence));
        channel.on('attached', this.onAttached);
        connection.on(this.onConnectionChange);

        channel.presence
            .enter({ playerId: this.o.playerId, playerName: this.o.playerName, isSpectator: this.o.isSpectator })
            .catch(() => {
                /* la presenza viene rientrata automaticamente alla riconnessione */
            });

        this.emitStatus();
        if (channel.state === 'attached') this.onAttached({ resumed: false });
        if (this.outbox.length) void this.flushOutbox();
    }

    stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.persistNow();
        const { channel, connection } = this.o;
        for (const name of ACTIONS) channel.unsubscribe(name, this.onActionMessage);
        channel.unsubscribe('snapshot-request', this.onSnapshotRequest);
        channel.unsubscribe('snapshot', this.onSnapshotMessage);
        channel.presence.unsubscribe(this.onPresence);
        channel.off('attached', this.onAttached);
        connection.off(this.onConnectionChange);
        this.timers.forEach(clearTimeout);
        this.timers.clear();
    }

    recordThrow(sector: number | null, multiplier: Multiplier | null, isMiss: boolean): void {
        const g = this.game;
        if (!g || g.winner || this.o.isSpectator || g.currentPlayer.id !== this.o.playerId) return;
        this.send('throw', { playerId: this.o.playerId, sector, multiplier, isMiss });
    }

    endTurn(): void {
        const g = this.game;
        if (!g || g.winner || this.o.isSpectator || g.currentPlayer.id !== this.o.playerId) return;
        this.send('end-turn', { playerId: this.o.playerId });
    }

    /** Il browser segnala che la rete è tornata/andata via (eventi online/offline). */
    setNetworkOnline(online: boolean): void {
        this.networkOnline = online;
        if (online && this.o.connection.state !== 'connected') this.o.connection.connect();
        this.emitStatus();
    }

    /** Forza il tentativo di riconnessione (es. la scheda torna visibile). */
    reconnectNow(): void {
        if (this.o.connection.state !== 'connected') this.o.connection.connect();
    }

    /** Scrive subito su disco (chiamato su pagehide / visibilitychange). */
    persistNow(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (this.game) this.o.store.saveGame(this.game.snapshot, this.processed);
    }

    /* ------------------------------ Eventi di rete ------------------------------ */

    private onAttached = (change: { resumed?: boolean }): void => {
        if (this.stopped) return;
        if (this.firstAttach) {
            this.firstAttach = false;
            void this.bootstrap();
        } else if (!change.resumed) {
            // Continuità persa (offline lungo): potremmo aver perso dei messaggi → riallinea.
            this.synced = false;
            this.forceAdopt = !!this.game;
            this.startSnapshotRequests();
        }
        void this.flushOutbox();
    };

    private onConnectionChange = (change: { current: string }): void => {
        if (this.stopped) return;
        this.emitStatus();
        if (change.current === 'connected') void this.flushOutbox();
    };

    private onPresence = (m: PresenceMember): void => {
        if (this.stopped) return;
        if (m.action === 'leave' || m.action === 'absent') {
            this.members.delete(m.clientId);
        } else if (m.data && typeof m.data === 'object') {
            this.members.set(m.clientId, {
                playerId: String(m.data.playerId ?? m.clientId),
                playerName: sanitizeName(m.data.playerName),
                isSpectator: !!m.data.isSpectator,
            });
            // Uno spettatore ancora senza partita riprova quando entra un giocatore
            if (!this.game && m.action === 'enter' && !m.data.isSpectator && m.clientId !== this.o.playerId) {
                this.startSnapshotRequests();
            }
        }
        this.emitPlayers();
    };

    private onActionMessage = (m: ChannelMessage): void => {
        if (this.stopped || !m.data || typeof m.data !== 'object') return;
        this.handleAction({ name: m.name, data: m.data }, false);
    };

    private onSnapshotRequest = (m: ChannelMessage): void => {
        const requester = m.data?.requesterId;
        // Risponde solo chi è allineato (un client appena ripristinato dal locale non è una fonte affidabile)
        if (!this.game || !this.synced || this.o.isSpectator || requester === this.o.playerId) return;
        this.publishSnapshot(requester);
    };

    private onSnapshotMessage = (m: ChannelMessage): void => {
        if (this.stopped || !m.data?.snapshot) return;
        const target = m.data.forClient;
        if (target && target !== this.o.playerId) return;
        this.adoptSnapshot(m.data.snapshot as GameSnapshot, m.data.ids, target === this.o.playerId);
    };

    /* ------------------------------ Avvio / allineamento ------------------------------ */

    private async bootstrap(): Promise<void> {
        let others: PresenceMember[] = [];
        try {
            const members = await this.o.channel.presence.get({ waitForSync: true });
            others = members.filter((p) => p.clientId !== this.o.playerId && !p.data?.isSpectator);
            for (const p of members) this.onPresence({ ...p, action: 'present' });
        } catch {
            /* se la presenza non è leggibile procediamo con la richiesta di snapshot */
            others = [{ clientId: '?' }];
        }
        if (this.stopped) return;
        if (others.length === 0) {
            this.assumeHost();
        } else {
            this.forceAdopt = !!this.game; // i peer connessi sono più autorevoli della cache locale
            this.startSnapshotRequests();
        }
    }

    /** Chiede lo stato ai peer con qualche tentativo; se nessuno risponde diventa host. */
    private startSnapshotRequests(): void {
        const token = ++this.requestToken;
        let attempt = 0;
        const tick = () => {
            if (this.stopped || token !== this.requestToken || this.synced) return;
            if (attempt >= this.t.snapshotAttempts) {
                if (this.o.isSpectator && !this.game) {
                    // Spettatore: aspetta che qualcuno crei la partita
                    attempt = 0;
                    this.later(tick, this.t.spectatorRetryMs);
                    this.requestSnapshot();
                } else {
                    this.assumeHost();
                }
                return;
            }
            attempt++;
            this.requestSnapshot();
            this.later(tick, this.t.snapshotRetryMs);
        };
        tick();
    }

    private requestSnapshot(): void {
        this.o.channel.publish('snapshot-request', { requesterId: this.o.playerId }).catch(() => {});
    }

    /** Nessun peer ha risposto: lo stato locale (ripristinato o nuovo) diventa quello di riferimento. */
    private assumeHost(): void {
        this.requestToken++;
        this.synced = true;
        this.forceAdopt = false;
        if (!this.game) {
            if (this.o.isSpectator) {
                this.emitStatus();
                return;
            }
            this.commit(
                Game.start(this.o.roomId, [{ id: this.o.playerId, name: this.o.playerName }], this.o.startingScore ?? 501)
            );
            this.o.handlers.onEffect?.({ type: 'game-created' });
        } else {
            this.maybeJoin(this.game);
        }
        this.publishSnapshot();
        this.emitStatus();
    }

    private adoptSnapshot(raw: GameSnapshot, ids: unknown, targeted: boolean): void {
        let incoming: Game;
        try {
            incoming = Game.fromState(raw);
        } catch {
            return;
        }
        const cur = this.game;
        const bothFresh = !!cur && !cur.hasStarted() && !incoming.hasStarted();
        const adopt =
            !cur ||
            this.forceAdopt ||
            incoming.version > cur.version ||
            // Due client hanno creato la stanza insieme: vince in modo deterministico l'id più basso
            (bothFresh &&
                incoming.version === cur!.version &&
                (incoming.players[0]?.id ?? '') < (cur!.players[0]?.id ?? ''));

        if (!adopt) {
            if (targeted) {
                this.synced = true;
                this.requestToken++;
                this.emitStatus();
            }
            return;
        }

        this.requestToken++;
        this.setProcessed(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
        this.game = incoming;
        this.synced = true;
        this.forceAdopt = false;

        // Riapplica le azioni arrivate nel frattempo e non ancora incluse nello snapshot
        for (const b of this.buffer) {
            const id = b.data.id;
            if (typeof id === 'string' && this.processedSet.has(id)) continue;
            this.handleAction(b, true, false);
        }
        this.commit(this.game!);
        this.maybeJoin(this.game!);
        this.emitStatus();
    }

    /** Chi entra in una partita non ancora iniziata chiede di essere aggiunto. */
    private maybeJoin(game: Game): void {
        if (this.o.isSpectator || this.addRequested || game.hasPlayer(this.o.playerId) || game.hasStarted()) return;
        this.addRequested = true;
        this.send('add-player', { playerId: this.o.playerId, playerName: this.o.playerName });
    }

    private publishSnapshot(forClient?: string): void {
        if (!this.game) return;
        this.o.channel
            .publish('snapshot', { snapshot: this.game.snapshot, ids: this.processed, forClient })
            .catch(() => {});
    }

    /* ------------------------------ Applicazione azioni ------------------------------ */

    private handleAction(action: Buffered, silent: boolean, remember = true): void {
        const { name, data } = action;
        const id = typeof data.id === 'string' ? data.id : null;
        if (id && this.processedSet.has(id)) return; // duplicato (re-invio / replay)

        if (remember) {
            this.buffer.push(action);
            if (this.buffer.length > BUFFER_CAP) this.buffer.shift();
        }
        if (!this.game) return; // verrà riapplicata dopo lo snapshot

        if (id) this.markProcessed(id);
        let next: Game;
        try {
            next = this.reduce(this.game, name, data);
        } catch {
            return; // azione non valida: scartata identicamente da tutti i client
        }
        this.game = next;
        if (!silent) {
            if (name === 'throw') {
                this.o.handlers.onEffect?.({
                    type: 'throw',
                    multiplier: (data.multiplier as Multiplier) ?? null,
                    isMiss: !!data.isMiss,
                });
            }
            this.commit(next);
        }
    }

    private reduce(game: Game, name: string, data: Buffered['data']): Game {
        const playerId = data.playerId;
        if (typeof playerId !== 'string') throw new Error('missing playerId');
        switch (name) {
            case 'throw':
                return game.recordThrow(playerId, data.sector ?? null, data.multiplier ?? null, data.isMiss === true);
            case 'end-turn':
                return game.endTurn(playerId);
            case 'add-player':
                return game.addPlayer(sanitizeName(data.playerName), playerId);
            default:
                throw new Error('unknown action');
        }
    }

    private markProcessed(id: string): void {
        if (this.processedSet.has(id)) return;
        this.processedSet.add(id);
        this.processed.push(id);
        if (this.processed.length > PROCESSED_CAP) this.processedSet.delete(this.processed.shift()!);
    }

    private setProcessed(ids: string[]): void {
        this.processed = [];
        this.processedSet = new Set();
        ids.slice(-PROCESSED_CAP).forEach((id) => this.markProcessed(id));
    }

    private commit(game: Game): void {
        this.game = game;
        this.o.handlers.onGame(game);
        this.scheduleSave();
        this.syncPresence();
    }

    /**
     * Pubblica nella presenza un riepilogo della partita (punteggi, iniziata o no…): è ciò che permette alla
     * home di elencare le partite aperte. Solo i giocatori, e solo a stato allineato: uno stato appena
     * ripristinato dal salvataggio locale non è ancora una fonte affidabile. Si invia solo se è cambiato.
     */
    private syncPresence(): void {
        const { channel, isSpectator, playerId, playerName } = this.o;
        const game = this.game;
        if (this.stopped || isSpectator || !game || !this.synced || typeof channel.presence.update !== 'function') return;
        const info = toPresenceGameInfo(game.snapshot);
        const key = JSON.stringify(info);
        if (key === this.presenceKey) return;
        this.presenceKey = key;
        channel.presence.update({ playerId, playerName, isSpectator: false, game: info }).catch(() => {
            // non consegnato (rete assente): al prossimo cambio di stato/connessione si riprova
            if (this.presenceKey === key) this.presenceKey = '';
        });
    }

    /* ------------------------------ Invio con coda locale ------------------------------ */

    private send(name: string, payload: Record<string, unknown>): void {
        const id = this.newId();
        this.outbox.push({ id, name, data: { ...payload, id }, createdAt: Date.now() });
        this.o.store.saveOutbox(this.outbox);
        this.emitStatus();
        void this.flushOutbox();
    }

    private async flushOutbox(): Promise<void> {
        if (this.flushing || this.stopped) return;
        this.flushing = true;
        try {
            while (this.outbox.length && !this.stopped && this.o.connection.state === 'connected') {
                const item = this.outbox[0];
                try {
                    await this.withTimeout(this.o.channel.publish(item.name, item.data), this.t.publishTimeoutMs);
                } catch {
                    break; // resta in coda: verrà ritentata (i duplicati vengono scartati dall'id)
                }
                this.outbox = this.outbox.filter((i) => i.id !== item.id);
                this.o.store.saveOutbox(this.outbox);
                this.emitStatus();
            }
        } finally {
            this.flushing = false;
            if (this.outbox.length && !this.stopped) this.later(() => void this.flushOutbox(), this.t.outboxRetryMs);
        }
    }

    private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('publish timeout')), ms);
            p.then(
                (v) => (clearTimeout(timer), resolve(v)),
                (e) => (clearTimeout(timer), reject(e))
            );
        });
    }

    /* ------------------------------ Utilità ------------------------------ */

    private scheduleSave(): void {
        if (this.saveTimer) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            if (this.game) this.o.store.saveGame(this.game.snapshot, this.processed);
        }, this.t.saveDebounceMs);
    }

    private later(fn: () => void, ms: number): void {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            fn();
        }, ms);
        this.timers.add(timer);
    }

    private emitStatus(): void {
        const state = this.o.connection.state;
        const connection: ConnectionStatus =
            state === 'connected' && this.networkOnline
                ? 'online'
                : state === 'connecting' || state === 'initialized'
                  ? this.networkOnline
                      ? 'connecting'
                      : 'offline'
                  : 'offline';
        this.o.handlers.onStatus({ connection, pending: this.outbox.length, synced: this.synced });
        this.syncPresence();
    }

    private emitPlayers(): void {
        this.o.handlers.onPlayers([...this.members.values()]);
    }
}
