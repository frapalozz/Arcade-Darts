// hooks/useGameSync.ts
import { useEffect, useState, useRef } from 'react';
import { Realtime } from 'ably';
import { Game, GameSnapshot } from '../lib/domain/game/Game.aggregate';
import { Multiplier } from '../lib/domain/game/Turn.valueObject';

export function useGameSync(roomId: string, ably: Realtime, playerId: string, isSpectator: boolean = false) {
    const [game, setGame] = useState<Game | null>(null);
    const [players, setPlayers] = useState<{ clientId: string; playerName: string }[]>([]);
    const channelRef = useRef<any>(null);
    const snapshotInterval = useRef<NodeJS.Timeout | undefined>(undefined);
    const gameRef = useRef<Game | null>(null);

    // Mantieni gameRef aggiornato
    useEffect(() => {
        gameRef.current = game;
    }, [game]);

    useEffect(() => {
        const channel = ably.channels.get(`game:${roomId}`);
        channelRef.current = channel;

        // Gestione presenza
        channel.presence.subscribe('enter', (msg) => {
            setPlayers(prev => [...prev, { clientId: msg.clientId, playerName: msg.data.playerName }]);
        });
        channel.presence.subscribe('leave', (msg) => {
            setPlayers(prev => prev.filter(p => p.clientId !== msg.clientId));
        });

        channel.presence.enter({ playerId, isSpectator, playerName: isSpectator ? `Spettatore-${playerId.slice(0,4)}` : `Giocatore-${playerId.slice(0,4)}` });

        const requestSnapshot = () => {
            channel.publish('snapshot-request', { requesterId: playerId });
        };

        // Ascolta eventi di gioco
        channel.subscribe('throw', (msg) => {
            if (!gameRef.current) return;
            const { playerId: throwerId, sector, multiplier, isMiss } = msg.data;
            try {
                const newGame = gameRef.current.recordThrow(throwerId, sector, multiplier, isMiss);
                setGame(newGame);
            } catch (err) {
                console.warn('Throw ignored', err);
            }
        });

        channel.subscribe('end-turn', () => {
            if (!gameRef.current) return;
            const newGame = gameRef.current.endTurn();
            setGame(newGame);
        });

        channel.subscribe('snapshot-request', (msg) => {
            if (gameRef.current && msg.data.requesterId !== playerId) {
                channel.publish('snapshot', { snapshot: gameRef.current.snapshot, forClient: msg.data.requesterId });
            }
        });

        channel.subscribe('snapshot', (msg) => {
            if (msg.data.forClient && msg.data.forClient !== playerId) return;
            const snapshot = msg.data.snapshot as GameSnapshot;
            const newGame = Game.fromState(snapshot);
            setGame(newGame);
        });

        const init = async () => {
            const members = await channel.presence.get();
            const playersOnly = members.filter(m => !m.data.isSpectator);
            if (playersOnly.length === 0 && !isSpectator) {
                const newGame = Game.start(roomId, ['Giocatore 1', 'Giocatore 2'], 501);
                setGame(newGame);
                channel.publish('snapshot', { snapshot: newGame.snapshot });
            } else {
                requestSnapshot();
            }
        };

        init();

        // Intervallo snapshot: usa gameRef.current per evitare stale closure
        const startSnapshotInterval = () => {
            if (snapshotInterval.current) clearInterval(snapshotInterval.current);
            snapshotInterval.current = setInterval(() => {
                if (gameRef.current && !gameRef.current.winner) {
                    channel.publish('snapshot', { snapshot: gameRef.current.snapshot });
                }
            }, 10000);
        };

        startSnapshotInterval();

        return () => {
        if (snapshotInterval.current) clearInterval(snapshotInterval.current);
            channel.presence.leave();
            channel.unsubscribe();
            channel.detach();
        };
    }, [roomId, ably, playerId, isSpectator]); // game non serve nelle dipendenze grazie a gameRef

    const recordThrow = (sector: number | null, multiplier: Multiplier | null, isMiss: boolean) => {
        if (!gameRef.current || gameRef.current.winner) return;
        channelRef.current?.publish('throw', { playerId, sector, multiplier, isMiss });
    };

    const endTurn = () => {
        if (!gameRef.current) return;
        channelRef.current?.publish('end-turn', {});
    };

    return { game, recordThrow, endTurn, players };
}