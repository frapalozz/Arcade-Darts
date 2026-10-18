import { GameSnapshot, MAX_PLAYERS } from '../../domain/game/Game.aggregate';

/**
 * Riepilogo pubblico di una stanza, ricavato dalla PRESENZA dei client sul canale `game:<stanza>`.
 *
 * Ogni giocatore (non spettatore) aggiorna i dati della propria presenza con `game: PresenceGameInfo`;
 * il server legge la presenza dei canali attivi e la trasforma in `RoomSummary` per la lista della home.
 * Non serve alcuno stato sul server né una cronologia dei messaggi.
 */

/** Cosa ogni giocatore pubblica nella propria presenza. Contiene gli id: NON viene mai esposto all'esterno. */
export interface PresenceGameInfo {
    /** Versione della partita: tra più giocatori vale il riepilogo con la versione più alta. */
    v: number;
    started: boolean;
    over: boolean;
    start: number;
    turn: number;
    players: { id: string; name: string; score: number }[];
}

export function toPresenceGameInfo(s: GameSnapshot): PresenceGameInfo {
    return {
        v: s.version ?? 0,
        started: s.started ?? false,
        over: s.winnerId !== null && s.winnerId !== undefined,
        start: s.startingScore,
        turn: s.currentPlayerIndex,
        players: s.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
    };
}

export type RoomStatus = 'waiting' | 'playing';

/** Quello che arriva alla home. Nessun id di giocatore. */
export interface RoomSummary {
    roomId: string;
    /** waiting = non ancora iniziata (si può entrare come giocatore); playing = in corso (solo spettatori). */
    status: RoomStatus;
    players: { name: string; score: number | null }[];
    currentPlayerName: string | null;
    spectators: number;
    startingScore: number | null;
    /** Stanza al completo: non si può più entrare come giocatore. */
    full: boolean;
    /** Chi guarda la lista è già tra i giocatori di questa partita (può riprenderla). */
    mine: boolean;
}

export interface RawRoom {
    roomId: string;
    members: { clientId: string; data?: unknown }[];
}

const MAX_NAME = 12;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const cleanName = (n: unknown): string => {
    const s = typeof n === 'string' ? n.trim().slice(0, MAX_NAME) : '';
    return s || 'Player';
};

function parseInfo(raw: unknown): PresenceGameInfo | null {
    if (!isObj(raw) || !Array.isArray(raw.players)) return null;
    const players: PresenceGameInfo['players'] = [];
    for (const p of raw.players.slice(0, MAX_PLAYERS)) {
        if (!isObj(p) || typeof p.id !== 'string' || typeof p.score !== 'number' || !Number.isFinite(p.score)) return null;
        players.push({ id: p.id, name: cleanName(p.name), score: p.score });
    }
    if (players.length === 0) return null;
    return {
        v: typeof raw.v === 'number' && Number.isFinite(raw.v) ? raw.v : 0,
        started: raw.started === true,
        over: raw.over === true,
        start: typeof raw.start === 'number' && Number.isFinite(raw.start) ? raw.start : 501,
        turn: Number.isInteger(raw.turn) ? (raw.turn as number) : 0,
        players,
    };
}

/**
 * Trasforma la presenza grezza dei canali in una lista ordinata di partite aperte.
 * Sono escluse: stanze senza giocatori (solo spettatori), partite già vinte.
 */
export function summarizeRooms(rooms: RawRoom[], viewerId?: string): RoomSummary[] {
    const out: RoomSummary[] = [];

    for (const room of rooms) {
        if (!room.roomId) continue;

        const present = new Map<string, Record<string, unknown>>();
        const watching = new Set<string>();
        for (const m of room.members) {
            const d = isObj(m.data) ? m.data : {};
            if (d.isSpectator === true) watching.add(m.clientId);
            else present.set(m.clientId, d);
        }
        if (present.size === 0) continue;

        // Il riepilogo più aggiornato tra i giocatori connessi
        let best: PresenceGameInfo | null = null;
        for (const d of present.values()) {
            const info = parseInfo(d.game);
            if (info && (!best || info.v > best.v)) best = info;
        }
        if (best?.over) continue;

        const players = best
            ? best.players.map((p) => ({ name: p.name, score: p.score as number | null }))
            : [...present.values()].map((d) => ({ name: cleanName(d.playerName), score: null as number | null }));
        const started = best?.started ?? false;
        const mine = !!viewerId && (best ? best.players.some((p) => p.id === viewerId) : present.has(viewerId));

        out.push({
            roomId: room.roomId,
            status: started ? 'playing' : 'waiting',
            players,
            currentPlayerName: started ? (players[best!.turn]?.name ?? null) : null,
            spectators: watching.size,
            startingScore: best?.start ?? null,
            full: players.length >= MAX_PLAYERS,
            mine,
        });
    }

    // Prima le tue, poi quelle a cui ci si può ancora unire, poi per numero di giocatori, poi per nome (ordine stabile)
    return out.sort((a, b) => {
        if (a.mine !== b.mine) return a.mine ? -1 : 1;
        if (a.status !== b.status) return a.status === 'waiting' ? -1 : 1;
        return b.players.length - a.players.length || a.roomId.localeCompare(b.roomId);
    });
}
