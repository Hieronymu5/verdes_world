import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GeoGuesserDataService } from '../../geo-guesser/geo-guesser-data.service';
import { WorldMapComponent } from '../../geo-guesser/components/world-map/world-map.component';
import { Player } from '../../geo-guesser/geo-guesser.models';

@Component({
  selector: 'app-player-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WorldMapComponent, RouterLink],
  templateUrl: './player-detail.component.html',
  styleUrl: './player-detail.component.css'
})
export class PlayerDetailComponent implements OnInit {
  private readonly dataService = inject(GeoGuesserDataService);
  private readonly route = inject(ActivatedRoute);

  readonly loaded = this.dataService.loaded;
  readonly error = this.dataService.error;

  readonly playerId = computed(() => this.route.snapshot.paramMap.get('player-id'));
  
  readonly player = computed<Player | null>(() => {
    const id = this.playerId();
    if (!id) return null;
    return this.dataService.players().find(p => p.id === id) || null;
  });

  async ngOnInit(): Promise<void> {
    if (!this.loaded() && !this.error()) {
      await this.dataService.load();
    }
  }
}
