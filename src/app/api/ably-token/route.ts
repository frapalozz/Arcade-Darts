// app/api/ably-token/route.ts
import { NextResponse } from 'next/server';
import Ably from 'ably';

// Un solo client REST per istanza invece di uno per richiesta
let ably: InstanceType<typeof Ably.Rest> | null = null;
const getAbly = () => (ably ??= new Ably.Rest({ key: process.env.ABLY_API_KEY! }));

// Solo canali di gioco; il client può essere chiamato spesso (ogni riconnessione richiede un token nuovo)
const CAPABILITY = JSON.stringify({ 'game:*': ['publish', 'subscribe', 'presence'] });
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(request: Request) {
  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let clientId: unknown;
  try {
    ({ clientId } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) {
    return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 });
  }

  try {
    const tokenRequest = await getAbly().auth.createTokenRequest({
      clientId,
      capability: CAPABILITY,
      ttl: 60 * 60 * 1000, // 1 ora: alla scadenza l'SDK richiede un nuovo token da solo
    });
    return NextResponse.json(tokenRequest, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Token creation failed' }, { status: 502 });
  }
}
