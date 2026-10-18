import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomSummary } from "../lib/application/rooms/RoomSummary";

const POLL_MS = 5000;

/**
 * Elenco delle partite aperte, aggiornato ogni pochi secondi (in pausa quando la scheda è nascosta).
 * `playerId`: undefined = identità non ancora letta (non parte nulla); null = nessun id salvato.
 */
export function useRooms(playerId: string | null | undefined) {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (playerId === undefined) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const schedule = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      timer = setTimeout(load, POLL_MS);
    };

    async function load() {
      if (timer) clearTimeout(timer);
      controller?.abort();
      const mine = (controller = new AbortController());
      setRefreshing(true);
      try {
        const qs = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
        const res = await fetch(`/api/rooms${qs}`, { cache: "no-store", signal: mine.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { rooms?: RoomSummary[] };
        if (cancelled || controller !== mine) return;
        setRooms(Array.isArray(data.rooms) ? data.rooms : []);
        setError(false);
      } catch (err) {
        if (cancelled || controller !== mine || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(true);
      } finally {
        // Solo l'ultima richiesta aggiorna lo stato e riprogramma il polling (le annullate escono in silenzio)
        if (!cancelled && controller === mine) {
          setRefreshing(false);
          schedule();
        }
      }
    }

    loadRef.current = load;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
      else if (timer) clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onVisibility);
    void load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playerId]);

  const refresh = useCallback(() => void loadRef.current(), []);
  return { rooms, error, refreshing, refresh };
}
