import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GeoGuesserDataService } from '../../geo-guesser/geo-guesser-data.service';
import { WorldMapComponent } from '../../geo-guesser/components/world-map/world-map.component';
import { Player } from '../../geo-guesser/geo-guesser.models';
import { SvgGifExportService } from '../../global/svg-gif-export.service';

@Component({
  selector: 'app-player-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WorldMapComponent, RouterLink],
  templateUrl: './player-detail.component.html',
  styleUrl: './player-detail.component.css',
})
export class PlayerDetailComponent implements OnInit {
  private readonly dataService = inject(GeoGuesserDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly gifExport = inject(SvgGifExportService);
  private readonly map = viewChild(WorldMapComponent);

  readonly loaded = this.dataService.loaded;
  readonly error = this.dataService.error;
  readonly exportingGif = signal(false);
  readonly gifExportError = signal<string | null>(null);

  readonly playerId = computed(() => this.route.snapshot.paramMap.get('player-id'));

  readonly player = computed<Player | null>(() => {
    const id = this.playerId();
    if (!id) return null;
    return this.dataService.players().find((p) => p.id === id) || null;
  });

  async ngOnInit(): Promise<void> {
    if (!this.loaded() && !this.error()) {
      await this.dataService.load();
    }
  }

  async downloadGif(): Promise<void> {
    const player = this.player();
    const map = this.map();
    if (!player || !map || this.exportingGif()) return;

    this.exportingGif.set(true);
    this.gifExportError.set(null);
    try {
      const frames = map.buildGifFrames(player.name);
      if (frames.length === 0) throw new Error('The map is still loading');
      const filename = `${player.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}-career.gif`;
      await this.gifExport.exportFrames(frames, { width: 640, height: 333, filename });
    } catch (err) {
      this.gifExportError.set(err instanceof Error ? err.message : 'Failed to generate GIF');
    } finally {
      this.exportingGif.set(false);
    }
  }
}
