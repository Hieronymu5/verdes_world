import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { geoGraticule, geoNaturalEarth1, geoPath, GeoPath, GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, LineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';
import { ClubStop, Player } from '../geo-guesser/geo-guesser.models';

interface ReportLine {
  key: string;
  d: string;
  highlight: boolean;
}

interface ReportDot {
  key: string;
  x: number;
  y: number;
  highlight: boolean;
}

const MAP_W = 960;
const MAP_H = 500;
const MIN_GAMES_OPTIONS = [20, 10, 5, -1] as const;

@Component({
  selector: 'app-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report.component.html',
  styleUrl: './report.component.css',
})
export class ReportComponent implements OnInit {
  private readonly dataService = inject(GeoGuesserDataService);

  readonly loaded = this.dataService.loaded;
  readonly error = this.dataService.error;

  readonly mapW = MAP_W;
  readonly mapH = MAP_H;
  readonly minGamesOptions = MIN_GAMES_OPTIONS;

  readonly selectedMinGames = signal<number>(-1);
  readonly selectedYears = signal<Set<number>>(new Set<number>());

  readonly landPath = signal('');
  readonly bordersPath = signal('');
  readonly graticulePath = signal('');

  private readonly _projection = signal<GeoProjection | null>(null);
  private readonly _pathGen = signal<GeoPath | null>(null);

  readonly playersSortedByGamesPlayed = computed(() =>
    [...this.dataService.players()].sort((a, b) => b.gamesPlayed - a.gamesPlayed),
  );

  readonly playerAustinYears = computed(() => {
    const map = new Map<string, number[]>();
    for (const player of this.dataService.players()) {
      map.set(player.id, this.collectAustinYears(player));
    }
    return map;
  });

  readonly availableAustinYears = computed(() => {
    const years = new Set<number>();
    for (const playerYears of this.playerAustinYears().values()) {
      for (const year of playerYears) {
        years.add(year);
      }
    }
    return [...years].sort((a, b) => a - b);
  });

  readonly filteredByGamesPlayers = computed(() => {
    const players = this.dataService.players();
    const minGames = this.selectedMinGames();
    return players.filter((p) => p.gamesPlayed > minGames);
  });

  readonly filteredPlayers = computed(() => {
    const selectedYears = this.selectedYears();
    if (selectedYears.size === 0) return [];

    const austinYearsByPlayer = this.playerAustinYears();
    return this.filteredByGamesPlayers().filter((player) => {
      const years = austinYearsByPlayer.get(player.id) ?? [];
      return years.some((year) => selectedYears.has(year));
    });
  });

  private readonly _reportGeometry = computed(() => {
    const projection = this._projection();
    const pathGenerator = this._pathGen();
    if (!projection || !pathGenerator) {
      return { lines: [] as ReportLine[], dots: [] as ReportDot[] };
    }

    const lines: ReportLine[] = [];
    const dots: ReportDot[] = [];

    for (const player of this.filteredPlayers()) {
      const positions = player.clubs.map((club, index) => {
        const [x, y] = projection([club.lng, club.lat]) ?? [MAP_W / 2, MAP_H / 2];
        return { x, y, club, index };
      });

      for (const position of positions) {
        dots.push({
          key: `${player.id}-${position.club.clubName}-${position.club.fromYear}-${position.club.toYear}-${position.index}`,
          x: position.x,
          y: position.y,
          highlight: this.isAustin(position.club),
        });
      }

      for (let i = 0; i < positions.length - 1; i++) {
        const cur = positions[i];
        const next = positions[i + 1];
        const geo: LineString = {
          type: 'LineString',
          coordinates: [
            [cur.club.lng, cur.club.lat],
            [next.club.lng, next.club.lat],
          ],
        };

        const d = pathGenerator(geo as unknown as Feature<Geometry>) ?? '';
        if (!d) continue;

        lines.push({
          key: `${player.id}-${cur.club.clubName}-${next.club.clubName}-${i}`,
          d,
          highlight: this.isAustin(cur.club) || this.isAustin(next.club),
        });
      }
    }

    return { lines, dots };
  });

  readonly reportLines = computed(() => this._reportGeometry().lines);
  readonly reportDots = computed(() => this._reportGeometry().dots);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadData(), this.loadMapData()]);
    this.selectAllYears();
  }

  selectMinGames(minGames: number): void {
    this.selectedMinGames.set(minGames);
  }

  onYearToggle(year: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    this.selectedYears.update((current) => {
      const next = new Set(current);
      if (target.checked) {
        next.add(year);
      } else {
        next.delete(year);
      }
      return next;
    });
  }

  selectAllYears(): void {
    this.selectedYears.set(new Set(this.availableAustinYears()));
  }

  clearYears(): void {
    this.selectedYears.set(new Set<number>());
  }

  private async loadData(): Promise<void> {
    if (!this.loaded() && !this.error()) {
      await this.dataService.load();
    }
  }

  private async loadMapData(): Promise<void> {
    const topo = await fetch('/data/world-110m.json').then(
      (response) =>
        response.json() as Promise<Topology<{ countries: GeometryCollection; land: GeometryCollection }>>,
    );

    const projection = geoNaturalEarth1().fitSize(
      [MAP_W, MAP_H],
      { type: 'Sphere' } as unknown as Feature<Geometry>,
    );
    const pathGenerator = geoPath(projection);

    this._projection.set(projection);
    this._pathGen.set(pathGenerator);

    const land = feature(topo, topo.objects.land) as FeatureCollection;
    this.landPath.set(pathGenerator(land) ?? '');

    const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
    this.bordersPath.set(pathGenerator(borders as unknown as Feature<Geometry>) ?? '');

    const graticule = geoGraticule().step([10, 10]);
    this.graticulePath.set(pathGenerator(graticule() as unknown as Feature<Geometry>) ?? '');
  }

  private collectAustinYears(player: Player): number[] {
    const years = new Set<number>();
    for (const club of player.clubs) {
      if (!this.isAustin(club)) continue;
      for (let year = club.fromYear; year <= club.toYear; year++) {
        years.add(year);
      }
    }
    return [...years].sort((a, b) => a - b);
  }

  private isAustin(club: ClubStop): boolean {
    return club.clubName === 'Austin FC';
  }
}
