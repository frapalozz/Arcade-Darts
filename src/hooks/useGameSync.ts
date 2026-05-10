import { useEffect, useState, useRef } from "react";
import { Realtime } from "ably";
import { Game, GameSnapshot } from "../lib/domain/game/Game.aggregate";
import { Multiplier } from "../lib/domain/game/Turn.valueObject";
import { storage } from "@/utils/storage";
import confetti from "canvas-confetti";

const STORAGE_KEY_PREFIX = "game_snapshot_";
const TTL = 30 * 60 * 1000; // 30 minuti

// Sound assets – replace with your actual file paths
const SOUND_GAME_START = "/sounds/game-start.mp3";
const SOUNDS_THROW = ["/sounds/throw.mp3", "/sounds/throw2.mp3", "/sounds/throw3.mp3"];
const NICE_DONE = "/sounds/nice-done.mp3";
const SOUND_WINNER = "/sounds/winner.mp3";

// Helper to play an audio file safely (handles autoplay policy errors)
// Returns the Audio object so we can control it later (stop/pause)
const playSound = (src: string, loop: boolean = false): HTMLAudioElement | null => {
  const audio = new Audio(src);
  audio.loop = loop;
  audio.play().catch((err) => {
    console.warn(`Sound playback failed (${src}):`, err);
  });
  return audio;
};

// Helper to stop an audio element
const stopSound = (audio: HTMLAudioElement | null) => {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
};

export function useGameSync(roomId: string, playerId: string, playerName: string, isSpectator: boolean = false) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<{ playerId: string; playerName: string }[]>([]);
  const [isReady, setIsReady] = useState(false);

  const ablyRef = useRef<Realtime | null>(null);
  const channelRef = useRef<any>(null);
  const gameRef = useRef<Game | null>(null);

  const snapshotRequested = useRef(false);
  const isInitialized = useRef(false);
  const addedPlayer = useRef(false);

  // Track winner changes to play sound only once per win
  const prevWinnerRef = useRef<string | null>(null);

  // Track if game start music has been stopped (to avoid stopping multiple times)
  const gameStartMusicStopped = useRef(false);
  // Store the game start audio element so we can stop it later
  const gameStartAudioRef = useRef<HTMLAudioElement | null>(null);

  // Helper: chiave univoca per la room
  const getStorageKey = () => `${STORAGE_KEY_PREFIX}${roomId}`;

  // Helper: salva lo stato su localStorage (chiamato dopo ogni azione)
  const saveGameToLocalStorage = (gameToSave: Game) => {
    if (!gameToSave) return;
    const snapshot = gameToSave.snapshot;
    const data = {
      snapshot,
      timestamp: Date.now(),
    };
    try {
      storage.setItem(getStorageKey(), JSON.stringify(data));
      console.log("💾 Game state saved to localStorage");
    } catch (err) {
      console.warn("Failed to save game to localStorage", err);
    }
  };

  // Helper: carica lo stato da localStorage se valido (non scaduto)
  const loadGameFromLocalStorage = (): Game | null => {
    const raw = storage.getItem(getStorageKey());
    if (!raw) return null;
    try {
      const { snapshot, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp > TTL) {
        storage.removeItem(getStorageKey());
        return null;
      }
      console.log("📀 Restored game from localStorage");
      return Game.fromState(snapshot);
    } catch (err) {
      console.warn("Failed to parse saved game", err);
      return null;
    }
  };

  // Helper: cancella lo stato salvato
  const clearGameFromLocalStorage = () => {
    storage.removeItem(getStorageKey());
    console.log("🗑️ Cleared game from localStorage");
  };

  // Aggiorna il ref del game
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // 👑 Play winner sound when the game winner appears (or changes)
  useEffect(() => {
    if (game?.winner && game.winner.id !== prevWinnerRef.current) {
      // Play winner sound
      playSound(SOUND_WINNER, false);

      // Trigger confetti explosion
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }, // start from middle-ish
        startVelocity: 20,
        colors: ["#ffd700", "#ff6347", "#00ff7f", "#1e90ff"],
      });

      // Optional: add a second burst a bit later
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 100,
          origin: { y: 0.5, x: 0.3 },
          startVelocity: 25,
        });
        confetti({
          particleCount: 100,
          spread: 100,
          origin: { y: 0.5, x: 0.7 },
          startVelocity: 25,
        });
      }, 200);

      prevWinnerRef.current = game.winner.id;
    } else if (!game?.winner) {
      prevWinnerRef.current = null;
    }
  }, [game?.winner]);

  // =====================================
  // Init Ably
  // =====================================
  useEffect(() => {
    let isMounted = true;
    const initAbly = async () => {
      try {
        const response = await fetch("/api/ably-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: playerId }),
        });
        if (!response.ok) throw new Error("Token request failed");
        const tokenRequest = await response.json();

        const client = new Realtime({
          authCallback: (_, cb) => cb(null, tokenRequest),
        });

        client.connection.on("connected", () => {
          if (!isMounted) return;
          console.log("✅ Ably connected with clientId:", playerId);
          const channel = client.channels.get(`game:${roomId}`);
          channelRef.current = channel;
          setIsReady(true);
        });

        client.connection.on("failed", (err) => {
          console.error("Ably connection failed", err);
        });

        ablyRef.current = client;
      } catch (err) {
        console.error("Ably init error:", err);
      }
    };

    initAbly();

    return () => {
      isMounted = false;
      if (ablyRef.current) ablyRef.current.close();
      // Cleanup: stop any playing game start music when component unmounts
      stopSound(gameStartAudioRef.current);
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
      channel.publish("snapshot-request", { requesterId: playerId });
      // Fallback: se dopo 3 secondi non abbiamo ancora un gioco e non siamo spettatori,
      // e non ci sono altri giocatori, creiamo una nuova partita.
      setTimeout(() => {
        if (!gameRef.current && !isSpectator && snapshotRequested.current) {
          console.log("⚠️ Nessuno ha risposto, creo io la partita");
          const newGame = Game.start(roomId, [{ id: playerId, name: playerName }], 501);
          setGame(newGame);
          saveGameToLocalStorage(newGame);
          clearGameFromLocalStorage();
          channel.publish("snapshot", { snapshot: newGame.snapshot });
          // 🎮 Game start music (looping) – store reference to stop later
          if (!gameStartMusicStopped.current) {
            gameStartAudioRef.current = playSound(SOUND_GAME_START, true);
          }
        }
        snapshotRequested.current = false;
      }, 3000);
    };

    // =====================================
    // Presence
    // =====================================
    const onEnter = (msg: any) => {
      setPlayers((prev) => [...prev, { playerId: msg.data.playerId, playerName: msg.data.playerName }]);
    };
    const onLeave = (msg: any) => {
      setPlayers((prev) => prev.filter((p) => p.playerId !== msg.data.playerId));
    };

    channel.presence.subscribe("enter", onEnter);
    channel.presence.subscribe("leave", onLeave);
    channel.presence.enter({ playerId, playerName, isSpectator });

    // =====================================
    // Event Handlers (ogni modifica salva su localStorage)
    // =====================================
    const onThrow = (msg: any) => {
      if (!gameRef.current) return;
      const { playerId: throwerId, sector, multiplier, isMiss } = msg.data;
      try {
        const newGame = gameRef.current.recordThrow(throwerId, sector, multiplier, isMiss);
        setGame(newGame);
        saveGameToLocalStorage(newGame);
        // 🎯 Throw sound (plays for every throw, local or remote)
        if (multiplier == Multiplier.BULLSEYE || multiplier == Multiplier.DOUBLE_BULLSEYE) {
          playSound(NICE_DONE);
        } else if (isMiss) {
          playSound(SOUNDS_THROW[1]);
        } else {
          playSound(SOUNDS_THROW[Math.floor(Math.random() * SOUNDS_THROW.length)]);
        }

        // 🛑 Stop game start music on first throw of the entire game
        if (!gameStartMusicStopped.current && gameRef.current) {
          stopSound(gameStartAudioRef.current);
          gameStartMusicStopped.current = true;
        }
      } catch (err) {
        console.warn("Throw ignored", err);
      }
    };

    const onEndTurn = () => {
      if (!gameRef.current) return;
      const newGame = gameRef.current.endTurn();
      setGame(newGame);
      saveGameToLocalStorage(newGame);
    };

    const onAddPlayer = (msg: any) => {
      if (!gameRef.current) return;
      try {
        const newGame = gameRef.current.addPlayer(msg.data.playerName, msg.data.playerId);
        setGame(newGame);
        saveGameToLocalStorage(newGame);
        channel.publish("snapshot", { snapshot: newGame.snapshot });
      } catch (err) {
        console.warn("Add player ignored", err);
      }
    };

    const onSnapshotRequest = (msg: any) => {
      if (gameRef.current && msg.data.requesterId !== playerId) {
        channel.publish("snapshot", { snapshot: gameRef.current.snapshot, forClient: msg.data.requesterId });
      }
    };

    const onSnapshot = (msg: any) => {
      if (msg.data.forClient && msg.data.forClient !== playerId) return;
      const snapshot = msg.data.snapshot as GameSnapshot;
      const newGame = Game.fromState(snapshot);
      setGame(newGame);
      saveGameToLocalStorage(newGame);
      const playerInGame = snapshot.players.some((p) => p.id === playerId);
      if (!playerInGame && !isSpectator && !addedPlayer.current) {
        addedPlayer.current = true;
        channel.publish("add-player", { playerName, playerId });
      }
    };

    channel.subscribe("throw", onThrow);
    channel.subscribe("end-turn", onEndTurn);
    channel.subscribe("add-player", onAddPlayer);
    channel.subscribe("snapshot-request", onSnapshotRequest);
    channel.subscribe("snapshot", onSnapshot);

    // =====================================
    // Initialization
    // =====================================
    if (!isInitialized.current) {
      isInitialized.current = true;
      const init = async () => {
        const members = await channel.presence.get();
        const playersOnly = members.filter((m: any) => !m.data.isSpectator);

        if (playersOnly.length === 0 && !isSpectator) {
          const savedGame = loadGameFromLocalStorage();
          if (savedGame) {
            console.log("🔄 Restoring saved game");
            setGame(savedGame);
            gameRef.current = savedGame;
            channel.publish("snapshot", { snapshot: savedGame.snapshot });
            // Do not play start music for restored game
          } else {
            console.log("🆕 No saved game, creating new one");
            const newGame = Game.start(roomId, [{ id: playerId, name: playerName }], 501);
            setGame(newGame);
            saveGameToLocalStorage(newGame);
            clearGameFromLocalStorage();
            channel.publish("snapshot", { snapshot: newGame.snapshot });
            // 🎮 Game start music (looping) – store reference to stop later
            if (!gameStartMusicStopped.current) {
              gameStartAudioRef.current = playSound(SOUND_GAME_START, true);
            }
          }
        } else if (!isSpectator) {
          requestSnapshot();
        } else {
          requestSnapshot();
        }
      };
      init();
    }

    return () => {
      channel.presence.unsubscribe("enter", onEnter);
      channel.presence.unsubscribe("leave", onLeave);
      channel.unsubscribe("throw", onThrow);
      channel.unsubscribe("end-turn", onEndTurn);
      channel.unsubscribe("add-player", onAddPlayer);
      channel.unsubscribe("snapshot-request", onSnapshotRequest);
      channel.unsubscribe("snapshot", onSnapshot);
    };
  }, [isReady, roomId, playerId, playerName, isSpectator]);

  // Registra tiro
  const recordThrow = (sector: number | null, multiplier: Multiplier | null, isMiss: boolean) => {
    if (!gameRef.current || gameRef.current.winner) return;
    channelRef.current?.publish("throw", { playerId, sector, multiplier, isMiss });
  };

  // Registra fine turno
  const endTurn = () => {
    if (!gameRef.current) return;
    channelRef.current?.publish("end-turn", {});
  };

  return { game, recordThrow, endTurn, players, myName: playerName };
}
