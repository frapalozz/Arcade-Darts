import { Throw } from "@/src/lib/domain/game/Turn.valueObject";

// lib/application/game/dto/GameStateDto.ts
export interface GameStateDto {
  id: string;
  players: { id: string; name: string; score: number }[];
  currentPlayerId: string;
  currentTurnThrows: Throw[];
  winner: { id: string; name: string } | null;
  startingScore: number;
}