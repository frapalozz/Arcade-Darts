'use client';
import { memo } from 'react';
import { Eye, Play, RefreshCw, Users } from 'lucide-react';
import { useRooms } from '../hooks/useRooms';
import type { RoomSummary } from '../lib/application/rooms/RoomSummary';
import { MAX_PLAYERS } from '../lib/domain/game/Game.aggregate';

const RoomCard = memo(function RoomCard({
    room,
    onJoin,
    onWatch,
}: {
    room: RoomSummary;
    onJoin: (roomId: string) => void;
    onWatch: (roomId: string) => void;
}) {
    const waiting = room.status === 'waiting';
    const canJoin = !room.mine && waiting && !room.full;
    const tone = waiting ? 'border-primary-container glow-primary' : 'border-secondary-container glow-secondary';

    return (
        <li className={`flex flex-col gap-3 bg-surface-container border-2 p-3 sm:p-4 min-w-0 ${tone}`}>
            <div className="flex items-start justify-between gap-2 min-w-0">
                <h3 className="font-headline text-xs sm:text-sm text-white truncate" title={room.roomId}>
                    {room.roomId}
                </h3>
                <span
                    className={`shrink-0 text-[10px] sm:text-[11px] font-bold uppercase px-1.5 py-0.5 border ${
                        waiting ? 'text-primary border-primary' : 'text-secondary border-secondary'
                    }`}
                >
                    {waiting ? '● In attesa' : '▶ In corso'}
                </span>
            </div>

            <ul className="flex flex-wrap gap-1.5" aria-label="Giocatori">
                {room.players.map((p, i) => {
                    const isTurn = !waiting && p.name === room.currentPlayerName;
                    return (
                        <li
                            key={`${p.name}-${i}`}
                            className={`text-xs px-2 py-1 border ${
                                isTurn ? 'border-primary text-primary bg-primary-container/10' : 'border-outline-variant text-white'
                            }`}
                        >
                            {isTurn && <span aria-hidden>🎯 </span>}
                            {p.name}
                            {p.score !== null && !waiting && (
                                <span className="ml-1.5 font-headline text-[10px] text-tertiary tabular-nums">{p.score}</span>
                            )}
                        </li>
                    );
                })}
            </ul>

            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                <span className="inline-flex items-center gap-1">
                    <Users size={12} aria-hidden /> {room.players.length}/{MAX_PLAYERS}
                </span>
                {room.spectators > 0 && (
                    <span className="inline-flex items-center gap-1">
                        <Eye size={12} aria-hidden /> {room.spectators}
                    </span>
                )}
                {room.startingScore !== null && <span>{room.startingScore} punti</span>}
                {room.full && waiting && <span className="text-tertiary">Stanza piena</span>}
                {!waiting && !room.mine && <span className="text-tertiary">Già iniziata</span>}
            </p>

            <div className="mt-auto grid grid-cols-2 gap-2">
                {room.mine ? (
                    <button
                        type="button"
                        onClick={() => onJoin(room.roomId)}
                        className="min-h-11 inline-flex items-center justify-center gap-2 bg-primary text-on-primary-fixed font-headline text-[10px] uppercase hover:bg-primary-fixed active:translate-y-0.5 transition shadow-[0_3px_0_0_#064200]"
                    >
                        <Play size={14} aria-hidden /> Riprendi
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onJoin(room.roomId)}
                        disabled={!canJoin}
                        className="min-h-11 inline-flex items-center justify-center gap-2 bg-primary text-on-primary-fixed font-headline text-[10px] uppercase disabled:opacity-30 disabled:shadow-none hover:bg-primary-fixed active:translate-y-0.5 transition shadow-[0_3px_0_0_#064200]"
                    >
                        <Play size={14} aria-hidden /> Partecipa
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onWatch(room.roomId)}
                    className="min-h-11 inline-flex items-center justify-center gap-2 border-2 border-secondary-container text-secondary font-headline text-[10px] uppercase hover:bg-secondary-container/30 transition"
                >
                    <Eye size={14} aria-hidden /> Guarda
                </button>
            </div>
        </li>
    );
});

/** Elenco live delle partite in attesa o in corso, con ingresso come giocatore o spettatore. */
export default function RoomList({
    playerId,
    onJoin,
    onWatch,
}: {
    /** undefined = identità non ancora letta; null = nessun id salvato */
    playerId: string | null | undefined;
    onJoin: (roomId: string) => void;
    onWatch: (roomId: string) => void;
}) {
    const { rooms, error, refreshing, refresh } = useRooms(playerId);

    return (
        <section aria-labelledby="rooms-title" className="w-full flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h2 id="rooms-title" className="flex items-center gap-2 font-headline text-xs sm:text-sm uppercase">
                    <span
                        aria-hidden
                        className={`inline-block size-2 rounded-full ${error ? 'bg-error' : 'bg-primary animate-blink'}`}
                    />
                    Partite aperte
                    {rooms && rooms.length > 0 && <span className="text-tertiary">({rooms.length})</span>}
                </h2>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    aria-label="Aggiorna l'elenco delle partite"
                    className="size-11 flex items-center justify-center border-2 border-outline-variant text-white hover:border-primary hover:text-primary disabled:opacity-60 transition"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden />
                </button>
            </div>

            {rooms === null && !error && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-busy="true" aria-label="Caricamento partite">
                    {[0, 1].map((i) => (
                        <div key={i} className="h-36 border-2 border-outline-variant bg-surface-container animate-pulse" />
                    ))}
                </div>
            )}

            {error && (
                <div role="alert" className="border-2 border-error bg-error-container/20 text-on-error-container text-sm px-3 py-3 flex flex-wrap items-center justify-between gap-2">
                    <span>⚠ Impossibile caricare l&apos;elenco delle partite.</span>
                    <button
                        type="button"
                        onClick={refresh}
                        className="min-h-10 px-3 border-2 border-error text-error-dim font-semibold uppercase text-xs hover:bg-error/10 transition"
                    >
                        Riprova
                    </button>
                </div>
            )}

            {rooms && rooms.length === 0 && !error && (
                <p className="border-2 border-dashed border-outline-variant px-4 py-6 text-center text-sm text-on-surface-variant">
                    Nessuna partita aperta al momento. Creane una tu! 🎯
                </p>
            )}

            {rooms && rooms.length > 0 && (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {rooms.map((room) => (
                        <RoomCard key={room.roomId} room={room} onJoin={onJoin} onWatch={onWatch} />
                    ))}
                </ul>
            )}
        </section>
    );
}
