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
import { geoGraticule, geoNaturalEarth1, geoPath, GeoPath, GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, LineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { ensureVisibleAccent } from '../geo-guesser/color-utils';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';
import { ClubStop, Player, WorldCupTeam } from '../geo-guesser/geo-guesser.models';

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
  stroke: string;
}

interface TeamRoster {
  team: WorldCupTeam;
  players: Player[];
}

type ClubMode = 'current' | 'starting' | 'previous' | 'second' | 'year' | 'career';

const MAP_W = 960;
const MAP_H = 500;
const DOT_RADIUS = 1.1;
/** Dots (and transfer lines) are drawn slightly larger while the year playback is running. */
const ANIMATE_DOT_RADIUS = 1.3;
/** Used when a team's data is missing flag colors. */
const FALLBACK_DOT_COLOR = '#e5e5e5';

const MIN_YEAR = 2006;
const MAX_YEAR = 2026;
const ANIMATION_STEP_MS = 500;

@Component({
  selector: 'app-global',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './global.component.html',
  styleUrl: './global.component.css',
})
export class GlobalComponent implements OnInit, OnDestroy {
  private readonly dataService = inject(GeoGuesserDataService);

  readonly mapW = MAP_W;
  readonly mapH = MAP_H;
  readonly minYear = MIN_YEAR;
  readonly maxYear = MAX_YEAR;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly landPath = signal('');
  readonly bordersPath = signal('');
  readonly graticulePath = signal('');

  readonly clubMode = signal<ClubMode>('current');
  readonly selectedYear = signal<number>(MAX_YEAR);
  readonly selectedTeamId = signal<string | null>(null);

  readonly animating = signal(false);
  /** Whether the current animation frame shows the transfer lines to next year. */
  readonly showTransferLines = signal(false);

  private animationTimer: ReturnType<typeof setInterval> | null = null;

  private readonly _projection = signal<GeoProjection | null>(null);
  private readonly _pathGen = signal<GeoPath | null>(null);
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

  /** The earliest club start year across the currently filtered rosters. */
  readonly earliestYear = computed((): number => {
    let min = MAX_YEAR;
    for (const { players } of this.filteredRosters()) {
      for (const player of players) {
        for (const club of player.clubs) {
          if (club.fromYear < min) min = club.fromYear;
        }
      }
    }
    return Math.max(MIN_YEAR, Math.min(min, MAX_YEAR));
  });

  readonly dots = computed((): GlobalDot[] => {
    const projection = this._projection();
    if (!projection) return [];

    const mode = this.clubMode();
    const year = this.selectedYear();
    const dots: GlobalDot[] = [];

    for (const { team, players } of this.filteredRosters()) {
      const fill = team.colors[0] ? ensureVisibleAccent(team.colors[0]) : FALLBACK_DOT_COLOR;

      for (const player of players) {
        const clubs = this.clubsForMode(player, mode, year);

        clubs.forEach((club, i) => {
          const [x, y] = projection([club.lng, club.lat]) ?? [MAP_W / 2, MAP_H / 2];
          dots.push({
            key: `${team.id}-${player.id}-${i}`,
            x,
            y,
            fill,
            title: `${player.name} — ${club.clubName} (${team.name})`,
          });
        });
      }
    }

    return dots;
  });

  readonly transferLines = computed((): GlobalLine[] => {
    const pathGen = this._pathGen();
    if (!pathGen || this.clubMode() !== 'year' || !this.showTransferLines()) return [];

    const year = this.selectedYear();
    const nextYear = year + 1;
    const lines: GlobalLine[] = [];

    for (const { team, players } of this.filteredRosters()) {
      const stroke = team.colors[0] ? ensureVisibleAccent(team.colors[0]) : FALLBACK_DOT_COLOR;

      for (const player of players) {
        const from = this.clubForYear(player, year);
        const to = this.clubForYear(player, nextYear);
        if (!from || !to || from.clubName === to.clubName) continue;

        const geo: LineString = {
          type: 'LineString',
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        };
        const d = pathGen(geo as unknown as Feature<Geometry>) ?? '';
        if (!d) continue;

        lines.push({ key: `${team.id}-${player.id}`, d, stroke });
      }
    }

    return lines;
  });

  async ngOnInit(): Promise<void> {
    try {
      const [topo] = await Promise.all([
        fetch('/data/world-110m.json').then(
          (r) =>
            r.json() as Promise<Topology<{ countries: GeometryCollection; land: GeometryCollection }>>,
        ),
        this.loadTeams(),
      ]);

      const projection = geoNaturalEarth1().fitSize(
        [MAP_W, MAP_H],
        { type: 'Sphere' } as unknown as Feature<Geometry>,
      );
      const pathGenerator = geoPath(projection);

      const land = feature(topo, topo.objects.land) as FeatureCollection;
      this.landPath.set(pathGenerator(land) ?? '');

      const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
      this.bordersPath.set(pathGenerator(borders as unknown as Feature<Geometry>) ?? '');

      const graticule = geoGraticule().step([10, 10]);
      this.graticulePath.set(pathGenerator(graticule() as unknown as Feature<Geometry>) ?? '');

      this._projection.set(projection);
      this._pathGen.set(pathGenerator);
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
    this.selectedYear.set(this.earliestYear());
    this.showTransferLines.set(false);
  }

  private startAnimation(): void {
    if (this.selectedYear() >= MAX_YEAR) {
      this.resetAnimation();
    }

    this.animating.set(true);
    this.animationTimer = setInterval(() => this.tickAnimation(), ANIMATION_STEP_MS);
  }

  private stopAnimation(): void {
    this.animating.set(false);
    if (this.animationTimer !== null) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
  }

  /**
   * Alternates each frame between showing the transfer lines to next year and
   * advancing to those positions: dots at year Y, then lines to Y+1, then
   * dots at Y+1, then lines to Y+2, and so on.
   */
  private tickAnimation(): void {
    if (this.showTransferLines()) {
      const nextYear = this.selectedYear() + 1;
      if (nextYear > MAX_YEAR) {
        this.stopAnimation();
        return;
      }
      this.selectedYear.set(nextYear);
      this.showTransferLines.set(false);
    } else {
      if (this.selectedYear() >= MAX_YEAR) {
        this.stopAnimation();
        return;
      }
      this.showTransferLines.set(true);
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

  private clubsForMode(player: Player, mode: ClubMode, year: number): ClubStop[] {
    if (mode === 'career') return player.clubs;

    if (mode === 'year') {
      return player.clubs.filter((club) => club.fromYear <= year && year <= club.toYear);
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

    const club =
      mode === 'starting' ? player.clubs[0] : player.clubs[player.clubs.length - 1];
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
}
