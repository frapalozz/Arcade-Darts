import { useCallback, useEffect, useRef, useState } from "react";
import { Realtime } from "ably";
import { Game } from "../lib/domain/game/Game.aggregate";
import { Multiplier } from "../lib/domain/game/Turn.valueObject";
import { storage } from "@/utils/storage";
import { LocalGameStore } from "../lib/infrastructure/persistence/LocalGameStore";
import {
  GameSyncEngine,
  ChannelLike,
  ConnectionLike,
  SyncStatus,
} from "../lib/infrastructure/sync/GameSyncEngine";
import { playSound, preloadSounds, stopSound } from "../lib/infrastructure/audio/SoundPlayer";

const SOUND_GAME_START = "/sounds/game-start.mp3";
const SOUNDS_THROW = [
  "/sounds/throw.mp3",
  "/sounds/throw2.mp3",
  "/sounds/throw3.mp3",
  "/sounds/kame.mp3",
  "/sounds/mario.mp3",
  "/sounds/ooo.mp3",
  "/sounds/tsts.mp3",
  "/sounds/catush.mp3",
  "/sounds/ee.mp3",
];
const SOUND_MISS = SOUNDS_THROW[1];
const NICE_DONE = "/sounds/nice-done.mp3";
const SOUND_WINNER = "/sounds/winner.mp3";

export interface ConnectedPlayer {
  playerId: string;
  playerName: string;
  isSpectator: boolean;
}

const INITIAL_STATUS: SyncStatus = { connection: "connecting", pending: 0, synced: false };

export function useGameSync(roomId: string, playerId: string, playerName: string, isSpectator: boolean = false) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<ConnectedPlayer[]>([]);
  const [status, setStatus] = useState<SyncStatus>(INITIAL_STATUS);

  const engineRef = useRef<GameSyncEngine | null>(null);
  const startMusicRef = useRef<HTMLAudioElement | null>(null);

  // Suoni: file leggeri, precaricati a browser idle
  useEffect(() => {
    preloadSounds([...SOUNDS_THROW.slice(0, 3), NICE_DONE, SOUND_WINNER]);
  }, []);

  // =====================================
  // Motore di sincronizzazione (Ably + salvataggio locale + coda offline)
  // =====================================
  useEffect(() => {
    setGame(null);
    setPlayers([]);
    setStatus(INITIAL_STATUS);

    // authCallback ad ogni (ri)connessione: richiede un token NUOVO. In precedenza veniva riusato sempre lo
    // stesso tokenRequest, che dopo una riconnessione o la scadenza veniva rifiutato.
    const client = new Realtime({
      clientId: playerId,
      authCallback: async (_params, callback) => {
        try {
          const res = await fetch("/api/ably-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: playerId }),
          });
          if (!res.ok) throw new Error(`Token request failed (${res.status})`);
          callback(null, await res.json());
        } catch (err) {
          callback(err instanceof Error ? err.message : "Token request failed", null);
        }
      },
    });

    const engine = new GameSyncEngine({
      roomId,
      playerId,
      playerName,
      isSpectator,
      channel: client.channels.get(`game:${roomId}`) as unknown as ChannelLike,
      connection: client.connection as unknown as ConnectionLike,
      store: new LocalGameStore(roomId, storage),
      handlers: {
        onGame: setGame,
        onPlayers: setPlayers,
        onStatus: setStatus,
        onEffect: (e) => {
          if (e.type === "game-created") {
            // 🎮 musica d'attesa in loop finché non parte il primo tiro (se il browser lo consente)
            if (!startMusicRef.current) startMusicRef.current = playSound(SOUND_GAME_START, true);
            return;
          }
          if (startMusicRef.current) {
            stopSound(startMusicRef.current);
            startMusicRef.current = null;
          }
          if (e.multiplier === Multiplier.BULLSEYE || e.multiplier === Multiplier.DOUBLE_BULLSEYE) {
            playSound(NICE_DONE);
          } else if (e.isMiss) {
            playSound(SOUND_MISS);
          } else {
            playSound(SOUNDS_THROW[Math.floor(Math.random() * SOUNDS_THROW.length)]);
          }
        },
      },
    });
    engineRef.current = engine;
    engine.start();

    // Eventi del browser: riconnessione immediata quando torna la rete o la scheda torna visibile,
    // salvataggio sincrono quando la pagina viene nascosta/chiusa.
    const onOnline = () => engine.setNetworkOnline(true);
    const onOffline = () => engine.setNetworkOnline(false);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") engine.persistNow();
      else engine.reconnectNow();
    };
    const onPageHide = () => engine.persistNow();
    if (typeof navigator !== "undefined" && navigator.onLine === false) engine.setNetworkOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      engine.stop();
      engineRef.current = null;
      stopSound(startMusicRef.current);
      startMusicRef.current = null;
      // Chiudere un client Ably ancora in connessione (tipico del doppio mount di StrictMode in sviluppo) fa
      // rifiutare alcune promise interne dell'SDK che non sono raggiungibili dal nostro codice: le intercettiamo
      // solo per il breve tempo della chiusura, filtrando esattamente quel messaggio.
      const swallowClose = (ev: PromiseRejectionEvent) => {
        const msg = (ev.reason && (ev.reason.message ?? String(ev.reason))) || "";
        if (/connection closed/i.test(msg)) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
        }
      };
      window.addEventListener("unhandledrejection", swallowClose, true);
      setTimeout(() => window.removeEventListener("unhandledrejection", swallowClose, true), 2000);
      try {
        client.close();
      } catch {
        /* già chiuso */
      }
    };
  }, [roomId, playerId, playerName, isSpectator]);

  // 👑 Suono + coriandoli quando qualcuno vince durante questa sessione (una sola volta per vincitore).
  // Una partita già conclusa che viene solo riaperta/ripristinata non rifà la festa.
  // canvas-confetti viene caricato solo al momento della vittoria.
  const winnerId = game?.winnerId ?? null;
  const hasGame = game !== null;
  const celebratedRef = useRef<string | null>(null);
  const seenGameRef = useRef(false);
  useEffect(() => {
    if (!hasGame) {
      seenGameRef.current = false;
      celebratedRef.current = null;
      return;
    }
    const firstState = !seenGameRef.current;
    seenGameRef.current = true;
    if (!winnerId) {
      celebratedRef.current = null;
      return;
    }
    if (celebratedRef.current === winnerId) return;
    celebratedRef.current = winnerId;
    if (firstState) return;
    playSound(SOUND_WINNER);
    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        startVelocity: 20,
        colors: ["#ffd700", "#ff6347", "#00ff7f", "#1e90ff"],
      });
      setTimeout(() => {
        confetti({ particleCount: 100, spread: 100, origin: { y: 0.5, x: 0.3 }, startVelocity: 25 });
        confetti({ particleCount: 100, spread: 100, origin: { y: 0.5, x: 0.7 }, startVelocity: 25 });
      }, 200);
    });
  }, [winnerId, hasGame]);

  const recordThrow = useCallback(
    (sector: number | null, multiplier: Multiplier | null, isMiss: boolean) =>
      engineRef.current?.recordThrow(sector, multiplier, isMiss),
    []
  );
  const endTurn = useCallback(() => engineRef.current?.endTurn(), []);

  return { game, recordThrow, endTurn, players, myName: playerName, status };
}
