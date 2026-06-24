import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';

@Component({
  selector: 'app-players-debug',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './players-debug.component.html',
  styleUrl: './players-debug.component.css',
})
export class PlayersDebugComponent implements OnInit {
  private readonly dataService = inject(GeoGuesserDataService);

  readonly loaded = this.dataService.loaded;
  readonly error = this.dataService.error;

  readonly players = computed(() =>
    [...this.dataService.players()].sort((a, b) => b.gamesPlayed - a.gamesPlayed),
  );

  async ngOnInit(): Promise<void> {
    if (!this.loaded() && !this.error()) {
      await this.dataService.load();
    }
  }
}
