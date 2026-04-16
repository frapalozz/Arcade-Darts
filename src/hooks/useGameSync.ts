import { useEffect, useState, useRef } from 'react';
import { Realtime } from 'ably';
import { Game, GameSnapshot } from '../lib/domain/game/Game.aggregate';
import { Multiplier } from '../lib/domain/game/Turn.valueObject';

export function useGameSync(
  roomId: string,
  playerId: string,
  playerName: string,
  isSpectator: boolean = false
) {
    const [game, setGame] = useState<Game | null>(null);
    const [players, setPlayers] = useState<{ playerId: string; playerName: string }[]>([]);
    const [isReady, setIsReady] = useState(false);

    const ablyRef = useRef<Realtime | null>(null); // Alby always updated
    const channelRef = useRef<any>(null); // Channell always updated
    const gameRef = useRef<Game | null>(null); // Game always updated

    const snapshotRequested = useRef(false);
    const isInitialized = useRef(false);
    const addedPlayer = useRef(false); // evita di aggiungere il giocatore due volte

    // Update gameRef
    useEffect(() => {
        gameRef.current = game;
    }, [game]);

    // =====================================
    // Init ably
    // =====================================
    useEffect(() => {
        let isMounted = true;
        const initAbly = async () => {
            try {
                const response = await fetch('/api/ably-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: playerId }),
                });
                if (!response.ok) throw new Error('Token request failed');
                const tokenRequest = await response.json();

                const client = new Realtime({
                authCallback: (_, cb) => cb(null, tokenRequest)
                });

                client.connection.on('connected', () => {
                if (!isMounted) return;
                console.log('✅ Ably connected with clientId:', playerId);
                const channel = client.channels.get(`game:${roomId}`);
                channelRef.current = channel;
                setIsReady(true);
                });

                client.connection.on('failed', (err) => {
                console.error('Ably connection failed', err);
                });

                ablyRef.current = client;
            } catch (err) {
                console.error('Ably init error:', err);
            }
        };

        initAbly();

        return () => {
            isMounted = false;
            if (ablyRef.current) ablyRef.current.close();
        };
    }, [roomId, playerId]);

    // =====================================
    // Subscription to events
    // =====================================
    useEffect(() => {
        if (!isReady || !channelRef.current) return;
        const channel = channelRef.current;

        const requestSnapshot = () => {
            if (snapshotRequested.current) return;
            snapshotRequested.current = true;
            channel.publish('snapshot-request', { requesterId: playerId });
            // Fallback: se dopo 3 secondi non abbiamo ancora un gioco e non siamo spettatori,
            // e non ci sono altri giocatori, creiamo una nuova partita.
            setTimeout(() => {
                if (!gameRef.current && !isSpectator && snapshotRequested.current) {
                    console.log("⚠️ Nessuno ha risposto, creo io la partita");

                    const newGame = Game.start(roomId, [{ id: playerId, name: playerName }], 501);
                    setGame(newGame);

                    channel.publish('snapshot', { snapshot: newGame.snapshot });
                }
                snapshotRequested.current = false;
            }, 3000);
        };

        // =====================================
        // Presence
        // =====================================
        const onEnter = (msg: any) => {
            setPlayers(prev => [...prev, { playerId: msg.data.playerId, playerName: msg.data.playerName }]);
        };
        const onLeave = (msg: any) => {
            setPlayers(prev => prev.filter(p => p.playerId !== msg.data.playerId));
        };

        channel.presence.subscribe('enter', onEnter);
        channel.presence.subscribe('leave', onLeave);
        channel.presence.enter({ playerId, playerName, isSpectator });

        // =====================================
        // Event Handlers
        // =====================================
        const onThrow = (msg: any) => {
            if (!gameRef.current) return;
            const { playerId: throwerId, sector, multiplier, isMiss } = msg.data;
            try {
                const newGame = gameRef.current.recordThrow(throwerId, sector, multiplier, isMiss);
                setGame(newGame);
            } catch (err) {
                console.warn('Throw ignored', err);
            }
        };
        
        const onEndTurn = () => {
            if (!gameRef.current) return;
            const newGame = gameRef.current.endTurn();
            setGame(newGame);
        };

        const onAddPlayer = (msg: any) => {
            if (!gameRef.current) return;
            try {
                const newGame = gameRef.current.addPlayer(msg.data.playerName, msg.data.playerId);
                setGame(newGame);
                channel.publish('snapshot', { snapshot: newGame.snapshot });
            } catch (err) {
                console.warn('Add player ignored', err);
            }
        };

        const onSnapshotRequest = (msg: any) => {
            if (gameRef.current && msg.data.requesterId !== playerId) {
                channel.publish('snapshot', { snapshot: gameRef.current.snapshot, forClient: msg.data.requesterId });
            }
        };

        const onSnapshot = (msg: any) => {
            if (msg.data.forClient && msg.data.forClient !== playerId) return;
            const snapshot = msg.data.snapshot as GameSnapshot;
            const newGame = Game.fromState(snapshot);
            setGame(newGame);
            // Dopo aver ricevuto lo snapshot, verifica se il giocatore attuale è già nella partita
            const playerInGame = snapshot.players.some(p => p.id === playerId);
            if (!playerInGame && !isSpectator && !addedPlayer.current) {
                addedPlayer.current = true;
                channel.publish('add-player', { playerName, playerId });
            }
        };

        channel.subscribe('throw', onThrow);
        channel.subscribe('end-turn', onEndTurn);
        channel.subscribe('add-player', onAddPlayer);
        channel.subscribe('snapshot-request', onSnapshotRequest);
        channel.subscribe('snapshot', onSnapshot);

        // =====================================
        // Initialization
        // =====================================
        if (!isInitialized.current) {
            isInitialized.current = true;
            const init = async () => {
                const members = await channel.presence.get();
                const playersOnly = members.filter((m: any) => !m.data.isSpectator);
                const existingPlayer = playersOnly.find((m: any) => m.data.playerId === playerId);
                
                if (playersOnly.length === 0 && !isSpectator) {
                // Nessun giocatore presente: crea nuova partita
                const newGame = Game.start(roomId, [{ id: playerId, name: playerName }], 501);
                setGame(newGame);
                channel.publish('snapshot', { snapshot: newGame.snapshot });
                } else if (!isSpectator) {
                // Richiedi snapshot per ottenere lo stato attuale
                requestSnapshot();
                // Non inviamo add-player automaticamente, verrà fatto da onSnapshot se necessario
                } else {
                requestSnapshot();
                }
            };
            init();
        }

        return () => {
            channel.presence.unsubscribe('enter', onEnter);
            channel.presence.unsubscribe('leave', onLeave);
            channel.unsubscribe('throw', onThrow);
            channel.unsubscribe('end-turn', onEndTurn);
            channel.unsubscribe('add-player', onAddPlayer);
            channel.unsubscribe('snapshot-request', onSnapshotRequest);
            channel.unsubscribe('snapshot', onSnapshot);
        };
    }, [isReady, roomId, playerId, playerName, isSpectator]);

    // Registra tiro
    const recordThrow = (sector: number | null, multiplier: Multiplier | null, isMiss: boolean) => {
        if (!gameRef.current || gameRef.current.winner) return;
        channelRef.current?.publish('throw', { playerId, sector, multiplier, isMiss });
    };

    // Registra fine turno
    const endTurn = () => {
        if (!gameRef.current) return;
        channelRef.current?.publish('end-turn', {});
    };

    return { game, recordThrow, endTurn, players, myName: playerName };
}