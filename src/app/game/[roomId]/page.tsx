"use client";
import GameComponent from "@/src/components/GameComponent";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { generateUUID } from "@/utils/uuid";

export default function GamePage() {
    const { roomId } = useParams();
    const searchParams = useSearchParams();
    const isSpectatorParam = searchParams.get("mode") === "spectator";
    
    const [playerName, setPlayerName] = useState('');
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let storedId = localStorage.getItem('playerId');
        if (!storedId) {
            storedId = generateUUID();
            localStorage.setItem('playerId', storedId);
        }
        setPlayerId(storedId);

        const storedName = localStorage.getItem('playerName');
        if (storedName) {
            setPlayerName(storedName);
            setIsReady(true);
        } else {
            // Nessun nome impostato: torna alla home
            window.location.href = '/';
        }
    }, []);

    if (!isReady || !playerId) {
        return <div className="text-white">Caricamento...</div>;
    }

    return <GameComponent 
        roomId={roomId as string} 
        playerName={playerName} 
        playerId={playerId} 
        isSpectator={isSpectatorParam} 
    />;
}