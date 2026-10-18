"use client";
import GameComponent from "@/src/components/GameComponent";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { generateUUID } from "@/utils/uuid";
import { storage } from "@/utils/storage";

export default function GamePage() {
    const params = useParams<{ roomId: string | string[] }>();
    const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
    const searchParams = useSearchParams();
    const router = useRouter();
    const isSpectatorParam = searchParams.get("mode") === "spectator";

    // Identità letta una sola volta dopo il mount (localStorage non esiste lato server)
    const [identity, setIdentity] = useState<{ playerId: string; playerName: string } | null>(null);

    useEffect(() => {
        const storedName = storage.getItem("playerName");
        if (!storedName) {
            // Nessun nome impostato: torna alla home
            router.replace("/");
            return;
        }
        let storedId = storage.getItem("playerId");
        if (!storedId) {
            storedId = generateUUID();
            storage.setItem("playerId", storedId);
        }
        setIdentity({ playerId: storedId, playerName: storedName });
    }, [router]);

    if (!identity) {
        return (
            <div className="flex-1 flex items-center justify-center p-6">
                <p className="font-headline text-xs text-primary text-glow-primary animate-blink">Caricamento...</p>
            </div>
        );
    }

    return (
        <GameComponent
            roomId={roomId}
            playerName={identity.playerName}
            playerId={identity.playerId}
            isSpectator={isSpectatorParam}
        />
    );
}
