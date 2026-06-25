import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';

@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit {
  private readonly dataService = inject(GeoGuesserDataService);

  readonly allPlayers = this.dataService.players;
  readonly versionInfo = this.dataService.versionInfo;
  readonly loaded = this.dataService.loaded;
  readonly error = this.dataService.error;
  readonly resources = this.dataService.resources;

  async ngOnInit(): Promise<void> {
    if (!this.loaded() && !this.error()) {
      await this.dataService.load();
    }
  }
}
