import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameHudComponent } from './game-hud.component';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';
import { signal } from '@angular/core';

describe('GameHudComponent', () => {
  let component: GameHudComponent;
  let fixture: ComponentFixture<GameHudComponent>;
  let mockStateService: any;
  let stateSignal: any;

  beforeEach(async () => {
    stateSignal = signal({
      selectedDifficulty: { lives: 3 },
      lives: 2,
      gameTimeRemaining: 65,
      score: 10
    });

    mockStateService = {
      state: stateSignal
    };

    await TestBed.configureTestingModule({
      imports: [GameHudComponent],
      providers: [
        { provide: GeoGuesserStateService, useValue: mockStateService }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GameHudComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute lives correctly', () => {
    expect(component.lives().remaining.length).toBe(2);
    expect(component.lives().lost.length).toBe(1);
  });

  it('should compute timerDisplay correctly', () => {
    expect(component.timerDisplay()).toBe('1:05');
    
    stateSignal.set({ ...stateSignal(), gameTimeRemaining: 9 });
    expect(component.timerDisplay()).toBe('0:09');
  });

  it('should compute isUrgent correctly', () => {
    expect(component.isUrgent()).toBe(false);
    
    stateSignal.set({ ...stateSignal(), gameTimeRemaining: 30 });
    expect(component.isUrgent()).toBe(true);
    
    stateSignal.set({ ...stateSignal(), gameTimeRemaining: 10 });
    expect(component.isUrgent()).toBe(true);
  });
});
