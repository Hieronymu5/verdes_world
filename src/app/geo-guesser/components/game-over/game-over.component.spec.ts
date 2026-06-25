import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { GameOverComponent } from './game-over.component';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';
import { signal } from '@angular/core';
import { vi } from 'vitest';

describe('GameOverComponent', () => {
  let component: GameOverComponent;
  let fixture: ComponentFixture<GameOverComponent>;
  let mockStateService: any;
  let stateSignal: any;

  beforeEach(async () => {
    stateSignal = signal({
      lives: 0,
      selectedDifficulty: { gameDurationSeconds: 120 },
      gameTimeRemaining: 50,
      score: 15
    });

    mockStateService = {
      state: stateSignal,
      reset: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [GameOverComponent],
      providers: [
        { provide: GeoGuesserStateService, useValue: mockStateService }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GameOverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute outOfLives correctly', () => {
    expect(component.outOfLives()).toBe(true);

    stateSignal.set({ ...stateSignal(), lives: 1 });
    expect(component.outOfLives()).toBe(false);
  });

  it('should compute timePlayed correctly', () => {
    // 120 - 50 = 70 seconds -> 1m 10s
    expect(component.timePlayed()).toBe('1m 10s');
    
    stateSignal.set({ ...stateSignal(), gameTimeRemaining: 100 });
    // 120 - 100 = 20 seconds -> 20s
    expect(component.timePlayed()).toBe('20s');
  });

  it('should compute rating correctly based on score', () => {
    // Score is 15 -> Elite
    expect(component.rating().label).toContain('Elite');
    
    stateSignal.set({ ...stateSignal(), score: 25 });
    expect(component.rating().label).toContain('Legendary');

    stateSignal.set({ ...stateSignal(), score: 7 });
    expect(component.rating().label).toContain('Supporter');

    stateSignal.set({ ...stateSignal(), score: 3 });
    expect(component.rating().label).toContain('Apprentice');

    stateSignal.set({ ...stateSignal(), score: 1 });
    expect(component.rating().label).toContain('Keep Practicing');
  });

  it('should reset game on playAgain', () => {
    component.playAgain();
    expect(mockStateService.reset).toHaveBeenCalled();
  });

  it('should reset game on Enter key', () => {
    component.onEnterKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(mockStateService.reset).toHaveBeenCalled();
  });
});
