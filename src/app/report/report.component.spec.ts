import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportComponent } from './report.component';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

describe('ReportComponent', () => {
  let component: ReportComponent;
  let fixture: ComponentFixture<ReportComponent>;
  let mockDataService: any;

  beforeEach(async () => {
    mockDataService = {
      loaded: signal(false),
      error: signal(null),
      players: signal([
        {
          id: '1',
          name: 'Player 1',
          gamesPlayed: 10,
          clubs: [
            { clubName: 'Austin FC', fromYear: 2021, toYear: 2023, lat: 0, lng: 0 },
            { clubName: 'Other FC', fromYear: 2018, toYear: 2020, lat: 10, lng: 10 }
          ]
        },
        {
          id: '2',
          name: 'Player 2',
          gamesPlayed: 50,
          clubs: [
            { clubName: 'Austin FC', fromYear: 2022, toYear: 2022, lat: 0, lng: 0 }
          ]
        }
      ]),
      load: vi.fn().mockReturnValue(Promise.resolve())
    };

    vi.spyOn(window, 'fetch').mockReturnValue(Promise.resolve({
      json: () => Promise.resolve({
        objects: {
          land: { type: 'GeometryCollection', geometries: [] },
          countries: { type: 'GeometryCollection', geometries: [] }
        }
      })
    } as any));

    await TestBed.configureTestingModule({
      imports: [ReportComponent],
      providers: [
        provideRouter([]),
        { provide: GeoGuesserDataService, useValue: mockDataService }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute availableAustinYears correctly', () => {
    expect(component.availableAustinYears()).toEqual([2021, 2022, 2023]);
  });

  it('should compute filteredByGamesPlayers correctly', () => {
    component.selectMinGames(20);
    expect(component.filteredByGamesPlayers().length).toBe(1);
    expect(component.filteredByGamesPlayers()[0].id).toBe('2');
  });

  it('should select and clear years', () => {
    component.selectAllYears();
    expect(component.selectedYears().size).toBe(3);
    
    component.clearYears();
    expect(component.selectedYears().size).toBe(0);
  });

  it('should handle year toggle', () => {
    component.clearYears();
    
    const inputElement = document.createElement('input');
    inputElement.type = 'checkbox';
    inputElement.checked = true;
    
    component.onYearToggle(2021, { target: inputElement } as unknown as Event);
    expect(component.selectedYears().has(2021)).toBe(true);
    
    inputElement.checked = false;
    component.onYearToggle(2021, { target: inputElement } as unknown as Event);
    expect(component.selectedYears().has(2021)).toBe(false);
  });

  it('should fetch map data and compute paths on init', async () => {
    component.ngOnInit();
    await fixture.whenStable();
    
    expect(window.fetch).toHaveBeenCalled();
    expect(mockDataService.load).toHaveBeenCalled();
  });

  it('should compute report dots and lines', async () => {
    component.ngOnInit();
    await fixture.whenStable();
    
    // Select all years so filteredPlayers includes both
    component.selectAllYears();
    
    expect(component.reportDots().length).toBe(3); // Player 1 has 2 clubs, Player 2 has 1
    expect(component.reportLines().length).toBe(1); // Player 1 has 1 line between 2 clubs, Player 2 has 0
  });
});
