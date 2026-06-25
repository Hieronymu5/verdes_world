export interface VersionInfo {
  version: string;
  lastUpdate: string;
}

export interface ClubStop {
  clubName: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  fromYear: number;
  toYear: number;
}

export interface Player {
  id: string;
  name: string;
  gamesPlayed: number;
  jerseyNumbers: number[];
  nationality: string;
  position: string;
  clubs: ClubStop[];
  wikipediaUrl?: string;
}

export interface DifficultyLevel {
  id: string;
  name: string;
  description: string;
  gameDurationSeconds: number;
  lives: number;
  revealPlayerAfterSeconds: number;
  /** Minimum number of games played required to be in the pool */
  minGamesPlayed: number;
}

export type GameStatus = 'difficulty' | 'playing' | 'game-over';

export interface GameState {
  status: GameStatus;
  selectedDifficulty: DifficultyLevel | null;
  currentPlayer: Player | null;
  remainingPlayers: Player[];
  allPlayers: Player[];
  score: number;
  lives: number;
  gameTimeRemaining: number;
  playerTimeElapsed: number;
  showTeamNames: boolean;
  showPlayerName: boolean;
  lastGuessResult: 'correct' | 'wrong' | null;
  easterEgg: 'stuver' | null;
}
