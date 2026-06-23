import { ChangeDetectionStrategy, Component, computed, input, OnInit, signal } from '@angular/core';
import { geoGraticule, geoNaturalEarth1, geoPath, GeoPath, GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, LineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { ClubStop, Player } from '../../geo-guesser.models';

export interface MapPoint {
  x: number;
  y: number;
  club: ClubStop;
  radius: number;
  labelDy: number;
  /** Seconds to wait before the dot appears (matches when its incoming line finishes). */
  animDelay: number;
}

export interface JourneyLine {
  d: string;
  key: string;
  /** Actual SVG path length in user-units — used to size the dash offset. */
  length: number;
  /** Seconds before this line starts drawing. */
  delay: number;
  /** Seconds this line takes to draw — proportional to its length. */
  duration: number;
}

const MAP_W = 960;
const MAP_H = 500;

/** Pixels per second for the line-drawing animation. */
const LINE_SPEED = 200;
const LINE_MIN_DURATION = 0.4;
const LINE_MAX_DURATION = 2.5;
/** Small pause before the first line starts. */
const INITIAL_PAUSE = 0.1;

@Component({
  selector: 'app-world-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './world-map.component.html',
  styleUrl: './world-map.component.css',
})
export class WorldMapComponent implements OnInit {
  readonly player = input<Player | null>(null);
  readonly showTeamNames = input(false);
  readonly showPlayerName = input(false);
  readonly lastGuessResult = input<'correct' | 'wrong' | null>(null);

  readonly mapW = MAP_W;
  readonly mapH = MAP_H;

  readonly landPath      = signal('');
  readonly bordersPath   = signal('');
  readonly graticulePath = signal('');

  private readonly _projection = signal<GeoProjection | null>(null);
  private readonly _pathGen    = signal<GeoPath | null>(null);

  async ngOnInit(): Promise<void> {
    const topo = await fetch('/data/world-110m.json').then(
      (r) => r.json() as Promise<Topology<{ countries: GeometryCollection; land: GeometryCollection }>>,
    );

    const projection = geoNaturalEarth1().fitSize(
      [MAP_W, MAP_H],
      { type: 'Sphere' } as unknown as Feature<Geometry>,
    );
    const path = geoPath(projection);

    this._projection.set(projection);
    this._pathGen.set(path);

    const land = feature(topo, topo.objects.land) as FeatureCollection;
    this.landPath.set(path(land) ?? '');

    const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
    this.bordersPath.set(path(borders as unknown as Feature<Geometry>) ?? '');

    const graticule = geoGraticule().step([10, 10]);
    this.graticulePath.set(path(graticule() as unknown as Feature<Geometry>) ?? '');
  }

  // ─── Animation schedule ───────────────────────────────────────────────────
  //
  // Computes SVG positions, line path strings, and sequential animation timing
  // in a single pass so that each line starts exactly when the previous one ends
  // and each dot appears exactly when its incoming line finishes drawing.

  private readonly _schedule = computed(() => {
    const proj    = this._projection();
    const pathGen = this._pathGen();
    const p       = this.player();
    if (!proj || !pathGen || !p) return null;

    // Project every club to SVG space
    const positions = p.clubs.map((club) => {
      const [x, y] = proj([club.lng, club.lat]) ?? [MAP_W / 2, MAP_H / 2];
      return { x, y, club };
    });

    let nextDelay = INITIAL_PAUSE;
    const lines: JourneyLine[] = [];
    const dotDelays: number[] = [0]; // first dot is visible immediately

    for (let i = 0; i < positions.length - 1; i++) {
      const cur  = positions[i];
      const next = positions[i + 1];

      const geo: LineString = {
        type: 'LineString',
        coordinates: [
          [cur.club.lng,  cur.club.lat],
          [next.club.lng, next.club.lat],
        ],
      };

      const d      = pathGen(geo as unknown as Feature<Geometry>) ?? '';
      const length = Math.max(10, pathGen.measure(geo as unknown as Feature<Geometry>));
      const duration = Math.min(LINE_MAX_DURATION, Math.max(LINE_MIN_DURATION, length / LINE_SPEED));

      lines.push({
        d,
        key: `${cur.club.clubName}→${next.club.clubName}`,
        length,
        delay: nextDelay,
        duration,
      });

      nextDelay += duration;
      dotDelays.push(nextDelay); // next dot appears when this line finishes
    }

    const points: MapPoint[] = positions.map((pos, i) => {
      const radius = this.dotRadius(pos.club);
      return {
        x: pos.x, y: pos.y,
        club: pos.club,
        radius,
        labelDy: -(radius + 6),
        animDelay: dotDelays[i],
      };
    });

    return { points, lines };
  });

  readonly mapPoints    = computed((): MapPoint[]    => this._schedule()?.points ?? []);
  readonly journeyLines = computed((): JourneyLine[] => this._schedule()?.lines  ?? []);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  isAustin(club: ClubStop): boolean {
    return club.clubName === 'Austin FC';
  }

  private dotRadius(club: ClubStop): number {
    const years = Math.max(1, club.toYear - club.fromYear);
    return Math.min(5 + years * 2.5, 20);
  }
}
