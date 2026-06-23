import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { DifficultySelectComponent } from './components/difficulty-select/difficulty-select.component';
import { GameHudComponent } from './components/game-hud/game-hud.component';
import { GameOverComponent } from './components/game-over/game-over.component';
import { PlayerGuessComponent } from './components/player-guess/player-guess.component';
import { WorldMapComponent } from './components/world-map/world-map.component';
import { GeoGuesserDataService } from './geo-guesser-data.service';
import { GeoGuesserStateService } from './geo-guesser-state.service';

@Component({
  selector: 'app-geo-guesser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DifficultySelectComponent,
    GameHudComponent,
    GameOverComponent,
    PlayerGuessComponent,
    WorldMapComponent,
  ],
  templateUrl: './geo-guesser.component.html',
  styleUrl: './geo-guesser.component.css',
})
export class GeoGuesserComponent implements OnInit {
  private readonly dataService = inject(GeoGuesserDataService);
  readonly stateService = inject(GeoGuesserStateService);
  readonly state = this.stateService.state;

  async ngOnInit(): Promise<void> {
    await this.dataService.load();
  }
}
