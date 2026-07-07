import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';
import { Player } from '../../geo-guesser.models';

@Component({
  selector: 'app-player-guess',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './player-guess.component.html',
  styleUrl: './player-guess.component.css',
})
export class PlayerGuessComponent {
  private readonly stateService = inject(GeoGuesserStateService);

  readonly state = this.stateService.state;
  readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputRef');

  /** Tracks the active player ID — the effect re-runs only when this changes. */
  private readonly _currentPlayerId = computed(() => this.state().currentPlayer?.id ?? null);

  constructor() {
    // Focus the input whenever a new player is presented.
    // untracked() reads the full state snapshot without adding it as a
    // reactive dependency, so this effect is scoped to player-ID changes only.
    effect(() => {
      const playerId = this._currentPlayerId();
      if (!playerId) return;

      const st = untracked(this.state);
      if (st.status === 'playing' && !st.showPlayerName) {
        // Defer one tick so Angular has rendered the input before focusing.
        setTimeout(() => this.inputRef()?.nativeElement.focus(), 0);
      }
    });
  }

  readonly inputValue = signal('');
  readonly showDropdown = signal(false);
  readonly highlightedIndex = signal(-1);

  readonly suggestions = computed((): Player[] => {
    const val = this.inputValue().trim();
    if (val.length < 2) return [];

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const q = normalize(val);
    const matches = this.state().allPlayers.filter((p) => normalize(p.name).includes(q));

    matches.sort((a, b) => {
      const aName = normalize(a.name);
      const bName = normalize(b.name);
      const aStarts = aName.startsWith(q) || aName.includes(' ' + q) ? 1 : 0;
      const bStarts = bName.startsWith(q) || bName.includes(' ' + q) ? 1 : 0;
      return bStarts - aStarts;
    });

    return matches.slice(0, 8);
  });

  onInput(value: string): void {
    this.inputValue.set(value);
    this.showDropdown.set(true);
    // Auto-highlight the first match so Enter immediately confirms it.
    // suggestions() recomputes synchronously after inputValue is updated.
    this.highlightedIndex.set(this.suggestions().length > 0 ? 0 : -1);
  }

  onKeydown(event: KeyboardEvent): void {
    const sug = this.suggestions();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex.update((i) => Math.min(i + 1, sug.length - 1));
        this.showDropdown.set(true);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex.update((i) => Math.max(i - 1, -1));
        break;

      case 'Enter':
        event.preventDefault();
        this.submitFromInput();
        break;

      case 'Escape':
        this.showDropdown.set(false);
        this.highlightedIndex.set(-1);
        break;
    }
  }

  selectSuggestion(player: Player): void {
    this.submit(player.name);
  }

  onBlur(): void {
    // Delay so click on dropdown item fires first
    setTimeout(() => this.showDropdown.set(false), 150);
  }

  submitFromInput(): void {
    const idx = this.highlightedIndex();
    const sug = this.suggestions();
    const rawVal = this.inputValue().trim();

    // Bypass auto-pick for Brad Stuver cGFhcw ZWk
    if (this._currentPlayerId() === 'brad-stuver' && /^stuu+$/i.test(rawVal)) {
      this.submit(rawVal);
      return;
    }

    if (idx >= 0 && idx < sug.length) {
      // User explicitly navigated to a suggestion with arrow keys
      this.submit(sug[idx].name);
    } else if (sug.length > 0) {
      // No explicit selection — auto-pick the top match
      this.submit(sug[0].name);
    } else if (rawVal) {
      // No matches at all — submit raw input (will register as a wrong guess)
      this.submit(rawVal);
    }
  }

  private submit(name: string): void {
    this.stateService.submitGuess(name);
    this.inputValue.set('');
    this.showDropdown.set(false);
    this.highlightedIndex.set(-1);

    if (!this.state().showPlayerName) {
      this.inputRef()?.nativeElement.focus();
    }
  }
}
