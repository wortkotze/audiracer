export enum EngineType {
  ICE = 'Combustion',
  EV = 'Electric'
}

export interface CarStats {
  speed: number;    // Max speed cap
  handling: number; // Lateral movement speed
  accel: number;    // How fast it reaches max speed
}

export interface CarModel {
  id: string;
  name: string;
  type: EngineType;
  stats: CarStats;
  baseColor: string;
  description: string;
}

export interface GameState {
  screen: 'START' | 'LOGIN' | 'GARAGE' | 'LOBBY' | 'COUNTDOWN' | 'RACING' | 'GAMEOVER' | 'LEADERBOARD';
  score: number;
  distance: number;
  level: number;
  lives: number;
}

export interface PlayerConfig {
  carId: string;
  color: string;
  rims: string;
  lightSignature: string;
}

export interface GameOverStats {
  score: number;
  distance: number;
  killCount?: number;
  reason?: 'CRASH' | 'EMPTY_BATTERY' | 'EMPTY_FUEL';
}

export interface HighScoreEntry {
  id?: string;
  player_name: string;
  score: number;
  distance: number;
  created_at?: string;
  isNew?: boolean; // Internal flag for highlighting
}

export interface GeminiResponse {
  text: string;
}