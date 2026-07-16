import { ChangeDetectionStrategy, Component, computed, input, OnInit, signal } from '@angular/core';
import { geoGraticule, geoNaturalEarth1, geoPath, GeoPath, GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, LineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { ensureVisibleAccent } from '../../color-utils';
import { ClubStop, Player } from '../../geo-guesser.models';
import type { SvgGifFrame } from '../../../global/svg-gif-export.service';

export interface MapPoint {
  key: string;
  x: number;
  y: number;
  club: ClubStop;
  radius: number;
  /** Seconds to wait before the dot appears (matches when its incoming line finishes). */
  animDelay: number;
  /** CSS brightness() multiplier — ramps from 0.75 on the first dot to 1 on the last. */
  brightness: number;
}

export interface TeamListItem {
  key: string;
  index: number;
  clubName: string;
  yearRange: string;
  y: number;
  revealDelay: number;
}

export interface MobileTeamListItem {
  key: string;
  index: number;
  clubName: string;
  yearRange: string;
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
const TEAM_LIST_W = 276;
const TEAM_LIST_ROW_H = 18;
const TEAM_LIST_START_Y = 40;
const TEAM_LIST_MAX_H = MAP_H - 90;

/** Pixels per second for the line-drawing animation. */
const LINE_SPEED = 200;
const LINE_MIN_DURATION = 0.4;
const LINE_MAX_DURATION = 2.5;
/** Small pause before the first line starts. */
const INITIAL_PAUSE = 0.1;

/** CSS brightness() applied to the very first dot in a player's journey. */
const FIRST_DOT_BRIGHTNESS = 0.75;
/** CSS brightness() applied to the last dot — normal, unadjusted color. */
const LAST_DOT_BRIGHTNESS = 1;
/** Dot radius is scaled down by this factor on World Cup team maps. */
const TEAM_MAP_DOT_SCALE = 0.65;
const GIF_FRAME_DELAY_MS = 500;
const GIF_FINAL_FRAME_DELAY_MS = 1500;

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

@Component({
  selector: 'app-world-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './world-map.component.html',
  styleUrl: './world-map.component.css',
})
export class WorldMapComponent implements OnInit {
  readonly player = input<Player | null>(null);
  readonly showPlayerName = input(false);
  readonly lastGuessResult = input<'correct' | 'wrong' | null>(null);
  readonly smallDots = input(false);
  readonly showYearsOnMap = input(true);
  readonly playerTimeElapsed = input(0);
  /** Flag colors of the selected World Cup team — accents journey lines/dots when set. */
  readonly countryColors = input<string[] | null>(null);

  /** The map's land/borders/graticule always stay the default green theme. */
  readonly accentColor = computed(() => {
    const colors = this.countryColors();
    if (!colors || colors.length === 0) return null;
    return ensureVisibleAccent(colors[0]);
  });

  /** True when showing a World Cup team's roster rather than a single club career. */
  readonly isTeamMap = computed(() => (this.countryColors()?.length ?? 0) > 0);

  readonly mapW = MAP_W;
  readonly mapH = MAP_H;
  readonly teamListW = TEAM_LIST_W;
  readonly teamListX = MAP_W - TEAM_LIST_W - 14;

  readonly landPath = signal('');
  readonly bordersPath = signal('');
  readonly graticulePath = signal('');

  private readonly _projection = signal<GeoProjection | null>(null);
  private readonly _pathGen = signal<GeoPath | null>(null);

  async ngOnInit(): Promise<void> {
    const topo = await fetch('/data/world-110m.json').then(
      (r) =>
        r.json() as Promise<Topology<{ countries: GeometryCollection; land: GeometryCollection }>>,
    );

    const projection = geoNaturalEarth1().fitSize([MAP_W, MAP_H], {
      type: 'Sphere',
    } as unknown as Feature<Geometry>);
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
    const proj = this._projection();
    const pathGen = this._pathGen();
    const p = this.player();
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
      const cur = positions[i];
      const next = positions[i + 1];

      const geo: LineString = {
        type: 'LineString',
        coordinates: [
          [cur.club.lng, cur.club.lat],
          [next.club.lng, next.club.lat],
        ],
      };

      const d = pathGen(geo as unknown as Feature<Geometry>) ?? '';
      const length = Math.max(10, pathGen.measure(geo as unknown as Feature<Geometry>));
      const duration = Math.min(
        LINE_MAX_DURATION,
        Math.max(LINE_MIN_DURATION, length / LINE_SPEED),
      );

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

    const lastIndex = positions.length - 1;
    const points: MapPoint[] = positions.map((pos, i) => ({
      key: `${pos.club.clubName}-${pos.club.fromYear}-${pos.club.toYear}-${i}`,
      x: pos.x,
      y: pos.y,
      club: pos.club,
      radius: this.dotRadius(pos.club),
      animDelay: dotDelays[i],
      brightness:
        lastIndex > 0
          ? FIRST_DOT_BRIGHTNESS + ((LAST_DOT_BRIGHTNESS - FIRST_DOT_BRIGHTNESS) * i) / lastIndex
          : LAST_DOT_BRIGHTNESS,
    }));

    return { points, lines };
  });

  readonly mapPoints = computed((): MapPoint[] => this._schedule()?.points ?? []);
  readonly journeyLines = computed((): JourneyLine[] => this._schedule()?.lines ?? []);

  /**
   * Merges consecutive stints at the same club whose year ranges overlap or
   * touch (e.g. a loan-and-return recorded as separate entries) into a single
   * entry spanning the combined years. `firstIndex` keeps the original
   * `mapPoints()` index so the merged row still reveals at the right time.
   */
  private readonly _mergedClubs = computed((): { club: ClubStop; firstIndex: number }[] => {
    const p = this.player();
    if (!p) return [];

    const merged: { club: ClubStop; firstIndex: number }[] = [];
    p.clubs.forEach((club, i) => {
      const prev = merged[merged.length - 1];
      if (prev && prev.club.clubName === club.clubName && club.fromYear <= prev.club.toYear) {
        prev.club = { ...prev.club, toYear: Math.max(prev.club.toYear, club.toYear) };
      } else {
        merged.push({ club, firstIndex: i });
      }
    });
    return merged;
  });

  private readonly _teamListItems = computed((): TeamListItem[] => {
    const points = this.mapPoints();
    const merged = this._mergedClubs();
    if (merged.length === 0 || points.length === 0) return [];

    return merged.map(({ club, firstIndex }, i) => ({
      key: `${club.clubName}-${club.fromYear}-${club.toYear}-${i}`,
      index: i + 1,
      clubName: this.truncate(club.clubName, 23),
      yearRange: `${club.fromYear}–${club.toYear}`,
      y: TEAM_LIST_START_Y + i * TEAM_LIST_ROW_H,
      revealDelay: points[firstIndex]?.animDelay ?? 0,
    }));
  });

  readonly teamListItems = computed((): TeamListItem[] => {
    const maxRows = Math.max(
      1,
      Math.floor((TEAM_LIST_MAX_H - TEAM_LIST_START_Y) / TEAM_LIST_ROW_H),
    );
    return this._teamListItems().slice(0, maxRows);
  });

  readonly mobileTeamListItems = computed((): MobileTeamListItem[] => {
    return this._mergedClubs().map(({ club }, i) => ({
      key: `${club.clubName}-${club.fromYear}-${club.toYear}-${i}`,
      index: i + 1,
      clubName: club.clubName,
      yearRange: `${club.fromYear}–${club.toYear}`,
    }));
  });

  readonly hiddenTeamCount = computed(
    () => this._teamListItems().length - this.teamListItems().length,
  );

  readonly teamListPanelHeight = computed(() => {
    const itemCount = this.teamListItems().length;
    const footerH = this.hiddenTeamCount() > 0 ? 18 : 0;
    return Math.min(
      TEAM_LIST_MAX_H,
      TEAM_LIST_START_Y + itemCount * TEAM_LIST_ROW_H + footerH + 10,
    );
  });

  readonly sortedJerseyNumbers = computed(() => {
    const nums = this.player()?.jerseyNumbers;
    if (!nums || nums.length === 0) return [];
    return [...nums].sort((a, b) => a - b);
  });

  /** Builds the same progressive journey shown by the player map as standalone GIF frames. */
  buildGifFrames(playerName: string): SvgGifFrame[] {
    if (!this.landPath() || !this.bordersPath() || !this.graticulePath()) return [];

    const points = this.mapPoints();
    const lines = this.journeyLines();
    const rows = this.teamListItems();
    if (points.length === 0) return [];

    return points.map((point, index) => ({
      svg: this.frameSvgMarkup(playerName, points, lines, rows, index),
      delayMs: index === points.length - 1 ? GIF_FINAL_FRAME_DELAY_MS : GIF_FRAME_DELAY_MS,
    }));
  }

  private frameSvgMarkup(
    playerName: string,
    points: MapPoint[],
    lines: JourneyLine[],
    rows: TeamListItem[],
    lastPoint: number,
  ): string {
    const lineMarkup = lines
      .slice(0, lastPoint)
      .map(
        (line) =>
          `<path d="${line.d}" fill="none" stroke="#00b140" stroke-width="2" stroke-linecap="round" opacity="0.9" />`,
      )
      .join('');
    const dotMarkup = points
      .slice(0, lastPoint + 1)
      .map(
        (point) =>
          `<circle cx="${point.x}" cy="${point.y}" r="${point.radius}" fill="#ffffff" stroke="#00b140" stroke-width="1.5" />`,
      )
      .join('');
    const visibleRows = rows.filter((row) => row.index <= lastPoint + 1);
    const panelHeight = 40 + visibleRows.length * TEAM_LIST_ROW_H + 10;
    const rowMarkup = visibleRows
      .map(
        (row) =>
          `<text x="12" y="${row.y}" fill="#ffffff" font-family="Arial, sans-serif" font-size="10.5" font-weight="650" dominant-baseline="middle">${row.index}.</text>` +
          `<text x="30" y="${row.y}" fill="#ffffff" font-family="Arial, sans-serif" font-size="10.5" font-weight="650" dominant-baseline="middle">${escapeXmlText(row.clubName)}</text>` +
          `<text x="262" y="${row.y}" text-anchor="end" fill="#9ac7a5" font-family="Arial, sans-serif" font-size="9.5" font-weight="600" dominant-baseline="middle">${row.yearRange}</text>`,
      )
      .join('');

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${MAP_H}">`,
      `<rect width="${MAP_W}" height="${MAP_H}" fill="#0d2a4a" />`,
      `<path d="${this.graticulePath()}" fill="none" stroke="#0e3356" stroke-width="0.3" opacity="0.6" />`,
      `<path d="${this.landPath()}" fill="#1e3d28" />`,
      `<path d="${this.bordersPath()}" fill="none" stroke="#3d7a4d" stroke-width="0.4" stroke-linejoin="round" />`,
      lineMarkup,
      dotMarkup,
      `<g transform="translate(${this.teamListX},10)">`,
      `<rect width="${this.teamListW}" height="${panelHeight}" rx="8" fill="#061525" fill-opacity="0.86" stroke="#3d7a4d" />`,
      `<text x="12" y="22" fill="#00b140" font-family="Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="0.08em">CAREER PATH</text>`,
      rowMarkup,
      `</g>`,
      `<rect x="180" y="${MAP_H - 42}" width="600" height="28" rx="5" fill="#00b140" opacity="0.93" />`,
      `<text x="480" y="${MAP_H - 27}" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="18" font-weight="700" dominant-baseline="middle">${escapeXmlText(playerName)}</text>`,
      `</svg>`,
    ].join('');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  isAustin(club: ClubStop): boolean {
    return club.clubName === 'Austin FC';
  }

  dotFilter(pt: MapPoint): string {
    const glow = this.isAustin(pt.club) ? 'url(#glow)' : 'url(#dot-glow)';
    return `${glow} brightness(${pt.brightness})`;
  }

  private dotRadius(club: ClubStop): number {
    if (this.smallDots()) {
      return 6;
    }
    const years = Math.max(1, club.toYear - club.fromYear);
    const radius = Math.min(5 + years * 2.5, 20);
    return this.isTeamMap() ? radius * TEAM_MAP_DOT_SCALE : radius;
  }

  private truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1))}…`;
  }
}
