'use client';
import React, { useEffect, useState } from 'react';
import { useGameSync } from '../hooks/useGameSync';
import { Multiplier } from '../lib/domain/game/Turn.valueObject';

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

    const [selectedSector, setSelectedSector] = useState<number | null>(null);
    const [selectedMultiplier, setSelectedMultiplier] = useState<Multiplier>(Multiplier.SINGLE);
    const [isMyTurn, setIsMyTurn] = useState(!game ? false : game.currentPlayer.id === playerId && !game.winner && !isSpectator);

    useEffect(() => {
        if(game) {
            setIsMyTurn(game.currentPlayer.id === playerId && !game.winner && !isSpectator)
        }
        
    }, [game, endTurn])

    if (!game) {

        return <div className="text-white p-4 text-center">Caricamento partita...</div>;
    }

    const playersList = game.players;

    const handleThrow = () => {
        if (!isMyTurn) return;
        if (selectedSector && selectedMultiplier) {
            recordThrow(selectedSector, selectedMultiplier, false);
            setSelectedSector(null);
            setSelectedMultiplier(Multiplier.SINGLE);
        }
    };

    const handleMiss = () => {
        if (!isMyTurn) return;
        recordThrow(null, null, true);
    };

    return (
        <div className={`text-white p-3 sm:p-4 max-w-screen w-screen mx-auto`}>
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
                    <table className="w-full text-left text-xs sm:text-base">
                        <thead className="bg-neutral-800">
                            <tr>
                                <th className="px-3 sm:px-4 py-2">Player</th>
                                <th className="px-3 sm:px-4 py-2 text-center">Points</th>
                                <th className="px-3 sm:px-4 py-2 text-end">State</th>
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
                                        <td className="px-3 sm:px-4 py-2 text-xs text-center">{player.score.getValue()}</td>
                                        <td className="px-3 sm:px-4 py-2 text-xs sm:text-sm text-end">
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
                <h2 className="text-xs uppercase text-gray-400">Turno di {game.currentPlayer.name}</h2>
                <div className="flex flex-wrap gap-2 mt-1">
                    {game.currentTurnThrows.map((t, i) => {
                        let point = 0;
                        if(!t.isMiss) {
                            if(t.multiplier === Multiplier.BULLSEYE || t.multiplier === Multiplier.DOUBLE_BULLSEYE) {
                                point = t.multiplier === Multiplier.BULLSEYE ? 25 : 50;
                            } else {
                                point = t.sector!;
                            }
                        }
                        return (
                        <div key={i} className="bg-black px-2 py-1 rounded text-xs sm:text-sm font-mono">
                            {t.isMiss ? '❌ Miss' : `${point}${t.multiplier === Multiplier.DOUBLE ? 'D' : t.multiplier === Multiplier.TRIPLE ? 'T' : ''}${t.multiplier === Multiplier.BULLSEYE ? "🐂" : t.multiplier === Multiplier.DOUBLE_BULLSEYE ? "🐂🐂" : ""}`}
                        </div>
                    )})}
                    {game.currentTurnThrows.length === 0 && <span className="text-xs text-gray-500">Nessun tiro ancora</span>}
                </div>
            </div>

            {/* Pannello di controllo - responsive */}
            {!isSpectator && (
                <div className="bg-neutral-800 p-4 rounded-lg shadow-md">
                    {isMyTurn ? (
                        <>
                            <h2 className="text-base mb-3 text-green-400 font-bold">🎯 È il tuo turno!</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="grid grid-cols-4 gap-2">
                                    {Array.from({ length: 20 }, (_, i) => i + 1).map(n => {
                                        const isSelected = selectedSector === n;

                                        return (
                                        <button
                                            key={n}
                                            onClick={() => {setSelectedSector(n); setSelectedMultiplier(Multiplier.SINGLE)}}
                                            className={`
                                            px-3 py-2 rounded text-sm font-bold
                                            ${isSelected 
                                                ? 'bg-primary text-on-primary-container' 
                                                : 'bg-neutral-700 text-white hover:bg-neutral-600'}
                                            `}
                                        >
                                            {n}
                                        </button>
                                        );
                                    })}
                                    {/*<input
                                        type="number"
                                        min="1"
                                        max="20"
                                        value={selectedSector || ''}
                                        onChange={e => setSelectedSector(Number(e.target.value))}
                                        className="bg-neutral-700 text-white px-3 py-2 rounded w-full text-base"
                                        placeholder="es. 20"
                                    />*/}
                                </div>
                                <div className='grid grid-cols-2 gap-2'>

                                    <button
                                        onClick={() => setSelectedMultiplier(Multiplier.DOUBLE)}
                                        className={`px-3 py-2 rounded ${
                                        selectedMultiplier === Multiplier.DOUBLE ? 'bg-orange-200 text-orange-700' : 'bg-neutral-700 text-white'
                                        }`}
                                    >
                                        Double
                                    </button>

                                    <button
                                        onClick={() => setSelectedMultiplier(Multiplier.TRIPLE)}
                                        className={`px-3 py-2 rounded ${
                                        selectedMultiplier === Multiplier.TRIPLE ? 'bg-primary-container text-on-primary-container' : 'bg-neutral-700 text-white'
                                        }`}
                                    >
                                        Triple
                                    </button>
                                    <button
                                        onClick={() => setSelectedMultiplier(Multiplier.BULLSEYE)}
                                        className={`px-3 py-2 rounded ${
                                        selectedMultiplier === Multiplier.BULLSEYE ? 'bg-blue-500 text-white' : 'bg-neutral-700 text-white'
                                        }`}
                                    >
                                        Bull
                                    </button>

                                    <button
                                        onClick={() => setSelectedMultiplier(Multiplier.DOUBLE_BULLSEYE)}
                                        className={`px-3 py-2 rounded ${
                                        selectedMultiplier === Multiplier.DOUBLE_BULLSEYE ? 'bg-blue-500 text-white' : 'bg-neutral-700 text-white'
                                        }`}
                                    >
                                        Bullseye
                                    </button>
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