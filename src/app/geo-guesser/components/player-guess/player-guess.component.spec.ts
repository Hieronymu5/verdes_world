import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerGuessComponent } from './player-guess.component';
import { GeoGuesserDataService } from '../../geo-guesser-data.service';
import { GeoGuesserStateService } from '../../geo-guesser-state.service';
import { signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { vi } from 'vitest';

describe('PlayerGuessComponent', () => {
  let component: PlayerGuessComponent;
  let fixture: ComponentFixture<PlayerGuessComponent>;
  let mockDataService: any;
  let mockStateService: any;

  beforeEach(async () => {
    mockDataService = {
      players: signal([
        { id: '1', name: 'Ronald Koeman', clubs: [] },
        { id: '2', name: 'Hans van Breukelen', clubs: [] },
        { id: '3', name: 'Roberto Baggio', clubs: [] },
        { id: 'brad-stuver', name: 'Brad Stuver', clubs: [] }
      ])
    };

    mockStateService = {
      state: signal({
        status: 'playing',
        showPlayerName: false,
        currentPlayer: { id: '1', name: 'Ronald Koeman' }
      }),
      submitGuess: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [PlayerGuessComponent, FormsModule],
      providers: [
        { provide: GeoGuesserDataService, useValue: mockDataService },
        { provide: GeoGuesserStateService, useValue: mockStateService }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PlayerGuessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute suggestions correctly', () => {
    component.onInput('koeman');
    expect(component.suggestions().length).toBe(1);
    expect(component.suggestions()[0].name).toBe('Ronald Koeman');
  });

  it('should handle keyboard navigation', () => {
    component.onInput('an'); // Matches "Ronald Koeman", "Hans van Breukelen"
    expect(component.highlightedIndex()).toBe(0);
    
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.highlightedIndex()).toBe(1);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.highlightedIndex()).toBe(0);
    
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.showDropdown()).toBe(false);
  });

  it('should submit guess on Enter', () => {
    component.onInput('koeman');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(mockStateService.submitGuess).toHaveBeenCalledWith('Ronald Koeman');
  });

  it('should handle selectSuggestion', () => {
    component.selectSuggestion({ id: '1', name: 'Ronald Koeman', clubs: [], gamesPlayed: 0, jerseyNumbers: [], nationality: '', position: '' });
    expect(mockStateService.submitGuess).toHaveBeenCalledWith('Ronald Koeman');
    expect(component.inputValue()).toBe('');
  });

  it('should clear dropdown on blur after delay', async () => {
    component.showDropdown.set(true);
    component.onBlur();
    await new Promise(r => setTimeout(r, 200));
    expect(component.showDropdown()).toBe(false);
  });
});
