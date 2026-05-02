import { useEffect, useState, useRef } from 'react';
import { Realtime } from 'ably';
import { Game, GameSnapshot } from '../lib/domain/game/Game.aggregate';
import { Multiplier } from '../lib/domain/game/Turn.valueObject';

const STORAGE_KEY_PREFIX = 'game_snapshot_';
const TTL = 30 * 60 * 1000; // 30 minuti

export function useGameSync(
  roomId: string,
  playerId: string,
  playerName: string,
  isSpectator: boolean = false
) {
    const [game, setGame] = useState<Game | null>(null);
    const [players, setPlayers] = useState<{ playerId: string; playerName: string }[]>([]);
    const [isReady, setIsReady] = useState(false);

    const ablyRef = useRef<Realtime | null>(null);
    const channelRef = useRef<any>(null);
    const gameRef = useRef<Game | null>(null);

    const snapshotRequested = useRef(false);
    const isInitialized = useRef(false);
    const addedPlayer = useRef(false);
    const prevPlayersLengthRef = useRef(0);

    // Helper: chiave univoca per la room
    const getStorageKey = () => `${STORAGE_KEY_PREFIX}${roomId}`;

    // Helper: salva lo stato su localStorage
    const saveGameToLocalStorage = (game: Game) => {
        if (!game) return;
        const snapshot = game.snapshot;
        const data = {
            snapshot,
            timestamp: Date.now()
        };
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(data));
            console.log('💾 Game state saved to localStorage');
        } catch (err) {
            console.warn('Failed to save game to localStorage', err);
        }
    };

    // Helper: carica lo stato da localStorage se valido (non scaduto)
    const loadGameFromLocalStorage = (): Game | null => {
        const raw = localStorage.getItem(getStorageKey());
        if (!raw) return null;
        try {
            const { snapshot, timestamp } = JSON.parse(raw);
            if (Date.now() - timestamp > TTL) {
                // Scaduto -> cancella
                localStorage.removeItem(getStorageKey());
                return null;
            }
            console.log('📀 Restored game from localStorage');
            return Game.fromState(snapshot);
        } catch (err) {
            console.warn('Failed to parse saved game', err);
            return null;
        }
    };

    // Helper: cancella lo stato salvato
    const clearGameFromLocalStorage = () => {
        localStorage.removeItem(getStorageKey());
        console.log('🗑️ Cleared game from localStorage');
    };

    // Aggiorna il ref del game
    useEffect(() => {
        gameRef.current = game;
    }, [game]);

    // Salva automaticamente quando tutti i giocatori (non spettatori) se ne vanno
    useEffect(() => {
        // Solo se c'è un gioco e siamo passati da almeno un giocatore a zero
        if (players.length === 0 && prevPlayersLengthRef.current > 0 && gameRef.current) {
            console.log('💿 Last player left, saving game state');
            saveGameToLocalStorage(gameRef.current);
        }
        prevPlayersLengthRef.current = players.length;
    }, [players]);

    // =====================================
    // Init Ably
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
                    clearGameFromLocalStorage(); // nuova partita -> cancella vecchio salvataggio
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
                    // Nessun giocatore presente: prova a caricare da localStorage
                    const savedGame = loadGameFromLocalStorage();
                    if (savedGame) {
                        console.log('🔄 Restoring saved game');
                        setGame(savedGame);
                        gameRef.current = savedGame;
                        // Pubblica lo snapshot per eventuali altri client che si uniscono in contemporanea
                        channel.publish('snapshot', { snapshot: savedGame.snapshot });
                    } else {
                        console.log('🆕 No saved game, creating new one');
                        const newGame = Game.start(roomId, [{ id: playerId, name: playerName }], 501);
                        setGame(newGame);
                        clearGameFromLocalStorage(); // assicura che non ci siano residui
                        channel.publish('snapshot', { snapshot: newGame.snapshot });
                    }
                } else if (!isSpectator) {
                    // Ci sono già giocatori: richiedi snapshot normale
                    requestSnapshot();
                } else {
                    // Spettatore: richiede snapshot
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