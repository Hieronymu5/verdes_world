import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { DifficultyLevel, GameState, Player, WorldCupTeam } from './geo-guesser.models';

const INITIAL_STATE: GameState = {
  status: 'difficulty',
  selectedDifficulty: null,
  selectedWorldCupTeam: null,
  currentPlayer: null,
  remainingPlayers: [],
  allPlayers: [],
  score: 0,
  lives: 3,
  gameTimeRemaining: 120,
  playerTimeElapsed: 0,
  showTeamNames: false,
  showPlayerName: false,
  lastGuessResult: null,
  cGFhcwZWk: null,
};

@Injectable({ providedIn: 'root' })
export class GeoGuesserStateService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly _state = signal<GameState>(INITIAL_STATE);
  private readonly _lastSelectedDifficultyId = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  readonly lastSelectedDifficultyId = this._lastSelectedDifficultyId.asReadonly();

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private feedbackTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  startGame(difficulty: DifficultyLevel, players: Player[]): void {
    this._lastSelectedDifficultyId.set(difficulty.id);

    // Filter by minGamesPlayed
    const pool = players.filter((p) => p.gamesPlayed >= difficulty.minGamesPlayed);

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const [first, ...rest] = shuffled;

    this._state.set({
      status: 'playing',
      selectedDifficulty: difficulty,
      selectedWorldCupTeam: null,
      currentPlayer: first,
      remainingPlayers: rest,
      allPlayers: players,
      score: 0,
      lives: difficulty.lives,
      gameTimeRemaining: difficulty.gameDurationSeconds,
      playerTimeElapsed: 0,
      showTeamNames: false,
      showPlayerName: false,
      lastGuessResult: null,
      cGFhcwZWk: null,
    });

    this.startTimer();
  }

  /** Moves to the team-select screen; the World Cup roster is chosen next. */
  chooseWorldCupTeam(difficulty: DifficultyLevel): void {
    this._lastSelectedDifficultyId.set(difficulty.id);
    this._state.update((s) => ({ ...s, status: 'team-select', selectedDifficulty: difficulty }));
  }

  backToDifficultySelect(): void {
    this._state.update((s) => ({ ...s, status: 'difficulty' }));
  }

  startWorldCupGame(difficulty: DifficultyLevel, team: WorldCupTeam, players: Player[]): void {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const [first, ...rest] = shuffled;

    this._state.set({
      status: 'playing',
      selectedDifficulty: difficulty,
      selectedWorldCupTeam: team,
      currentPlayer: first,
      remainingPlayers: rest,
      allPlayers: players,
      score: 0,
      lives: difficulty.lives,
      gameTimeRemaining: difficulty.gameDurationSeconds,
      playerTimeElapsed: 0,
      showTeamNames: false,
      showPlayerName: false,
      lastGuessResult: null,
      cGFhcwZWk: null,
    });

    this.startTimer();
  }

  submitGuess(playerName: string): void {
    const state = this._state();
    if (state.status !== 'playing' || !state.currentPlayer || state.showPlayerName) return;

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const guess = normalize(playerName);
    const fullName = normalize(state.currentPlayer.name);
    const lastName = fullName.split(' ').at(-1) ?? fullName;

    let isCorrect =
      guess === fullName ||
      guess === lastName ||
      (guess.length > 3 && fullName.includes(guess));

    let isStuvercGFhcwZWk = false;
    if (state.currentPlayer.id === 'brad-stuver' && /^stuu+$/.test(guess)) {
      isCorrect = true;
      isStuvercGFhcwZWk = true;
    }

    if (isCorrect) {
      // Reveal the correct name briefly, then advance after 1.5 s
      this._state.update((s) => ({
        ...s,
        score: s.score + 1,
        showPlayerName: true,
        showTeamNames: true,
        lastGuessResult: 'correct',
        cGFhcwZWk: isStuvercGFhcwZWk ? 'stuver' : null,
      }));

      if (this.feedbackTimeoutId) clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = setTimeout(() => {
        this._state.update((s) => {
          if (s.status !== 'playing' || !s.showPlayerName) return s;
          return this.buildNextPlayerState({ ...s, lastGuessResult: null, cGFhcwZWk: null });
        });
      }, 1500);
    } else {
      const newLives = state.lives - 1;

      if (newLives <= 0) {
        this.stopTimer();
        this._state.update((s) => ({
          ...s,
          lives: 0,
          showPlayerName: true,
          showTeamNames: true,
          lastGuessResult: 'wrong',
        }));

        if (this.feedbackTimeoutId) clearTimeout(this.feedbackTimeoutId);
        this.feedbackTimeoutId = setTimeout(() => {
          this._state.update((s) => {
            if (s.status !== 'playing' || !s.showPlayerName) return s;
            return { ...s, status: 'game-over' };
          });
        }, 2000);
        return;
      }

      // Reveal the correct name, then auto-advance after 2 s
      this._state.update((s) => ({
        ...s,
        lives: newLives,
        showPlayerName: true,
        showTeamNames: true,
        lastGuessResult: 'wrong',
      }));

      if (this.feedbackTimeoutId) clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = setTimeout(() => {
        this._state.update((s) => {
          if (s.status !== 'playing' || !s.showPlayerName) return s;
          return this.buildNextPlayerState({ ...s, lastGuessResult: null, cGFhcwZWk: null });
        });
      }, 2000);
    }
  }

  reset(): void {
    this.stopTimer();
    this._state.set(INITIAL_STATE);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private startTimer(): void {
    this.stopTimer();
    this.intervalId = setInterval(() => {
      this._state.update((state) => {
        if (state.status !== 'playing') return state;

        const newGameTime = state.showPlayerName ? state.gameTimeRemaining : state.gameTimeRemaining - 1;
        const newPlayerTime = state.playerTimeElapsed + 1;
        const diff = state.selectedDifficulty!;

        if (newGameTime <= 0) {
          this.stopTimer();
          if (this.feedbackTimeoutId) clearTimeout(this.feedbackTimeoutId);
          this.feedbackTimeoutId = setTimeout(() => {
            this._state.update((s) => {
              if (s.status !== 'playing' || !s.showPlayerName) return s;
              return { ...s, status: 'game-over' };
            });
          }, 2000);
          return {
            ...state,
            showPlayerName: true,
            showTeamNames: true,
            gameTimeRemaining: 0,
          };
        }

        // Time expired for this player — reveal name and deduct a life
        if (!state.showPlayerName && newPlayerTime >= diff.revealPlayerAfterSeconds) {
          const newLives = state.lives - 1;
          if (newLives <= 0) {
            this.stopTimer();
            if (this.feedbackTimeoutId) clearTimeout(this.feedbackTimeoutId);
            this.feedbackTimeoutId = setTimeout(() => {
              this._state.update((s) => {
                if (s.status !== 'playing' || !s.showPlayerName) return s;
                return { ...s, status: 'game-over' };
              });
            }, 2000);
            return {
              ...state,
              lives: 0,
              showPlayerName: true,
              showTeamNames: true,
              gameTimeRemaining: newGameTime,
            };
          }
          return {
            ...state,
            lives: newLives,
            showPlayerName: true,
            showTeamNames: true,
            playerTimeElapsed: newPlayerTime,
            gameTimeRemaining: newGameTime,
          };
        }

        // Auto-advance 3 s after revealing player name
        if (state.showPlayerName && newPlayerTime >= diff.revealPlayerAfterSeconds + 3) {
          return this.buildNextPlayerState({
            ...state,
            gameTimeRemaining: newGameTime,
          });
        }

        return {
          ...state,
          gameTimeRemaining: newGameTime,
          playerTimeElapsed: newPlayerTime,
        };
      });
    }, 1000);
  }

  private buildNextPlayerState(state: GameState): GameState {
    let pool = state.remainingPlayers;

    if (pool.length === 0) {
      // Reshuffle full set when we run out
      pool = [...state.allPlayers].sort(() => Math.random() - 0.5);
    }

    const [next, ...rest] = pool;
    return {
      ...state,
      currentPlayer: next,
      remainingPlayers: rest,
      playerTimeElapsed: 0,
      showTeamNames: false,
      showPlayerName: false,
      lastGuessResult: null,
      cGFhcwZWk: null,
    };
  }

  private stopTimer(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
