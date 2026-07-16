import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayersComponent } from './players.component';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

describe('PlayersComponent', () => {
  let component: PlayersComponent;
  let fixture: ComponentFixture<PlayersComponent>;
  let mockDataService: any;

  beforeEach(async () => {
    mockDataService = {
      loaded: signal(false),
      error: signal(null),
      players: signal([
        { id: '1', name: 'Player 1', gamesPlayed: 10, clubs: [] },
        { id: '2', name: 'Player 2', gamesPlayed: 20, clubs: [] }
      ]),
      worldCupTeams: signal([]),
      load: vi.fn().mockReturnValue(Promise.resolve())
    };

    await TestBed.configureTestingModule({
      imports: [PlayersComponent],
      providers: [
        provideRouter([]),
        { provide: GeoGuesserDataService, useValue: mockDataService }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PlayersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load data on init if not loaded', () => {
    expect(mockDataService.load).toHaveBeenCalled();
  });

  it('should sort players by gamesPlayed descending', () => {
    expect(component.players()[0].name).toBe('Player 2');
    expect(component.players()[1].name).toBe('Player 1');
  });
});
