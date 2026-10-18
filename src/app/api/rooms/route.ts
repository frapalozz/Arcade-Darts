// app/api/rooms/route.ts
// Elenco delle partite aperte: enumera i canali `game:*` attivi (Ably REST) e ne legge la presenza.
// Richiede una chiave Ably con la capability "channel-metadata" (la root key ce l'ha).
import { NextResponse } from 'next/server';
import Ably from 'ably';
import { RawRoom, summarizeRooms } from '@/src/lib/application/rooms/RoomSummary';

export const dynamic = 'force-dynamic';

const PREFIX = 'game:';
const MAX_ROOMS = 40;
const CACHE_MS = 4000; // tutti i client della home condividono lo stesso risultato: Ably viene interrogato al massimo ogni 4s
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

let ably: InstanceType<typeof Ably.Rest> | null = null;
const getAbly = () => (ably ??= new Ably.Rest({ key: process.env.ABLY_API_KEY! }));

let cache: { at: number; rooms: RawRoom[] } | null = null;
let inflight: Promise<RawRoom[]> | null = null;

async function listChannelIds(client: InstanceType<typeof Ably.Rest>): Promise<string[]> {
  const res = await client.request('get', '/channels', 2, { prefix: PREFIX, by: 'id', limit: MAX_ROOMS });
  if (!res.success) throw new Error(res.errorMessage || `Ably responded ${res.statusCode}`);
  return (res.items as unknown[])
    .map((i) => (typeof i === 'string' ? i : (i as { channelId?: string } | null)?.channelId))
    .filter((id): id is string => typeof id === 'string' && id.startsWith(PREFIX))
    .slice(0, MAX_ROOMS);
}

async function readRoom(client: InstanceType<typeof Ably.Rest>, channelId: string): Promise<RawRoom> {
  const channel = client.channels.get(channelId);
  try {
    const page = await channel.presence.get({ limit: 100 });
    return {
      roomId: channelId.slice(PREFIX.length),
      members: page.items.map((m) => ({ clientId: m.clientId, data: m.data })),
    };
  } finally {
    try {
      client.channels.release(channelId); // non accumulare oggetti canale in memoria
    } catch {
      /* già rilasciato */
    }
  }
}

async function loadRooms(): Promise<RawRoom[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rooms;
  inflight ??= (async () => {
    try {
      const client = getAbly();
      const ids = await listChannelIds(client);
      const settled = await Promise.allSettled(ids.map((id) => readRoom(client, id)));
      const rooms = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      cache = { at: Date.now(), rooms };
      return rooms;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function GET(request: Request) {
  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const playerId = new URL(request.url).searchParams.get('playerId') ?? undefined;
  const viewerId = playerId && CLIENT_ID_RE.test(playerId) ? playerId : undefined;

  try {
    const rooms = summarizeRooms(await loadRooms(), viewerId);
    return NextResponse.json({ rooms }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api/rooms] impossibile leggere le partite da Ably:', err);
    return NextResponse.json({ error: 'Rooms unavailable' }, { status: 502 });
  }
}
