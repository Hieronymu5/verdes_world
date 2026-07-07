import { Injectable, signal } from '@angular/core';
import {
  DifficultyLevel,
  Player,
  ResourceCategory,
  VersionInfo,
  WorldCupTeam,
} from './geo-guesser.models';

@Injectable({ providedIn: 'root' })
export class GeoGuesserDataService {
  private readonly _players = signal<Player[]>([]);
  private readonly _difficulties = signal<DifficultyLevel[]>([]);
  private readonly _versionInfo = signal<VersionInfo | null>(null);
  private readonly _resources = signal<ResourceCategory[]>([]);
  private readonly _worldCupTeams = signal<WorldCupTeam[]>([]);
  private readonly _loaded = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly players = this._players.asReadonly();
  readonly difficulties = this._difficulties.asReadonly();
  readonly versionInfo = this._versionInfo.asReadonly();
  readonly resources = this._resources.asReadonly();
  readonly worldCupTeams = this._worldCupTeams.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly error = this._error.asReadonly();

  async load(): Promise<void> {
    try {
      const [playersRes, diffRes, versionRes, resourcesRes, teamsRes] = await Promise.all([
        fetch('/data/players.json'),
        fetch('/data/difficulty.json'),
        fetch('/data/version.json'),
        fetch('/data/resources.json'),
        fetch('/data/teams.json'),
      ]);

      if (!playersRes.ok || !diffRes.ok || !versionRes.ok || !resourcesRes.ok || !teamsRes.ok) {
        throw new Error('Failed to fetch game data');
      }

      const [players, difficulties, versionInfo, resources, worldCupTeams] = await Promise.all([
        playersRes.json() as Promise<Player[]>,
        diffRes.json() as Promise<DifficultyLevel[]>,
        versionRes.json() as Promise<VersionInfo>,
        resourcesRes.json() as Promise<ResourceCategory[]>,
        teamsRes.json() as Promise<WorldCupTeam[]>,
      ]);

      this._players.set(players);
      this._difficulties.set(difficulties);
      this._versionInfo.set(versionInfo);
      this._resources.set(resources);
      this._worldCupTeams.set(worldCupTeams);
      this._loaded.set(true);
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Unknown error loading game data');
    }
  }

  async loadWorldCupRoster(team: WorldCupTeam): Promise<Player[]> {
    const res = await fetch(`/data/${team.filename}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch roster for ${team.name}`);
    }
    const roster = (await res.json()) as Player[];
    return roster.map((p) => ({ ...p, gamesPlayed: p.gamesPlayed ?? 0 }));
  }
}
