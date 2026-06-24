import { Injectable, signal } from '@angular/core';
import { DifficultyLevel, Player, VersionInfo } from './geo-guesser.models';

@Injectable({ providedIn: 'root' })
export class GeoGuesserDataService {
  private readonly _players = signal<Player[]>([]);
  private readonly _difficulties = signal<DifficultyLevel[]>([]);
  private readonly _versionInfo = signal<VersionInfo | null>(null);
  private readonly _loaded = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly players = this._players.asReadonly();
  readonly difficulties = this._difficulties.asReadonly();
  readonly versionInfo = this._versionInfo.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly error = this._error.asReadonly();

  async load(): Promise<void> {
    try {
      const [playersRes, diffRes, versionRes] = await Promise.all([
        fetch('/data/players.json'),
        fetch('/data/difficulty.json'),
        fetch('/data/version.json'),
      ]);

      if (!playersRes.ok || !diffRes.ok || !versionRes.ok) {
        throw new Error('Failed to fetch game data');
      }

      const [players, difficulties, versionInfo] = await Promise.all([
        playersRes.json() as Promise<Player[]>,
        diffRes.json() as Promise<DifficultyLevel[]>,
        versionRes.json() as Promise<VersionInfo>,
      ]);

      this._players.set(players);
      this._difficulties.set(difficulties);
      this._versionInfo.set(versionInfo);
      this._loaded.set(true);
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Unknown error loading game data');
    }
  }
}
