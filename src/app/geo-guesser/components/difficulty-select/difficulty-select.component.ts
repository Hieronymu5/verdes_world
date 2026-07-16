import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { GeoGuesserDataService } from '../../geo-guesser-data.service';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';
import { DifficultyLevel } from '../../geo-guesser.models';

@Component({
  selector: 'app-difficulty-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  templateUrl: './difficulty-select.component.html',
  styleUrl: './difficulty-select.component.css',
})
export class DifficultySelectComponent {
  private readonly dataService = inject(GeoGuesserDataService);
  private readonly stateService = inject(GeoGuesserStateService);

  readonly difficulties = this.dataService.difficulties;
  readonly allPlayers = this.dataService.players;

  readonly selectedIndex = signal(-1);
  private readonly difficultyButtons = viewChildren<ElementRef<HTMLButtonElement>>('difficultyBtn');

  private readonly defaultIndex = computed(() => {
    const levels = this.difficulties();
    if (!levels.length) return -1;

    const preferredId = this.stateService.lastSelectedDifficultyId() ?? 'easy';
    const preferredIdx = levels.findIndex((level) => level.id === preferredId);
    if (preferredIdx >= 0) return preferredIdx;

    const easyIdx = levels.findIndex((level) => level.id === 'easy');
    return easyIdx >= 0 ? easyIdx : 0;
  });

  constructor() {
    effect(() => {
      const idx = this.defaultIndex();
      if (idx < 0) return;
      this.selectedIndex.set(idx);
    });

    effect(() => {
      const idx = this.selectedIndex();
      const buttons = this.difficultyButtons();
      if (idx < 0 || idx >= buttons.length) return;

      setTimeout(() => buttons[idx]?.nativeElement.focus(), 0);
    });
  }

  poolStats(minGamesPlayed: number): number {
    const players = this.allPlayers();
    return players.filter((p) => p.gamesPlayed >= minGamesPlayed).length;
  }

  onCardClick(level: DifficultyLevel, index: number): void {
    this.selectedIndex.set(index);
    this.selectDifficulty(level);
  }

  onCardFocus(index: number): void {
    this.selectedIndex.set(index);
  }

  onDocumentKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const levels = this.difficulties();
    if (!levels.length) return;

    const target = event.target;
    const isDifficultyButton =
      target instanceof HTMLButtonElement && target.classList.contains('difficulty-card');

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.moveSelection(-1);
        break;

      case 'ArrowRight':
        event.preventDefault();
        this.moveSelection(1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-2);
        break;

      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(2);
        break;

      case 'Enter':
        if (isDifficultyButton) return;
        event.preventDefault();
        this.selectCurrentDifficulty();
        break;
    }
  }

  private moveSelection(delta: number): void {
    const levels = this.difficulties();
    if (!levels.length) return;

    const current = this.selectedIndex() >= 0 ? this.selectedIndex() : this.defaultIndex();
    const next = Math.max(0, Math.min(levels.length - 1, current + delta));
    this.selectedIndex.set(next);
  }

  private selectCurrentDifficulty(): void {
    const levels = this.difficulties();
    if (!levels.length) return;

    const idx = this.selectedIndex() >= 0 ? this.selectedIndex() : this.defaultIndex();
    const selectedLevel = levels[idx];
    if (!selectedLevel) return;

    this.selectDifficulty(selectedLevel);
  }

  private selectDifficulty(level: DifficultyLevel): void {
    this.stateService.startGame(level, this.dataService.players());
  }
}
