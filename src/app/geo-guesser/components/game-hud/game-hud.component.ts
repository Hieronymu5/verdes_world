import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';

@Component({
  selector: 'app-game-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-hud.component.html',
  styleUrl: './game-hud.component.css',
})
export class GameHudComponent {
  private readonly stateService = inject(GeoGuesserStateService);
  readonly state = this.stateService.state;

  readonly lives = computed(() => {
    const s = this.state();
    const max = s.selectedDifficulty?.lives ?? 3;
    return {
      remaining: Array.from({ length: s.lives }),
      lost: Array.from({ length: Math.max(0, max - s.lives) }),
    };
  });

  readonly timerDisplay = computed(() => {
    const secs = this.state().gameTimeRemaining;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  readonly isUrgent = computed(() => this.state().gameTimeRemaining <= 30);

  readonly playerTimerDisplay = computed(() => {
    const s = this.state();
    const limit = s.selectedDifficulty?.revealPlayerAfterSeconds ?? 30;
    const remaining = Math.max(0, limit - s.playerTimeElapsed);
    return remaining;
  });

  readonly hintCountdown = computed(() => {
    const s = this.state();
    const hint = s.selectedDifficulty?.showTeamNamesAfterSeconds ?? 5;
    if (s.showTeamNames) return null;
    const remaining = Math.max(0, hint - s.playerTimeElapsed);
    return remaining > 0 ? remaining : null;
  });
}
