import type { GameSnapshot } from '../../domain/game/Game.aggregate';

/** Dopo questo tempo senza aggiornamenti la partita salvata viene considerata abbandonata. */
export const GAME_TTL_MS = 2 * 60 * 60 * 1000;
/** Un'azione rimasta in coda più a lungo di così non ha più senso inviarla. */
export const OUTBOX_TTL_MS = 2 * 60 * 1000;

export interface StoredGame {
    snapshot: GameSnapshot;
    /** Ultimi id di azioni già applicate: servono a non applicare due volte la stessa azione. */
    ids: string[];
    savedAt: number;
}

export interface OutboxItem {
    id: string;
    name: string;
    data: Record<string, unknown>;
    createdAt: number;
}

export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): unknown;
    removeItem(key: string): unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Persistenza locale di una stanza: stato di gioco + coda delle azioni non ancora consegnate.
 * Pensata per sopravvivere a cali di connessione, ricaricamenti e chiusure accidentali della scheda.
 */
export class LocalGameStore {
    private readonly gameKey: string;
    private readonly outboxKey: string;
    private readonly legacyKey: string;
    private lastSerialized: string | null = null;

    constructor(
        roomId: string,
        private readonly storage: KeyValueStorage,
        private readonly now: () => number = Date.now
    ) {
        this.gameKey = `darts:v2:${roomId}:game`;
        this.outboxKey = `darts:v2:${roomId}:outbox`;
        this.legacyKey = `game_snapshot_${roomId}`; // formato della versione precedente
    }

    loadGame(): StoredGame | null {
        const raw = this.storage.getItem(this.gameKey) ?? this.storage.getItem(this.legacyKey);
        if (!raw) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!isObject(parsed) || !isObject(parsed.snapshot)) throw new Error('malformed');
            const savedAt = Number(parsed.savedAt ?? parsed.timestamp);
            if (!Number.isFinite(savedAt) || this.now() - savedAt > GAME_TTL_MS) {
                this.clearGame();
                return null;
            }
            const snapshot = parsed.snapshot as unknown as GameSnapshot;
            if (!Array.isArray(snapshot.players) || snapshot.players.length === 0) throw new Error('malformed');
            const ids = Array.isArray(parsed.ids) ? parsed.ids.filter((x): x is string => typeof x === 'string') : [];
            return { snapshot, ids, savedAt };
        } catch {
            this.clearGame();
            return null;
        }
    }

    /** Ritorna false se non è stato possibile scrivere (storage pieno/bloccato). */
    saveGame(snapshot: GameSnapshot, ids: string[]): boolean {
        const payload: StoredGame = { snapshot, ids, savedAt: this.now() };
        // Evita scritture ripetute identiche (il timestamp viene rinnovato solo se lo stato cambia)
        const fingerprint = JSON.stringify({ snapshot, ids });
        if (fingerprint === this.lastSerialized) return true;
        try {
            if (this.storage.setItem(this.gameKey, JSON.stringify(payload)) === false) return false;
            this.storage.removeItem(this.legacyKey);
            this.lastSerialized = fingerprint;
            return true;
        } catch {
            return false;
        }
    }

    clearGame(): void {
        this.lastSerialized = null;
        try {
            this.storage.removeItem(this.gameKey);
            this.storage.removeItem(this.legacyKey);
        } catch {}
    }

    loadOutbox(): OutboxItem[] {
        const raw = this.storage.getItem(this.outboxKey);
        if (!raw) return [];
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            const now = this.now();
            return parsed.filter(
                (i): i is OutboxItem =>
                    isObject(i) &&
                    typeof i.id === 'string' &&
                    typeof i.name === 'string' &&
                    isObject(i.data) &&
                    typeof i.createdAt === 'number' &&
                    now - i.createdAt <= OUTBOX_TTL_MS
            );
        } catch {
            return [];
        }
    }

    saveOutbox(items: OutboxItem[]): void {
        try {
            if (items.length === 0) this.storage.removeItem(this.outboxKey);
            else this.storage.setItem(this.outboxKey, JSON.stringify(items));
        } catch {}
    }
}
