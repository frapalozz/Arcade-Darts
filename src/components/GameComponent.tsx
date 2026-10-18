'use client';
import React, { memo, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye } from 'lucide-react';
import { useGameSync } from '../hooks/useGameSync';
import { Multiplier, Throw, isBullMultiplier } from '../lib/domain/game/Turn.valueObject';
import type { Game } from '../lib/domain/game/Game.aggregate';
import type { SyncStatus } from '../lib/infrastructure/sync/GameSyncEngine';

const SECTORS = Array.from({ length: 20 }, (_, i) => i + 1);
const MAX_THROWS = 3;

const multiplierPrefix = (m: Multiplier | null): string =>
    m === Multiplier.DOUBLE ? 'D' : m === Multiplier.TRIPLE ? 'T' : '';

/** Testo breve per gli slot dei tiri. */
const formatThrow = (t: Throw): string => {
    if (t.isMiss) return 'MISS';
    if (t.multiplier === Multiplier.BULLSEYE) return 'BULL';
    if (t.multiplier === Multiplier.DOUBLE_BULLSEYE) return 'BULLSEYE';
    return `${multiplierPrefix(t.multiplier)}${t.sector}`;
};

/* ----------------------------- Sotto-componenti memoizzati ----------------------------- */

const ConnectionBanner = memo(function ConnectionBanner({ status, hasGame }: { status: SyncStatus; hasGame: boolean }) {
    let text: string | null = null;
    let tone = 'border-tertiary-dim bg-tertiary-container/10 text-tertiary';
    if (status.connection === 'offline') {
        text = hasGame
            ? '📡 Connessione persa: la partita è salvata sul dispositivo e si risincronizza appena torna la rete.'
            : '📡 Nessuna connessione.';
        tone = 'border-error bg-error-container/20 text-on-error-container';
    } else if (status.connection === 'connecting') {
        text = '🔄 Connessione in corso…';
    } else if (hasGame && !status.synced) {
        text = '🔄 Sincronizzazione con gli altri giocatori…';
    }
    if (status.pending > 0) {
        text = `${text ? text + ' ' : ''}⏳ ${status.pending} ${status.pending === 1 ? 'azione' : 'azioni'} in attesa di invio.`;
    }
    if (!text) return null;
    return (
        <div role="status" className={`border-2 px-3 py-2 text-xs sm:text-sm ${tone}`}>
            {text}
        </div>
    );
});

const PlayerCard = memo(function PlayerCard({
    name,
    score,
    isCurrent,
    isWinner,
    isMe,
}: {
    name: string;
    score: number;
    isCurrent: boolean;
    isWinner: boolean;
    isMe: boolean;
}) {
    const tone = isWinner
        ? 'border-tertiary glow-tertiary bg-tertiary-container/10'
        : isCurrent
            ? 'border-primary animate-pulse-glow bg-primary-container/10'
            : 'border-outline-variant bg-surface-container';
    const scoreTone = isWinner ? 'text-tertiary text-glow-tertiary' : isCurrent ? 'text-primary text-glow-primary' : 'text-white';
    return (
        <div className={`relative border-2 p-3 sm:p-4 flex flex-col gap-2 min-w-0 ${tone}`}>
            <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="font-headline text-[10px] sm:text-xs uppercase truncate">
                    {name}
                </span>
                {isMe && <span className="shrink-0 text-[10px] font-semibold text-secondary border border-secondary px-1">TU</span>}
            </div>
            <div className={`font-headline text-2xl sm:text-3xl tabular-nums ${scoreTone}`}>{score}</div>
            <div className="h-4 text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                {isWinner ? <span className="text-tertiary">🏆 Vincitore</span>
                    : isCurrent ? <span className="text-primary">🎯 In gioco</span>
                        : <span className="text-on-surface-variant">&nbsp;</span>}
            </div>
        </div>
    );
});

const Scoreboard = memo(function Scoreboard({ game, playerId }: { game: Game; playerId: string }) {
    const currentId = game.currentPlayer.id;
    const winnerId = game.winnerId;
    return (
        <section aria-label="Classifica" className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
            {game.players.map((player) => (
                <PlayerCard
                    key={player.id}
                    name={player.name}
                    score={player.score.getValue()}
                    isCurrent={!winnerId && player.id === currentId}
                    isWinner={winnerId === player.id}
                    isMe={player.id === playerId}
                />
            ))}
        </section>
    );
});

const TurnThrows = memo(function TurnThrows({ throws, name }: { throws: Throw[]; name: string }) {
    const total = throws.reduce((sum, t) => sum + t.points, 0);
    return (
        <section aria-label="Tiri del turno" className="bg-surface-container border-2 border-outline-variant p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-headline text-[10px] sm:text-xs uppercase text-on-surface-variant truncate">
                    Turno di <span className="text-white">{name}</span>
                </h2>
                <span className="font-headline text-[10px] sm:text-xs text-tertiary shrink-0">
                    {throws.length}/{MAX_THROWS}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {Array.from({ length: MAX_THROWS }, (_, i) => {
                    const t = throws[i];
                    return (
                        <div
                            key={i}
                            className={`min-h-16 sm:min-h-20 flex flex-col items-center justify-center gap-1 border-2 px-1 text-center ${
                                t
                                    ? t.isMiss
                                        ? 'border-error/70 bg-error-container/10 animate-pop'
                                        : 'border-primary/70 bg-primary-container/10 animate-pop'
                                    : 'border-dashed border-outline-variant'
                            }`}
                        >
                            {t ? (
                                <>
                                    <span className="font-headline text-[10px] sm:text-xs break-all">{formatThrow(t)}</span>
                                    <span className="text-xs sm:text-sm text-on-surface-variant tabular-nums">{t.points} pt</span>
                                </>
                            ) : (
                                <span className="font-headline text-sm text-outline-variant">·</span>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="mt-3 text-right text-xs sm:text-sm text-on-surface-variant">
                Totale turno: <span className="font-headline text-tertiary tabular-nums">{total}</span>
            </p>
        </section>
    );
});

const SectorPad = memo(function SectorPad({
    selected,
    onSelect,
}: {
    selected: number | null;
    onSelect: (n: number) => void;
}) {
    return (
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="group" aria-label="Settore">
            {SECTORS.map((n) => (
                <button
                    key={n}
                    onClick={() => onSelect(n)}
                    aria-pressed={selected === n}
                    className={`h-11 sm:h-12 border-2 font-headline text-xs transition active:scale-95 ${
                        selected === n
                            ? 'bg-primary text-on-primary-fixed border-primary glow-primary'
                            : 'bg-surface-container-high text-white border-outline-variant hover:border-primary/70'
                    }`}
                >
                    {n}
                </button>
            ))}
        </div>
    );
});

const MULTIPLIER_BUTTONS: { value: Multiplier; label: string; sub: string; active: string }[] = [
    { value: Multiplier.DOUBLE, label: 'x2', sub: 'Double', active: 'bg-tertiary text-on-tertiary border-tertiary glow-tertiary' },
    { value: Multiplier.TRIPLE, label: 'x3', sub: 'Triple', active: 'bg-secondary text-on-secondary border-secondary glow-secondary' },
    { value: Multiplier.BULLSEYE, label: '25', sub: 'Bull', active: 'bg-primary text-on-primary-fixed border-primary glow-primary' },
    { value: Multiplier.DOUBLE_BULLSEYE, label: '50', sub: 'Bullseye', active: 'bg-primary text-on-primary-fixed border-primary glow-primary' },
];

const MultiplierPad = memo(function MultiplierPad({
    selected,
    onSelect,
}: {
    selected: Multiplier;
    onSelect: (m: Multiplier) => void;
}) {
    return (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2" role="group" aria-label="Moltiplicatore">
            {MULTIPLIER_BUTTONS.map((b) => (
                <button
                    key={b.value}
                    onClick={() => onSelect(b.value)}
                    aria-pressed={selected === b.value}
                    className={`min-h-14 flex flex-col items-center justify-center gap-0.5 border-2 transition active:scale-95 ${
                        selected === b.value
                            ? b.active
                            : 'bg-surface-container-high text-white border-outline-variant hover:border-white/60'
                    }`}
                >
                    <span className="font-headline text-xs sm:text-sm">{b.label}</span>
                    <span className="text-[10px] sm:text-xs font-semibold uppercase">{b.sub}</span>
                </button>
            ))}
        </div>
    );
});

/* ----------------------------------- Pagina di gioco ----------------------------------- */

export default function GameComponent({
    roomId,
    playerName,
    playerId,
    isSpectator,
}: {
    roomId: string;
    playerName: string;
    playerId: string;
    isSpectator: boolean;
}) {
    const { game, recordThrow, endTurn, players, myName, status } = useGameSync(roomId, playerId, playerName, isSpectator);

    const [selectedSector, setSelectedSector] = useState<number | null>(null);
    const [selectedMultiplier, setSelectedMultiplier] = useState<Multiplier>(Multiplier.SINGLE);

    const isPlayer = !isSpectator && !!game?.hasPlayer(playerId);
    const isMyTurn = isPlayer && !!game && !game.winner && game.currentPlayer.id === playerId;
    // I comandi si bloccano mentre un'azione è in volo/in coda o lo stato non è ancora allineato:
    // evita doppi tiri e tiri calcolati su uno stato vecchio.
    const controlsLocked = status.pending > 0 || !status.synced;

    const bullSelected = isBullMultiplier(selectedMultiplier);
    const canThrow = !controlsLocked && (bullSelected || selectedSector !== null);

    // Scegliere un settore dopo aver scelto Double/Triple mantiene il moltiplicatore (prima veniva azzerato);
    // scegliere un settore dopo Bull torna a Single perché i due sono incompatibili.
    const handleSelectSector = useCallback((n: number) => {
        setSelectedSector(n);
        setSelectedMultiplier((m) => (isBullMultiplier(m) ? Multiplier.SINGLE : m));
    }, []);

    // Cliccare di nuovo il moltiplicatore attivo lo deseleziona (torna a Single).
    const handleSelectMultiplier = useCallback((m: Multiplier) => {
        setSelectedMultiplier((cur) => (cur === m ? Multiplier.SINGLE : m));
    }, []);

    const handleThrow = useCallback(() => {
        if (!canThrow) return;
        if (bullSelected) {
            // Bull/Bullseye non richiedono il settore (prima il tasto "Tira" restava bloccato)
            recordThrow(null, selectedMultiplier, false);
        } else if (selectedSector !== null) {
            recordThrow(selectedSector, selectedMultiplier, false);
        }
        setSelectedSector(null);
        setSelectedMultiplier(Multiplier.SINGLE);
    }, [canThrow, bullSelected, selectedSector, selectedMultiplier, recordThrow]);

    const handleMiss = useCallback(() => {
        if (controlsLocked) return;
        recordThrow(null, null, true);
        setSelectedSector(null);
        setSelectedMultiplier(Multiplier.SINGLE);
    }, [controlsLocked, recordThrow]);

    const throws = useMemo(() => game?.currentTurnThrows ?? [], [game]);

    // Anteprima del tiro che sta per essere registrato
    const preview = useMemo(() => {
        if (bullSelected) return { label: selectedMultiplier === Multiplier.BULLSEYE ? 'BULL' : 'BULLSEYE', points: selectedMultiplier as number };
        if (selectedSector === null) return null;
        return {
            label: `${multiplierPrefix(selectedMultiplier)}${selectedSector}`,
            points: selectedSector * selectedMultiplier,
        };
    }, [bullSelected, selectedMultiplier, selectedSector]);

    if (!game) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="w-full max-w-md"><ConnectionBanner status={status} hasGame={false} /></div>
                <p className="font-headline text-xs text-primary text-glow-primary animate-blink">Caricamento partita...</p>
            </div>
        );
    }

    const bustPlayer = game.lastBustPlayerId ? game.players.find((p) => p.id === game.lastBustPlayerId) : null;

    return (
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-4 sm:gap-5 px-3 sm:px-6 pt-safe pb-6">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex items-center gap-3 min-w-0">
                    <Link
                        href="/"
                        aria-label="Torna alla home"
                        className="shrink-0 size-11 flex items-center justify-center border-2 border-outline-variant text-white hover:border-primary hover:text-primary transition"
                    >
                        <ArrowLeft size={18} aria-hidden />
                    </Link>
                    <h1 className="font-headline text-sm sm:text-xl text-primary text-glow-primary truncate">
                        🎯 {roomId}
                    </h1>
                </div>
                <p className="flex items-center gap-2 text-xs sm:text-sm text-on-surface-variant min-w-0">
                    <span className="truncate">Giocatore: <span className="text-white font-semibold">{myName}</span></span>
                    {isSpectator && (
                        <span className="shrink-0 inline-flex items-center gap-1 border border-secondary text-secondary px-1.5 py-0.5 text-[11px] uppercase">
                            <Eye size={12} aria-hidden /> spettatore
                        </span>
                    )}
                </p>
            </header>

            <ConnectionBanner status={status} hasGame />

            {/* Vittoria */}
            {game.winner && (
                <div className="animate-pop border-2 border-tertiary glow-tertiary bg-tertiary-container/10 p-4 sm:p-6 text-center flex flex-col items-center gap-3">
                    <p className="font-headline text-sm sm:text-xl text-tertiary text-glow-tertiary leading-relaxed">
                        🎉 {game.winner.name} ha vinto! 🎉
                    </p>
                    <Link
                        href="/"
                        className="min-h-11 inline-flex items-center px-4 border-2 border-tertiary text-tertiary font-headline text-[10px] uppercase hover:bg-tertiary/20 transition"
                    >
                        Nuova partita
                    </Link>
                </div>
            )}

            {bustPlayer && !game.winner && (
                <div role="alert" className="animate-shake border-2 border-error bg-error-container/20 px-3 py-2 text-sm text-on-error-container">
                    💥 <span className="font-headline text-[10px] sm:text-xs">BUST!</span> {bustPlayer.name} sfora: il punteggio torna a {bustPlayer.score.getValue()}.
                </div>
            )}

            {/* Contenuto: una colonna su mobile, due colonne da lg */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_26rem] gap-4 sm:gap-5 items-start">
                <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
                    <Scoreboard game={game} playerId={playerId} />
                    <TurnThrows throws={throws} name={game.currentPlayer.name} />
                </div>

                {/* Pannello di controllo */}
                {!isSpectator && (
                    <section
                        aria-label="Comandi"
                        className="lg:sticky lg:top-4 bg-surface-container border-2 border-outline-variant min-w-0"
                    >
                        {isMyTurn ? (
                            <>
                                <div className="p-3 sm:p-4 flex flex-col gap-4">
                                    <h2 className="font-headline text-[10px] sm:text-xs text-primary text-glow-primary">
                                        🎯 È il tuo turno!
                                    </h2>
                                    <div className="flex flex-col gap-2">
                                        <p className="text-[11px] sm:text-xs uppercase font-semibold text-on-surface-variant">1 · Settore</p>
                                        <SectorPad selected={selectedSector} onSelect={handleSelectSector} />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <p className="text-[11px] sm:text-xs uppercase font-semibold text-on-surface-variant">2 · Moltiplicatore</p>
                                        <MultiplierPad selected={selectedMultiplier} onSelect={handleSelectMultiplier} />
                                    </div>
                                    <button
                                        onClick={endTurn}
                                        disabled={controlsLocked}
                                        className="self-start min-h-11 px-3 border-2 border-tertiary-dim text-tertiary text-xs font-semibold uppercase disabled:opacity-40 hover:bg-tertiary/10 transition"
                                    >
                                        Forza fine turno
                                    </button>
                                </div>

                                {/* Barra azioni: resta agganciata in basso sul mobile */}
                                <div className="sticky bottom-0 lg:static border-t-2 border-outline-variant bg-surface-container-low/95 backdrop-blur px-3 sm:px-4 pt-3 pb-safe grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                    <div className="min-w-0" aria-live="polite">
                                        {preview ? (
                                            <>
                                                <p className="font-headline text-xs sm:text-sm text-primary truncate">{preview.label}</p>
                                                <p className="text-xs text-on-surface-variant tabular-nums">{preview.points} punti</p>
                                            </>
                                        ) : (
                                            <p className="text-xs text-on-surface-variant">Scegli un settore</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleThrow}
                                        disabled={!canThrow}
                                        className="min-h-12 px-4 sm:px-5 bg-primary text-on-primary-fixed font-headline text-xs uppercase disabled:opacity-40 disabled:shadow-none hover:bg-primary-fixed active:translate-y-0.5 transition shadow-[0_4px_0_0_#064200]"
                                    >
                                        Tira
                                    </button>
                                    <button
                                        onClick={handleMiss}
                                        disabled={controlsLocked}
                                        className="min-h-12 px-3 sm:px-4 bg-error-container text-white font-headline text-xs uppercase disabled:opacity-40 disabled:shadow-none hover:brightness-110 active:translate-y-0.5 transition shadow-[0_4px_0_0_#5a1400]"
                                    >
                                        Miss
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-8 px-4">
                                {game.winner ? (
                                    <p className="font-headline text-xs text-tertiary leading-relaxed">La partita è terminata.</p>
                                ) : isPlayer ? (
                                    <p className="font-headline text-xs text-tertiary leading-relaxed animate-blink">⏳ Attendi il tuo turno...</p>
                                ) : game.hasStarted() ? (
                                    <p className="text-sm text-tertiary">👀 La partita è già iniziata: puoi solo guardare.</p>
                                ) : (
                                    <p className="font-headline text-xs text-tertiary leading-relaxed animate-blink">⏳ Ingresso nella partita...</p>
                                )}
                            </div>
                        )}
                    </section>
                )}
            </div>

            {/* Presenza */}
            <footer className="flex flex-wrap items-center justify-center gap-2 text-xs text-on-surface-variant pt-2">
                <span>Connessi:</span>
                {players.map((p, i) => (
                    <span key={`${p.playerName}-${i}`} className="border border-outline-variant px-2 py-0.5 text-white">
                        <span className="inline-block size-1.5 rounded-full bg-primary mr-1.5 align-middle" aria-hidden />
                        {p.playerName}
                    </span>
                ))}
            </footer>
        </div>
    );
}
