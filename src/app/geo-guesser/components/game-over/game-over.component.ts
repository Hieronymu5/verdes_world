import { AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';

@Component({
  selector: 'app-game-over',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.enter)': 'onEnterKey($event)',
  },
  templateUrl: './game-over.component.html',
  styleUrl: './game-over.component.css',
})
export class GameOverComponent implements AfterViewInit {
  private readonly stateService = inject(GeoGuesserStateService);
  readonly state = this.stateService.state;
  readonly playAgainBtnRef = viewChild<ElementRef<HTMLButtonElement>>('playAgainBtnRef');

  readonly outOfLives = computed(() => this.state().lives === 0);

  readonly timePlayed = computed(() => {
    const s = this.state();
    const total = s.selectedDifficulty?.gameDurationSeconds ?? 120;
    const used = total - s.gameTimeRemaining;
    const m = Math.floor(used / 60);
    const sec = used % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  });

  readonly rating = computed(() => {
    const score = this.state().score;
    if (score >= 20) return { label: 'Legendary 🏆', color: '#fbbf24' };
    if (score >= 12) return { label: 'Los Verdes Elite ⚽', color: '#00b140' };
    if (score >= 6)  return { label: 'Verde Supporter 🌿', color: '#4ade80' };
    if (score >= 2)  return { label: 'Apprentice Verdes 🌱', color: '#7ab398' };
    return { label: 'Keep Practicing 💪', color: '#94a3b8' };
  });

  ngAfterViewInit(): void {
    // Keep keyboard flow smooth: Enter works immediately when Game Over appears.
    setTimeout(() => this.playAgainBtnRef()?.nativeElement.focus(), 0);
  }

  onEnterKey(event: Event): void {
    if (!(event instanceof KeyboardEvent) || event.defaultPrevented) return;

    const target = event.target;
    // Let the native button behavior fire when it already has focus.
    if (target instanceof HTMLButtonElement && target.classList.contains('play-again-btn')) {
      return;
    }

    event.preventDefault();
    this.playAgain();
  }

  playAgain(): void {
    this.stateService.reset();
  }
}
