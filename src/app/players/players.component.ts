import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';

@Component({
  selector: 'app-players',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './players.component.html',
  styleUrl: './players.component.css',
})
export class PlayersComponent implements OnInit {
  private readonly dataService = inject(GeoGuesserDataService);

  readonly loaded = this.dataService.loaded;
  readonly error = this.dataService.error;

  readonly query = signal('');

  readonly players = computed(() =>
    [...this.dataService.players()].sort((a, b) => b.gamesPlayed - a.gamesPlayed),
  );

  readonly filteredPlayers = computed(() => {
    const q = this.query().trim();
    if (!q) return this.players();

    const normal = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const searchNum = parseInt(q, 10);

    return this.players().filter((p) => {
      if (!isNaN(searchNum) && p.jerseyNumbers.includes(searchNum)) return true;
      return normal(p.name).includes(normal(q));
    });
  });

  onSearchInput(value: string): void {
    this.query.set(value);
  }

  async ngOnInit(): Promise<void> {
    if (!this.loaded() && !this.error()) {
      await this.dataService.load();
    }
  }
}
