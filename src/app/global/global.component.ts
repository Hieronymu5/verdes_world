import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { geoGraticule, geoInterpolate, geoNaturalEarth1, geoPath, GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { ensureVisibleAccent } from '../geo-guesser/color-utils';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';
import { ClubStop, Player, WorldCupTeam } from '../geo-guesser/geo-guesser.models';
import { SvgGifExportService, SvgGifFrame } from './svg-gif-export.service';

interface GlobalDot {
  key: string;
  x: number;
  y: number;
  fill: string;
  title: string;
}

interface GlobalLine {
  key: string;
  d: string;
  length: number;
  stroke: string;
  motionPoints: [number, number][];
  sourceDotKeys: string[];
  destinationDotKeys: string[];
}

interface TeamRoster {
  team: WorldCupTeam;
  players: Player[];
}

interface GlobalPlayerListItem {
  key: string;
  index: number;
  name: string;
  teamName: string;
  jerseyNumbers: number[];
  startYear: number;
}

type ClubMode = 'current' | 'starting' | 'previous' | 'second' | 'year' | 'career';

type WorldTopology = Topology<{
  countries: GeometryCollection;
  land: GeometryCollection;
}>;

/** Escapes text embedded in hand-built SVG markup (GIF export frames aren't Angular-sanitized). */
function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Clamps `value` to `[min, max]`; if the range is inverted (max < min), pins to `min`. */
function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

const MAP_W = 960;
const MAP_H = 500;
const DOT_RADIUS = 1.1;
/** Dots (and transfer lines) are drawn slightly larger while the year playback is running. */
const ANIMATE_DOT_RADIUS = 1.3;
/** Number of points used to approximate each curved great-circle transfer path. */
const TRANSFER_PATH_SAMPLES = 32;
const TRANSFER_UPDATE_INTERVAL_MS = 100;
/** Used when a team's data is missing flag colors. */
const FALLBACK_DOT_COLOR = '#e5e5e5';

const MAX_YEAR = 2026;
const ANIMATION_STEP_MS = 1000;
/** How long the final frame of an exported GIF lingers before it loops. */
const GIF_FINAL_FRAME_DELAY_MS = ANIMATION_STEP_MS * 3;
/** Pixel width of an exported GIF; height follows the current view's aspect ratio. */
const GIF_WIDTH = 640;

/** Extra room added around a selected team's club bounding box, as a fraction of its size. */
const ZOOM_PADDING_RATIO = 0.25;
/** Floor for that padding in SVG user-units, so a team with clustered clubs isn't over-zoomed. */
const ZOOM_MIN_PADDING = 60;

// The year/country labels are sized and margined in full-map units, then divided by the current
// zoom scale, so they render at the same physical size and inset from the corner at any zoom
// level (rather than growing or shrinking — or drifting off-corner — with the viewBox).
const LABEL_FONT_SIZE = 20;
const LABEL_LEFT_MARGIN = 8;
const LABEL_TOP_MARGIN = 8;

// Frame markup is rendered standalone (detached from the document), so CSS custom properties
// aren't available — these mirror the values of the map's `--vw-color-*` variables.
const OCEAN_COLOR = '#0d2a4a';
const LAND_COLOR = '#1e3d28';
const BORDER_COLOR = '#3d7a4d';
const GRATICULE_COLOR = '#0e3356';

@Component({
  selector: 'app-global',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './global.component.html',
  styleUrl: './global.component.css',
})
export class GlobalComponent implements OnInit, OnDestroy {
  private readonly dataService = inject(GeoGuesserDataService);
  private readonly gifExport = inject(SvgGifExportService);

  readonly mapW = MAP_W;
  readonly mapH = MAP_H;
  readonly maxYear = MAX_YEAR;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly landPath = signal('');
  readonly bordersPath = signal('');
  readonly graticulePath = signal('');

  readonly clubMode = signal<ClubMode>('year');
  readonly selectedYear = signal<number>(MAX_YEAR);
  readonly selectedTeamId = signal<string | null>(null);

  readonly animating = signal(false);
  /** Whether the current animation frame shows the transfer lines to next year. */
  readonly showTransferLines = signal(false);
  /** Whether the completed transfer lines are retracting from their source end. */
  readonly erasingTransferLines = signal(false);
  /** Whether the animation is previewing the source year's dots before moving to the target year. */
  readonly showingPreviousYearDots = signal(false);
  readonly exportingGif = signal(false);
  readonly gifExportError = signal<string | null>(null);
  readonly transferProgress = signal(0);

  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private transferMotionTimer: ReturnType<typeof setInterval> | null = null;
  private mapTopology: WorldTopology | null = null;

  private readonly _projection = signal<GeoProjection | null>(null);
  private readonly _teamRosters = signal<TeamRoster[]>([]);

  readonly dotRadius = computed((): number => (this.animating() ? ANIMATE_DOT_RADIUS : DOT_RADIUS));

  readonly teams = computed((): WorldCupTeam[] =>
    this._teamRosters()
      .map((r) => r.team)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly filteredRosters = computed((): TeamRoster[] => {
    const teamId = this.selectedTeamId();
    const rosters = this._teamRosters();
    return teamId ? rosters.filter((r) => r.team.id === teamId) : rosters;
  });

  /**
   * Zooms to fit every club a selected team's players have ever been at (so
   * switching club-mode or playing back years never pans outside the view),
   * with a bit of padding. Shows the full world when no team is selected.
   */
  readonly mapViewBox = computed((): string => {
    const projection = this._projection();
    const fullMap = `0 0 ${MAP_W} ${MAP_H}`;
    if (!projection || !this.selectedTeamId()) return fullMap;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const { players } of this.filteredRosters()) {
      for (const player of players) {
        for (const club of player.clubs) {
          const [x, y] = projection([club.lng, club.lat]) ?? [MAP_W / 2, MAP_H / 2];
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (!isFinite(minX)) return fullMap;

    const paddingX = Math.max((maxX - minX) * ZOOM_PADDING_RATIO, ZOOM_MIN_PADDING);
    const paddingY = Math.max((maxY - minY) * ZOOM_PADDING_RATIO, ZOOM_MIN_PADDING);

    // Capped at the map's own size — a team whose players' careers span most of the globe (e.g.
    // Australia) can otherwise need a box wider/taller than the map itself, which would force
    // the clamp below to pin to an edge while still overflowing the opposite one.
    const width = Math.min(maxX - minX + paddingX * 2, MAP_W);
    const height = Math.min(maxY - minY + paddingY * 2, MAP_H);

    // Keep the padded box within the map artwork's own bounds — otherwise it can extend past
    // the drawn land/ocean into blank space, taking the corner labels (anchored to its edges)
    // outside the visible map with it.
    const x = clamp(minX - paddingX, 0, MAP_W - width);
    const y = clamp(minY - paddingY, 0, MAP_H - height);

    return `${x} ${y} ${width} ${height}`;
  });

  /** The earliest club start year across the currently filtered rosters — the slider's floor. */
  readonly earliestYear = computed((): number => {
    let min = MAX_YEAR;
    for (const { players } of this.filteredRosters()) {
      for (const player of players) {
        for (const club of player.clubs) {
          if (club.fromYear < min) min = club.fromYear;
        }
      }
    }
    return Math.min(min, MAX_YEAR);
  });

  readonly dots = computed(
    (): GlobalDot[] => this.computeFrame(this.clubMode(), this.selectedYear(), false).dots,
  );

  readonly transferLines = computed((): GlobalLine[] => {
    if (this.clubMode() !== 'year' || !this.showTransferLines()) return [];
    if (this.selectedYear() <= this.earliestYear()) return [];
    return this.computeFrame('year', this.selectedYear() - 1, true).lines;
  });

  readonly displayedDots = computed((): GlobalDot[] => {
    const dots = this.dots();
    const lines = this.transferLines();
    if (!this.showingPreviousYearDots() && lines.length === 0) return dots;

    const sourceDots =
      this.clubMode() === 'year' && this.selectedYear() > this.earliestYear()
        ? this.computeFrame('year', this.selectedYear() - 1, false).dots
        : dots;
    if (lines.length === 0 || !this.erasingTransferLines()) return sourceDots;

    const destinationDots = lines.map((line) => {
      const destination = line.motionPoints[line.motionPoints.length - 1];
      return {
        key: `${line.key}-destination`,
        x: destination[0],
        y: destination[1],
        fill: '#ffffff',
        title: '',
      };
    });

    if (!this.erasingTransferLines()) return dots;

    const sourceKeys = new Set(lines.flatMap((line) => line.sourceDotKeys));
    return [...dots.filter((dot) => !sourceKeys.has(dot.key)), ...destinationDots];
  });

  readonly playerList = computed((): GlobalPlayerListItem[] => {
    const players = this.filteredRosters().flatMap(({ team, players: rosterPlayers }) =>
      rosterPlayers.map((player) => ({ team, player })),
    );
    const visiblePlayers =
      this.clubMode() === 'year'
        ? players.filter(({ player }) => this.playerStartYear(player) <= this.selectedYear())
        : players;

    return visiblePlayers
      .sort((a, b) => {
        const startYearDifference = this.playerStartYear(a.player) - this.playerStartYear(b.player);
        return startYearDifference || a.player.name.localeCompare(b.player.name);
      })
      .map(({ team, player }, index) => ({
        key: `${team.id}-${player.id}`,
        index: index + 1,
        name: player.name,
        teamName: team.name,
        jerseyNumbers: [...player.jerseyNumbers].sort((a, b) => a - b),
        startYear: this.playerStartYear(player),
      }));
  });

  /** Keeps the year label pinned below the top-left country label, even when zoomed in. */
  /** The selected team's name, positioned above the year label in the top-left corner. */
  readonly countryLabel = computed(
    (): { text: string; x: number; y: number; fontSize: number } | null => {
      const teamId = this.selectedTeamId();
      const team = teamId ? this.teams().find((t) => t.id === teamId) : undefined;
      if (!team) return null;

      return { text: team.name, ...this.countryLabelPosition(this.mapViewBox()) };
    },
  );

  async ngOnInit(): Promise<void> {
    try {
      const [topo] = await Promise.all([
        fetch('/data/world-110m.json').then((r) => r.json() as Promise<WorldTopology>),
        this.loadTeams(),
      ]);

      this.mapTopology = topo;
      this.updateMapProjection();
      await this.loadRosters();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load global map');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stopAnimation();
  }

  onClubModeChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    this.stopAnimation();
    this.clubMode.set(target.value as ClubMode);
  }

  onYearChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.stopAnimation();
    this.selectedYear.set(Number(target.value));
  }

  onTeamChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.stopAnimation();
    this.selectedTeamId.set(target.value || null);
    this.updateMapProjection();
  }

  toggleAnimation(): void {
    if (this.animating()) {
      this.stopAnimation();
    } else {
      this.startAnimation();
    }
  }

  /** Rewinds playback to the first year of the selected team(s)' history. */
  private resetAnimation(): void {
    this.selectedYear.set(Math.min(this.earliestYear() + 1, MAX_YEAR));
    this.showTransferLines.set(false);
    this.erasingTransferLines.set(false);
    this.showingPreviousYearDots.set(false);
  }

  private startAnimation(): void {
    if (this.selectedYear() >= MAX_YEAR) {
      this.resetAnimation();
    }

    this.animating.set(true);
    this.showingPreviousYearDots.set(true);
    if (this.showTransferLines()) this.startTransferMotion();
    this.scheduleAnimationTick(this.showTransferLines() ? ANIMATION_STEP_MS : this.yearStepDelay());
  }

  private stopAnimation(): void {
    this.animating.set(false);
    this.showingPreviousYearDots.set(false);
    this.stopTransferMotion();
    if (this.animationTimer !== null) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
  }

  private startTransferMotion(): void {
    this.stopTransferMotion();
    this.transferMotionTimer = setInterval(() => {
      const nextProgress =
        this.transferProgress() +
        TRANSFER_UPDATE_INTERVAL_MS / (ANIMATION_STEP_MS - TRANSFER_UPDATE_INTERVAL_MS);
      this.transferProgress.set(Math.min(nextProgress, 1));
    }, TRANSFER_UPDATE_INTERVAL_MS);
  }

  private stopTransferMotion(): void {
    if (this.transferMotionTimer !== null) {
      clearInterval(this.transferMotionTimer);
      this.transferMotionTimer = null;
    }
  }

  /**
   * Alternates each frame between showing the transfer lines to next year and
   * advancing to those positions: dots at year Y, then lines to Y+1, then
   * dots at Y+1, then lines to Y+2, and so on.
   */
  private scheduleAnimationTick(delayMs: number): void {
    this.animationTimer = setTimeout(() => {
      this.animationTimer = null;
      const nextDelay = this.tickAnimation();
      if (this.animating() && nextDelay > 0) this.scheduleAnimationTick(nextDelay);
    }, delayMs);
  }

  private tickAnimation(): number {
    if (this.showTransferLines()) {
      if (!this.erasingTransferLines()) {
        this.erasingTransferLines.set(true);
        this.transferProgress.set(0);
        this.startTransferMotion();
        return ANIMATION_STEP_MS;
      }

      const nextYear = this.selectedYear() + 1;
      if (nextYear > MAX_YEAR) {
        this.showTransferLines.set(false);
        this.erasingTransferLines.set(false);
        this.stopAnimation();
        return 0;
      }
      this.stopTransferMotion();
      this.selectedYear.set(nextYear);
      this.showTransferLines.set(false);
      this.erasingTransferLines.set(false);
      this.showingPreviousYearDots.set(true);
      return this.yearStepDelay();
    } else {
      if (this.selectedYear() >= MAX_YEAR) {
        this.stopAnimation();
        return 0;
      }
      if (!this.hasTransfersForYear()) {
        this.selectedYear.update((year) => year + 1);
        return this.yearStepDelay();
      }
      this.transferProgress.set(0);
      this.erasingTransferLines.set(false);
      this.showingPreviousYearDots.set(false);
      this.showTransferLines.set(true);
      this.startTransferMotion();
      return ANIMATION_STEP_MS;
    }
  }

  private yearStepDelay(): number {
    return this.hasTransfersForYear() ? ANIMATION_STEP_MS : 500;
  }

  private hasTransfersForYear(): boolean {
    return (
      this.selectedYear() > this.earliestYear() &&
      this.computeFrame('year', this.selectedYear() - 1, true).lines.length > 0
    );
  }

  async downloadGif(): Promise<void> {
    if (this.exportingGif() || !this._projection()) return;

    this.stopAnimation();
    this.exportingGif.set(true);
    this.gifExportError.set(null);

    try {
      const viewBox = this.mapViewBox();
      const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number);
      const width = GIF_WIDTH;
      const height = Math.max(1, Math.round(width * (vbHeight / vbWidth)));

      const team = this.teams().find((t) => t.id === this.selectedTeamId());
      const filename = `${(team?.name ?? 'global').toLowerCase().replace(/\s+/g, '-')}-transfers.gif`;

      await this.gifExport.exportFrames(this.buildGifFrames(viewBox), { width, height, filename });
    } catch (err) {
      this.gifExportError.set(err instanceof Error ? err.message : 'Failed to generate GIF');
    } finally {
      this.exportingGif.set(false);
    }
  }

  private async loadTeams(): Promise<void> {
    if (!this.dataService.loaded() && !this.dataService.error()) {
      await this.dataService.load();
    }
  }

  private async loadRosters(): Promise<void> {
    const teams = this.dataService.worldCupTeams();
    const rosters = await Promise.all(
      teams.map((team) => this.dataService.loadWorldCupRoster(team).catch(() => [] as Player[])),
    );

    this._teamRosters.set(teams.map((team, i) => ({ team, players: rosters[i] })));
  }

  /** Rotates the globe horizontally so the selected team's longitude faces the map center. */
  private updateMapProjection(): void {
    if (!this.mapTopology) return;

    const team = this.teams().find((candidate) => candidate.id === this.selectedTeamId());
    const rotation: [number, number] = team ? [-team.lng, 0] : [0, 0];
    const projection = geoNaturalEarth1()
      .rotate(rotation)
      .fitSize([MAP_W, MAP_H], { type: 'Sphere' } as unknown as Feature<Geometry>);
    const pathGenerator = geoPath(projection);
    const land = feature(this.mapTopology, this.mapTopology.objects.land) as FeatureCollection;
    const borders = mesh(this.mapTopology, this.mapTopology.objects.countries, (a, b) => a !== b);
    const graticule = geoGraticule().step([10, 10]);

    this.landPath.set(pathGenerator(land) ?? '');
    this.bordersPath.set(pathGenerator(borders as unknown as Feature<Geometry>) ?? '');
    this.graticulePath.set(pathGenerator(graticule() as unknown as Feature<Geometry>) ?? '');
    this._projection.set(projection);
  }

  private clubsForMode(player: Player, mode: ClubMode, year: number): ClubStop[] {
    if (mode === 'career') return player.clubs;

    if (mode === 'year') {
      const club = this.clubForYear(player, year);
      return club ? [club] : [];
    }

    if (mode === 'previous') {
      // The club before the current one — falls back to the current club if there isn't one.
      const club =
        player.clubs.length >= 2
          ? player.clubs[player.clubs.length - 2]
          : player.clubs[player.clubs.length - 1];
      return club ? [club] : [];
    }

    if (mode === 'second') {
      // The club after the starting one — falls back to the starting club if there isn't one.
      const club = player.clubs.length >= 2 ? player.clubs[1] : player.clubs[0];
      return club ? [club] : [];
    }

    const club = mode === 'starting' ? player.clubs[0] : player.clubs[player.clubs.length - 1];
    return club ? [club] : [];
  }

  /** The club a player was at during `year`, preferring the most recent overlapping stint. */
  private clubForYear(player: Player, year: number): ClubStop | null {
    for (let i = player.clubs.length - 1; i >= 0; i--) {
      const club = player.clubs[i];
      if (club.fromYear <= year && year <= club.toYear) return club;
    }
    return null;
  }

  private playerStartYear(player: Player): number {
    return player.clubs.reduce((startYear, club) => Math.min(startYear, club.fromYear), MAX_YEAR);
  }

  /**
   * Builds one frame's worth of dots (and, optionally, transfer lines to next
   * year) for the currently filtered rosters. Shared by the live map render
   * and the GIF exporter so both stay pixel-identical.
   */
  private computeFrame(
    mode: ClubMode,
    year: number,
    includeLines: boolean,
  ): { dots: GlobalDot[]; lines: GlobalLine[] } {
    const projection = this._projection();
    const dots: GlobalDot[] = [];
    const lines: GlobalLine[] = [];
    const transferLinesByKey = new Map<string, GlobalLine>();
    if (!projection) return { dots, lines };

    for (const { team, players } of this.filteredRosters()) {
      const color = team.colors[0] ? ensureVisibleAccent(team.colors[0]) : FALLBACK_DOT_COLOR;

      for (const player of players) {
        const visibleClubs = this.clubsForMode(player, mode, year);
        visibleClubs.forEach((club, i) => {
          const [x, y] = projection([club.lng, club.lat]) ?? [MAP_W / 2, MAP_H / 2];
          dots.push({
            key: `${team.id}-${player.id}-${i}`,
            x,
            y,
            fill: club === player.clubs[0] ? '#ffffff' : color,
            title: `${player.name} — ${club.clubName} (${team.name})`,
          });
        });

        if (includeLines) {
          const from = this.clubForYear(player, year);
          const to = this.clubForYear(player, year + 1);
          if (!from || !to || from.clubName === to.clubName) continue;
          const nextVisibleClubs = this.clubsForMode(player, mode, year + 1);
          const transferKey = `${color}:${from.lng},${from.lat}->${to.lng},${to.lat}`;
          const sourceIndex = visibleClubs.findIndex((club) => club === from);
          const destinationIndex = nextVisibleClubs.findIndex((club) => club === to);
          const sourceDotKey = `${team.id}-${player.id}-${sourceIndex}`;
          const destinationDotKey = `${team.id}-${player.id}-${destinationIndex}`;
          const existingLine = transferLinesByKey.get(transferKey);
          if (existingLine) {
            existingLine.sourceDotKeys.push(sourceDotKey);
            existingLine.destinationDotKeys.push(destinationDotKey);
            continue;
          }

          const interpolate = geoInterpolate([from.lng, from.lat], [to.lng, to.lat]);
          const points: [number, number][] = [];
          for (let sample = 0; sample <= TRANSFER_PATH_SAMPLES; sample++) {
            const point = projection(interpolate(sample / TRANSFER_PATH_SAMPLES));
            if (!point) break;
            points.push([clamp(point[0], 0, MAP_W), clamp(point[1], 0, MAP_H)]);
          }
          if (points.length !== TRANSFER_PATH_SAMPLES + 1) continue;

          const crossesMapEdge = points.some(
            ([x], i) => i > 0 && Math.abs(x - points[i - 1][0]) > MAP_W / 2,
          );
          // A route crossing the antimeridian jumps between the map's two horizontal edges. A
          // quadratic through the map center keeps that route as one bounded curved path instead
          // of making SVG draw a long straight chord between the two wrapped coordinates.
          const motionPoints = crossesMapEdge
            ? Array.from({ length: TRANSFER_PATH_SAMPLES + 1 }, (_, i) => {
                const t = i / TRANSFER_PATH_SAMPLES;
                const start = points[0];
                const control: [number, number] = [
                  MAP_W / 2,
                  points[Math.floor(points.length / 2)][1],
                ];
                const end = points[points.length - 1];
                return [
                  (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * control[0] + t ** 2 * end[0],
                  (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * control[1] + t ** 2 * end[1],
                ] as [number, number];
              })
            : points;
          const d = motionPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
          const length = motionPoints.reduce((total, point, i) => {
            if (i === 0) return total;
            const previous = motionPoints[i - 1];
            return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
          }, 0);
          const line = {
            key: `${team.id}-${player.id}`,
            d,
            length,
            stroke: color,
            motionPoints,
            sourceDotKeys: [sourceDotKey],
            destinationDotKeys: [destinationDotKey],
          };
          lines.push(line);
          transferLinesByKey.set(transferKey, line);
        }
      }
    }

    return { dots, lines };
  }

  /**
   * The scale factor SVG's `preserveAspectRatio="meet"` (the default) applies to fit `viewBox`
   * into the map's fixed-aspect-ratio physical box — 1 at full zoom, growing as it zooms in.
   * Label sizes/margins are divided by this so they stay a constant physical size at any zoom.
   */
  private labelScale(viewBox: string): number {
    const [, , vw, vh] = viewBox.split(' ').map(Number);
    return Math.min(MAP_W / vw, MAP_H / vh);
  }

  /** Where the year label sits below the top-right country label. */
  private yearLabelPosition(viewBox: string): { x: number; y: number; fontSize: number } {
    const [vx, vy, vw] = viewBox.split(' ').map(Number);
    const scale = this.labelScale(viewBox);
    return {
      x: vx + LABEL_LEFT_MARGIN / scale,
      y: vy + (LABEL_TOP_MARGIN + LABEL_FONT_SIZE * 2 + 6) / scale,
      fontSize: LABEL_FONT_SIZE / scale,
    };
  }

  /** Positions the country label above the year label in the top-left corner. */
  private countryLabelPosition(viewBox: string): { x: number; y: number; fontSize: number } {
    const [vx, vy, vw] = viewBox.split(' ').map(Number);
    const scale = this.labelScale(viewBox);
    return {
      x: vx + LABEL_LEFT_MARGIN / scale,
      y: vy + (LABEL_TOP_MARGIN + LABEL_FONT_SIZE) / scale,
      fontSize: LABEL_FONT_SIZE / scale,
    };
  }

  /** Renders one animation frame as a standalone, self-contained SVG document string. */
  private frameSvgMarkup(year: number, showLines: boolean, viewBox: string): string {
    const { dots, lines } = this.computeFrame('year', year, showLines);
    const label = this.yearLabelPosition(viewBox);
    const country = this.countryLabel();

    const lineMarkup = lines
      .map(
        (l) =>
          `<path d="${l.d}" fill="none" stroke="${l.stroke}" stroke-width="0.8" stroke-linecap="round" opacity="0.55" />`,
      )
      .join('');
    const dotMarkup = dots
      .map(
        (d) =>
          `<circle cx="${d.x}" cy="${d.y}" r="${ANIMATE_DOT_RADIUS}" fill="${d.fill}" opacity="0.85" />`,
      )
      .join('');
    const countryMarkup = country
      ? `<text x="${country.x}" y="${country.y}" text-anchor="start" fill="#ffffff" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="${country.fontSize}">${escapeXmlText(country.text)}</text>`
      : '';

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
      `<rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" fill="${OCEAN_COLOR}" />`,
      this.graticulePath()
        ? `<path d="${this.graticulePath()}" fill="none" stroke="${GRATICULE_COLOR}" stroke-width="0.3" opacity="0.6" />`
        : '',
      `<path d="${this.landPath()}" fill="${LAND_COLOR}" />`,
      `<path d="${this.bordersPath()}" fill="none" stroke="${BORDER_COLOR}" stroke-width="0.4" stroke-linejoin="round" />`,
      lineMarkup,
      dotMarkup,
      `<text x="${label.x}" y="${label.y}" text-anchor="end" fill="#ffffff" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="${label.fontSize}">${year}</text>`,
      countryMarkup,
      `</svg>`,
    ].join('');
  }

  /** The same year → lines → next-year sequence the Play button steps through. */
  private buildGifFrames(viewBox: string): SvgGifFrame[] {
    const frames: SvgGifFrame[] = [];

    for (let year = this.earliestYear(); year < MAX_YEAR; year++) {
      frames.push({ svg: this.frameSvgMarkup(year, false, viewBox), delayMs: ANIMATION_STEP_MS });
      frames.push({ svg: this.frameSvgMarkup(year, true, viewBox), delayMs: ANIMATION_STEP_MS });
    }
    frames.push({
      svg: this.frameSvgMarkup(MAX_YEAR, false, viewBox),
      delayMs: GIF_FINAL_FRAME_DELAY_MS,
    });

    return frames;
  }
}
