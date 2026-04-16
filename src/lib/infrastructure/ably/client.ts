// lib/infrastructure/ably/client.ts
import { Realtime } from 'ably';

let cachedClient: Realtime | null = null;

export async function getAblyClient(): Promise<Realtime> {
  if (cachedClient) return cachedClient;
  const res = await fetch('/api/ably-token', {
    method: 'POST',
    body: JSON.stringify({ clientId: 'server' })
  });
  const tokenRequest = await res.json();
  cachedClient = new Realtime({ authCallback: (_, cb) => cb(null, tokenRequest) });
  return cachedClient;
}