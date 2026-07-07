import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GeoGuesserDataService } from '../../geo-guesser-data.service';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';
import { WorldCupTeam } from '../../geo-guesser.models';

@Component({
  selector: 'app-team-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team-select.component.html',
  styleUrl: './team-select.component.css',
})
export class TeamSelectComponent {
  private readonly dataService = inject(GeoGuesserDataService);
  private readonly stateService = inject(GeoGuesserStateService);

  readonly teams = this.dataService.worldCupTeams;
  readonly loadingTeamId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  async onSelectTeam(team: WorldCupTeam): Promise<void> {
    if (this.loadingTeamId()) return;

    const difficulty = this.stateService.state().selectedDifficulty;
    if (!difficulty) return;

    this.errorMessage.set(null);
    this.loadingTeamId.set(team.id);
    try {
      const players = await this.dataService.loadWorldCupRoster(team);
      this.stateService.startWorldCupGame(difficulty, team, players);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : `Failed to load ${team.name}`);
    } finally {
      this.loadingTeamId.set(null);
    }
  }

  onBack(): void {
    this.stateService.backToDifficultySelect();
  }
}
