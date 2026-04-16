// app/api/ably-token/route.ts
import { NextResponse } from 'next/server';
import Ably from 'ably';

export async function POST(request: Request) {
  const { clientId } = await request.json();
  const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY! });
  const tokenRequest = await ably.auth.createTokenRequest({ clientId, ttl: 3600000 });
  return NextResponse.json(tokenRequest);
}