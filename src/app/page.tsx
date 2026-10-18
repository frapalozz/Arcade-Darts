"use client";
import { Rocket, Unplug, Eye, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
import slugify from 'slugify'
import { storage } from '@/utils/storage';
import RoomList from '@/src/components/RoomList';

const toSlug = (value: string) =>
  slugify(value.trim(), { lower: true, trim: true, replacement: "-" });

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const [lobbyId, setLobbyId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // undefined = non ancora letto (lato server/primo render); null = nessun id salvato
  const [storedPlayerId, setStoredPlayerId] = useState<string | null | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    const savedName = storage.getItem('playerName');
    if (savedName) setPlayerName(savedName);
    setStoredPlayerId(storage.getItem('playerId'));
  }, []);

  const saveNameAndNavigate = (slug: string, mode?: string) => {
    if (!slug) {
      setError("Il nome della lobby contiene solo caratteri non validi.");
      return;
    }
    if (!playerName.trim()) {
      setError("Inserisci il tuo nome per giocare.");
      // Chi preme "Partecipa" dalla lista in fondo alla pagina deve vedere subito cosa manca
      document.getElementById('player-name')?.focus();
      return;
    }
    setError(null);
    storage.setItem('playerName', playerName.trim());
    router.push(`/game/${slug}${mode ? `?mode=${mode}` : ''}`);
  };

  const createGame = (e: FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return setError("Dai un nome alla nuova lobby.");
    saveNameAndNavigate(toSlug(roomId));
  };

  const joinGame = (e: FormEvent) => {
    e.preventDefault();
    if (!lobbyId.trim()) return setError("Inserisci il codice della lobby.");
    saveNameAndNavigate(toSlug(lobbyId));
  };

  const spectator = () => {
    if (!lobbyId.trim()) return setError("Inserisci il codice della lobby.");
    saveNameAndNavigate(toSlug(lobbyId), 'spectator');
  };

  const joinFromList = (slug: string) => saveNameAndNavigate(slug);
  const watchFromList = (slug: string) => saveNameAndNavigate(slug, 'spectator');

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 sm:gap-8 px-4 pt-safe pb-safe py-8 w-full max-w-4xl mx-auto">
      {/* Titolo */}
      <header className="flex flex-col items-center gap-3 sm:gap-4 text-center">
        <span className="text-4xl sm:text-5xl" aria-hidden>🎯</span>
        <h1 className="uppercase font-headline text-primary italic tracking-tighter leading-tight text-[clamp(1.35rem,7vw,4.25rem)] text-glow-primary drop-shadow-[3px_3px_0px_#064200]">
          Arcade Darts
        </h1>
        <p className="font-headline text-[10px] sm:text-xs text-tertiary text-glow-tertiary animate-blink">
          Insert a coin to start 🪙
        </p>
      </header>

      {/* Nome giocatore */}
      <section className="w-full max-w-md">
        <label
          htmlFor="player-name"
          className="flex items-center gap-2 font-headline text-[10px] sm:text-xs uppercase text-on-surface mb-2"
        >
          <User size={14} className="stroke-primary shrink-0" aria-hidden />
          Il tuo nome
        </label>
        <div className="bg-surface-container border-2 border-primary-container glow-primary p-3 sm:p-4">
          <input
            id="player-name"
            type="text"
            autoComplete="nickname"
            enterKeyHint="done"
            className="w-full min-h-12 bg-black/60 border border-primary/40 focus:border-primary focus:outline-none text-primary font-headline text-sm px-3 placeholder:text-primary/30"
            placeholder="es. Mario"
            value={playerName}
            maxLength={8}
            onChange={e => { setPlayerName(e.target.value); setError(null); }}
          />
          <p className="text-on-surface-variant text-xs mt-2">
            Verrà mostrato agli altri giocatori (max 8 caratteri)
          </p>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="w-full max-w-md border-2 border-error bg-error-container/20 text-on-error-container text-sm px-3 py-2 animate-shake"
        >
          ⚠ {error}
        </p>
      )}

      {/* Crea / Partecipa: una colonna su mobile, due da md in su */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <form
          onSubmit={createGame}
          className="flex flex-col gap-3 bg-surface-container border-2 border-primary-container glow-primary p-4 sm:p-5"
        >
          <div className="flex items-center gap-3">
            <Rocket className="stroke-primary shrink-0" aria-hidden />
            <h2 className="font-headline text-xs sm:text-sm uppercase">Nuova partita</h2>
          </div>
          <p className="text-primary-dim text-xs sm:text-sm">
            Crea una nuova lobby e invita altri giocatori a partecipare.
          </p>
          <input
            type="text"
            aria-label="Nome della lobby"
            className="min-h-12 bg-black/60 border border-primary/40 focus:border-primary focus:outline-none text-primary text-sm px-3 placeholder:text-primary/30"
            placeholder="nome lobby"
            value={roomId}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={e => { setRoomId(e.target.value); setError(null); }}
          />
          <button
            type="submit"
            className="mt-auto min-h-12 bg-primary text-on-primary-fixed font-headline text-xs uppercase hover:bg-primary-fixed active:translate-y-0.5 transition shadow-[0_4px_0_0_#064200]"
          >
            Crea
          </button>
        </form>

        <form
          onSubmit={joinGame}
          className="flex flex-col gap-3 bg-surface-container border-2 border-secondary-container glow-secondary p-4 sm:p-5"
        >
          <div className="flex items-center gap-3">
            <Unplug className="stroke-secondary shrink-0" aria-hidden />
            <h2 className="font-headline text-xs sm:text-sm uppercase">Partecipa</h2>
          </div>
          <p className="text-secondary-dim text-xs sm:text-sm">
            Inserisci il codice della lobby per entrare in gioco o guardare.
          </p>
          <input
            type="text"
            aria-label="Codice della lobby"
            className="min-h-12 bg-black/60 border border-secondary/40 focus:border-secondary focus:outline-none text-secondary text-sm px-3 placeholder:text-secondary/30"
            placeholder="codice lobby"
            value={lobbyId}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={e => { setLobbyId(e.target.value); setError(null); }}
          />
          <div className="mt-auto flex flex-col gap-2">
            <button
              type="submit"
              className="min-h-12 bg-secondary text-on-secondary-fixed font-headline text-xs uppercase hover:brightness-110 active:translate-y-0.5 transition shadow-[0_4px_0_0_#920091]"
            >
              Partecipa
            </button>
            <button
              type="button"
              onClick={spectator}
              className="min-h-11 flex items-center justify-center gap-2 border-2 border-secondary-container text-secondary font-headline text-[10px] uppercase hover:bg-secondary-container/30 transition"
            >
              <Eye size={14} aria-hidden /> Spettatore
            </button>
          </div>
        </form>
      </div>

      {/* Partite in attesa / in corso */}
      <RoomList playerId={storedPlayerId} onJoin={joinFromList} onWatch={watchFromList} />
    </main>
  );
}
