import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';

interface ResourceLink {
  name: string;
  url: string;
}

interface ResourceCategory {
  category: string;
  links: ResourceLink[];
}

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
  readonly resources = signal<ResourceCategory[]>([]);

  async ngOnInit(): Promise<void> {
    if (!this.loaded() && !this.error()) {
      await this.dataService.load();
    }
    
    try {
      const response = await fetch('/data/resources.json');
      if (response.ok) {
        const data = await response.json();
        this.resources.set(data);
      }
    } catch (e) {
      console.error('Failed to load resources', e);
    }
  }
}
