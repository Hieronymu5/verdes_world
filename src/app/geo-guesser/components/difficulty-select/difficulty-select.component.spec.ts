import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DifficultySelectComponent } from './difficulty-select.component';
import { GeoGuesserDataService } from '../../geo-guesser-data.service';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

describe('DifficultySelectComponent', () => {
  let component: DifficultySelectComponent;
  let fixture: ComponentFixture<DifficultySelectComponent>;
  let mockDataService: any;
  let mockStateService: any;

  beforeEach(async () => {
    mockDataService = {
      difficulties: signal([
        { id: 'easy', name: 'Easy', minGamesPlayed: 50 },
        { id: 'medium', name: 'Medium', minGamesPlayed: 100 }
      ]),
      players: signal([
        { id: '1', name: 'Player 1', gamesPlayed: 60, clubs: [] },
        { id: '2', name: 'Player 2', gamesPlayed: 120, clubs: [] }
      ]),
      versionInfo: signal('1.0.0')
    };

    mockStateService = {
      lastSelectedDifficultyId: signal('easy'),
      startGame: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [DifficultySelectComponent],
      providers: [
        provideRouter([]),
        { provide: GeoGuesserDataService, useValue: mockDataService },
        { provide: GeoGuesserStateService, useValue: mockStateService }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DifficultySelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute poolStats correctly', () => {
    expect(component.poolStats(50)).toBe(2);
    expect(component.poolStats(100)).toBe(1);
    expect(component.poolStats(200)).toBe(0);
  });

  it('should handle keyboard navigation', async () => {
    component.onDocumentKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.selectedIndex()).toBe(1);
    
    component.onDocumentKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.selectedIndex()).toBe(0);

    component.onDocumentKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.selectedIndex()).toBe(1); // maxes out at 1 (length - 1)
  });

  it('should start game on Enter key', () => {
    component.onDocumentKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(mockStateService.startGame).toHaveBeenCalled();
  });

  it('should update selectedIndex on card focus', () => {
    component.onCardFocus(1);
    expect(component.selectedIndex()).toBe(1);
  });

  it('should set index and start game on card click', () => {
    const level = { id: 'medium', name: 'Medium', minGamesPlayed: 100, description: '', gameDurationSeconds: 120, lives: 3, revealPlayerAfterSeconds: 5 };
    component.onCardClick(level, 1);
    expect(component.selectedIndex()).toBe(1);
    expect(mockStateService.startGame).toHaveBeenCalledWith(
      level,
      mockDataService.players()
    );
  });
});
