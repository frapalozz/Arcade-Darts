// app/api/ably-token/route.ts
import { NextResponse } from 'next/server';
import Ably from 'ably';

export async function POST(request: Request) {
  const { clientId } = await request.json();
  const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY! });
  
  // Definisci le capabilities per questo token
  // Concede accesso a TUTTI i canali che iniziano con "game:"
  const capabilities = {
    "game:*": ["publish", "subscribe", "presence"]
  };
  
  const tokenParams = {
    clientId: clientId,
    capability: JSON.stringify(capabilities),
    ttl: 3600000 // 1 ora
  };
  
  const tokenRequest = await ably.auth.createTokenRequest(tokenParams);
  console.log(tokenRequest)
  return NextResponse.json(tokenRequest);
}