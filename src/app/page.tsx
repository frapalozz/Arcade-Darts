"use client";
import { Rocket, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const [lobbyId, setLobbyId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const router = useRouter();

  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    if (savedName) setPlayerName(savedName);
    else setPlayerName('');
  }, []);

  const saveNameAndNavigate = (roomId: string, mode?: string) => {
    if (!playerName.trim()) {
      alert("Inserisci un nome");
      return;
    }
    localStorage.setItem('playerName', playerName);
    const url = `/game/${roomId}${mode ? `?mode=${mode}` : ''}`;
    router.push(url);
  };

  const createGame = () => {
    if (!roomId.trim()) return;
    saveNameAndNavigate(roomId.trim());
  };

  const joinGame = () => {
    if (!lobbyId.trim()) return;
    saveNameAndNavigate(lobbyId.trim());
  };

  const spectator = () => {
    if (!lobbyId.trim()) return;
    saveNameAndNavigate(lobbyId.trim(), 'spectator');
  };

  return (
    <div className="">
      <main className="flex flex-col items-center justify-center min-h-screen gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="uppercase block text-primary text-5xl md:text-7xl italic tracking-tighter drop-shadow-[4px_4px_0px_#064200] text-center">
            Arcade Darts
          </h1>
          <p className="font-headline text-[10px] text-primary text-center">
            Insert a coin to start 🪙
          </p>
        </div>

        {/* Campo per il nome */}
        <div className="w-full max-w-md px-4">
          <div className="bg-neutral-900 border border-primary-container p-4 rounded">
            <label className="text-white text-xs uppercase block mb-1">Il tuo nome</label>
            <input 
              type="text" 
              className="bg-neutral-800 outline outline-primary text-primary px-2 text-sm w-full"
              placeholder="es. Mario"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
            />
            <p className="text-primary-dim text-[0.45rem] uppercase mt-1">Verrà mostrato agli altri giocatori</p>
          </div>
        </div>

        <div className="gap-4 grid grid-cols-2 grid-flow-col">
          <div className="h-full flex flex-col w-full border border-primary-container p-4 gap-2 max-w-75">
            <div className="text-white flex flex-row gap-2 items-center">
              <Rocket className="stroke-primary" /> 
              <p className="text-xs uppercase">Nuova_Partita</p>
            </div>
            <p className="text-primary-dim text-[0.45rem] uppercase">Crea una nuova lobby e invita giocatori a partecipare</p>
            <input 
              type="text" 
              className="bg-neutral-800 outline outline-primary text-primary px-2 text-sm" 
              placeholder="nome lobby"
              value={roomId}
              onChange={e => setRoomId(e.target.value)}
            />
            <button onClick={createGame} className="cursor-pointer bg-primary text-on-secondary text-xs p-3 w-full mt-auto">Crea</button>
          </div>

          <div className="h-full w-full border border-secondary-container p-4 gap-2 max-w-75 flex flex-col">
            <div className="text-white flex flex-row gap-2 items-center">
              <Unplug className="stroke-secondary" /> 
              <p className="text-xs uppercase">Partecipa</p>
            </div>
            <p className="text-[0.45rem] text-secondary-dim uppercase">enter_lobby_code</p>
            <input 
              type="text" 
              className="bg-neutral-800 outline outline-secondary text-secondary px-2 text-sm" 
              placeholder="codice lobby"
              value={lobbyId}
              onChange={e => setLobbyId(e.target.value)}
            />
            <button onClick={joinGame} className="cursor-pointer bg-secondary text-on-secondary text-xs p-3 w-full mt-auto">Partecipa</button>
            <button onClick={spectator} className="cursor-pointer bg-secondary-container text-on-secondary text-xs p-1 w-full mt-auto">Spettatore</button>
          </div>
        </div>
      </main>
    </div>
  );
}