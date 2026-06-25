import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GeoGuesserComponent } from './geo-guesser.component';
import { GeoGuesserDataService } from './geo-guesser-data.service';
import { GeoGuesserStateService } from './geo-guesser-state.service';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

describe('GeoGuesserComponent', () => {
  let component: GeoGuesserComponent;
  let fixture: ComponentFixture<GeoGuesserComponent>;
  let mockDataService: any;
  let mockStateService: any;

  beforeEach(async () => {
    mockDataService = { 
      load: vi.fn().mockReturnValue(Promise.resolve()),
      difficulties: signal([]),
      players: signal([]),
      versionInfo: signal('1.0.0')
    };
    mockStateService = { 
      state: signal({ status: 'difficulty', cGFhcwZWk: null, currentPlayer: null, showPlayerName: false, lastGuessResult: null }),
      reset: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [GeoGuesserComponent],
      providers: [
        provideRouter([]),
        { provide: GeoGuesserDataService, useValue: mockDataService },
        { provide: GeoGuesserStateService, useValue: mockStateService }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GeoGuesserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should reset game on escape key if playing', () => {
    mockStateService.state.set({ status: 'playing', cGFhcwZWk: null, currentPlayer: null, showPlayerName: false, lastGuessResult: null });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(mockStateService.reset).toHaveBeenCalled();
  });

  it('should not reset game on escape key if not playing', () => {
    mockStateService.state.set({ status: 'difficulty', cGFhcwZWk: null, currentPlayer: null, showPlayerName: false, lastGuessResult: null });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(mockStateService.reset).not.toHaveBeenCalled();
  });
});
