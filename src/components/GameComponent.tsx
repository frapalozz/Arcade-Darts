'use client';
import React, { useEffect, useState } from 'react';
import { useGameSync } from '../hooks/useGameSync';
import { Multiplier } from '../lib/domain/game/Turn.valueObject';
import { useRouter } from 'next/navigation';

export default function GameComponent({
    roomId,
    playerName,
    playerId,
    isSpectator
}: {
    roomId: string,
    playerName: string,
    playerId: string,
    isSpectator: boolean
}) {
    const { game, recordThrow, endTurn, players, myName } = useGameSync(
        roomId,
        playerId,
        playerName,
        isSpectator
    );

    const router = useRouter();
    const [selectedSector, setSelectedSector] = useState<number | null>(null);
    const [selectedMultiplier, setSelectedMultiplier] = useState<Multiplier | null>(null);
    const [isMyTurn, setIsMyTurn] = useState(!game ? false : game.currentPlayer.id === playerId && !game.winner && !isSpectator);

    useEffect(() => {
        if(game) {
            setIsMyTurn(game.currentPlayer.id === playerId && !game.winner && !isSpectator)
        }
        
    }, [game, endTurn])

    useEffect(() => {
        if (game) {
            console.log('Current player changed to:', game.currentPlayer.id);
        }
    }, [game?.currentPlayer.id]);

    if (!game) {

        return <div className="text-white p-4 text-center">Caricamento partita...</div>;
    }

    const playersList = game.players;

    const handleThrow = () => {
        if (!isMyTurn) return;
        if (selectedSector && selectedMultiplier) {
            recordThrow(selectedSector, selectedMultiplier, false);
            setSelectedSector(null);
            setSelectedMultiplier(null);
        }
    };

    const handleMiss = () => {
        if (!isMyTurn) return;
        recordThrow(null, null, true);
    };

    return (
        <div className="text-white p-3 sm:p-4 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold">🎯 {roomId}</h1>
                <p className="text-sm text-gray-400">
                    Giocatore: {myName} {isSpectator && '(spettatore)'}
                </p>
            </div>

            {/* Tabella giocatori - responsive: su mobile diventa a blocchi */}
            <div className="bg-neutral-900 rounded-lg overflow-hidden mb-6 shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm sm:text-base">
                        <thead className="bg-neutral-800">
                            <tr>
                                <th className="px-3 sm:px-4 py-2">Giocatore</th>
                                <th className="px-3 sm:px-4 py-2">Punteggio</th>
                                <th className="px-3 sm:px-4 py-2">Stato</th>
                            </tr>
                        </thead>
                        <tbody>
                            {playersList.map((player) => {
                                const isCurrent = player.id === game.currentPlayer.id;
                                const isWinner = game.winner?.id === player.id;
                                return (
                                    <tr key={player.id} className={`border-t border-neutral-700 ${isCurrent ? 'bg-green-900/30' : ''}`}>
                                        <td className="px-3 sm:px-4 py-2 font-medium">
                                            <span className="flex items-center gap-1">
                                                {player.name}
                                                {isWinner && <span className="text-yellow-400 text-lg">🏆</span>}
                                            </span>
                                        </td>
                                        <td className="px-3 sm:px-4 py-2 font-mono text-base sm:text-lg">{player.score.getValue()}</td>
                                        <td className="px-3 sm:px-4 py-2 text-xs sm:text-sm">
                                            {isWinner ? 'Vincitore!' : (isCurrent ? '🎯 Turno' : '')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tiri del turno corrente */}
            <div className="bg-neutral-800 p-3 rounded mb-4">
                <h2 className="text-xs sm:text-sm uppercase text-gray-400">Turno di {game.currentPlayer.name}</h2>
                <div className="flex flex-wrap gap-2 mt-1">
                    {game.currentTurnThrows.map((t, i) => (
                        <div key={i} className="bg-black px-2 py-1 rounded text-xs sm:text-sm font-mono">
                            {t.isMiss ? '❌ Miss' : `${t.sector}${t.multiplier === Multiplier.DOUBLE ? 'D' : t.multiplier === Multiplier.TRIPLE ? 'T' : ''}`}
                        </div>
                    ))}
                    {game.currentTurnThrows.length === 0 && <span className="text-xs text-gray-500">Nessun tiro ancora</span>}
                </div>
            </div>

            {/* Pannello di controllo - responsive */}
            {!isSpectator && (
                <div className="bg-neutral-800 p-4 rounded-lg shadow-md">
                    {isMyTurn ? (
                        <>
                            <h2 className="text-xl sm:text-2xl mb-3 text-green-400 font-bold">🎯 È il tuo turno!</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs mb-1">Settore (1-20)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="20"
                                        value={selectedSector || ''}
                                        onChange={e => setSelectedSector(Number(e.target.value))}
                                        className="bg-neutral-700 text-white px-3 py-2 rounded w-full text-base"
                                        placeholder="es. 20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs mb-1">Moltiplicatore</label>
                                    <select
                                        value={selectedMultiplier || ''}
                                        onChange={e => setSelectedMultiplier(Number(e.target.value) as Multiplier)}
                                        className="bg-neutral-700 text-white px-3 py-2 rounded w-full text-base"
                                    >
                                        <option value="">Scegli</option>
                                        <option value={Multiplier.SINGLE}>Singolo (x1)</option>
                                        <option value={Multiplier.DOUBLE}>Doppio (x2)</option>
                                        <option value={Multiplier.TRIPLE}>Triplo (x3)</option>
                                    </select>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                                    <button
                                        onClick={handleThrow}
                                        disabled={!selectedSector || !selectedMultiplier}
                                        className="bg-green-600 px-4 py-2 rounded disabled:opacity-50 text-base font-semibold hover:bg-green-700 transition"
                                    >
                                        Tira
                                    </button>
                                    <button
                                        onClick={handleMiss}
                                        className="bg-red-700 px-4 py-2 rounded text-base font-semibold hover:bg-red-800 transition"
                                    >
                                        Miss
                                    </button>
                                </div>
                            </div>
                            <div className="mt-4">
                                <button
                                    onClick={endTurn}
                                    className="bg-yellow-700 px-4 py-2 rounded text-sm hover:bg-yellow-800 transition"
                                >
                                    Forza fine turno
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-6">
                            <p className="text-yellow-400 text-lg">⏳ Attendi il tuo turno...</p>
                            {game.winner && <p className="text-green-400 mt-2">La partita è terminata.</p>}
                        </div>
                    )}
                </div>
            )}

            {/* Messaggio vittoria */}
            {game.winner && (
                <div className="mt-6 text-center text-xl sm:text-2xl font-bold text-yellow-400 bg-black/30 p-4 rounded-lg">
                    🎉 {game.winner.name} ha vinto la partita! 🎉
                </div>
            )}

            {/* Lista presenza (opzionale) */}
            <div className="mt-6 text-xs text-gray-500 text-center">
                <p>Connessi: {players.map(p => p.playerName).join(', ')}</p>
            </div>
        </div>
    );
}