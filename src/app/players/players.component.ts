import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
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

  readonly players = computed(() =>
    [...this.dataService.players()].sort((a, b) => b.gamesPlayed - a.gamesPlayed),
  );

  async ngOnInit(): Promise<void> {
    if (!this.loaded() && !this.error()) {
      await this.dataService.load();
    }
  }
}
