import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GlobalComponent } from './global.component';
import { GeoGuesserDataService } from '../geo-guesser/geo-guesser-data.service';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

const WORLD_CUP_TEAMS = [
  {
    id: 'brazil',
    name: 'Brazil',
    filename: 'players/brazil.json',
    city: 'Rio',
    country: 'Brazil',
    lat: -22.9,
    lng: -43.2,
    colors: ['#FEDD00', '#002776'],
    clubId: '1',
    playerCount: 1,
  },
  {
    id: 'argentina',
    name: 'Argentina',
    filename: 'players/argentina.json',
    city: 'Buenos Aires',
    country: 'Argentina',
    lat: -34.6,
    lng: -58.4,
    colors: ['#75AADB', '#FFFFFF'],
    clubId: '2',
    playerCount: 1,
  },
];

function mockFetchTopology(): void {
  vi.spyOn(window, 'fetch').mockReturnValue(
    Promise.resolve({
      json: () =>
        Promise.resolve({
          objects: {
            land: { type: 'GeometryCollection', geometries: [] },
            countries: { type: 'GeometryCollection', geometries: [] },
          },
        }),
    } as any),
  );
}

describe('GlobalComponent', () => {
  let component: GlobalComponent;
  let fixture: ComponentFixture<GlobalComponent>;
  let mockDataService: any;

  beforeEach(async () => {
    mockDataService = {
      loaded: signal(false),
      error: signal(null),
      worldCupTeams: signal(WORLD_CUP_TEAMS),
      load: vi.fn().mockReturnValue(Promise.resolve()),
      loadWorldCupRoster: vi.fn((team: { id: string }) =>
        Promise.resolve([
          {
            id: `${team.id}-player`,
            name: `${team.id} Player`,
            gamesPlayed: 0,
            jerseyNumbers: [9],
            nationality: team.id,
            position: 'FW',
            clubs: [
              {
                clubName: 'Old Club',
                city: 'A',
                country: 'A',
                lat: 0,
                lng: 0,
                fromYear: 2015,
                toYear: 2017,
              },
              {
                clubName: 'Middle Club',
                city: 'M',
                country: 'M',
                lat: 5,
                lng: 5,
                fromYear: 2017,
                toYear: 2018,
              },
              {
                clubName: 'Current Club',
                city: 'B',
                country: 'B',
                lat: 10,
                lng: 10,
                fromYear: 2018,
                toYear: 2024,
              },
            ],
          },
        ]),
      ),
    };

    mockFetchTopology();

    await TestBed.configureTestingModule({
      imports: [GlobalComponent],
      providers: [provideRouter([]), { provide: GeoGuesserDataService, useValue: mockDataService }],
    }).compileComponents();

    fixture = TestBed.createComponent(GlobalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load one dot per player in the selected year', async () => {
    component.ngOnInit();
    await fixture.whenStable();
    component.selectedYear.set(2020);

    expect(component.dots().length).toBe(2);
    expect(component.dots()[0].title).toContain('Current Club');
    expect(component.loading()).toBe(false);
  });

  it('should list players by career start year and then name', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    expect(component.playerList().map((player) => player.name)).toEqual([
      'argentina Player',
      'brazil Player',
    ]);
    expect(component.playerList().every((player) => player.jerseyNumbers.includes(9))).toBe(true);

    component.clubMode.set('year');
    component.selectedYear.set(2014);
    expect(component.playerList()).toHaveLength(0);

    component.selectedYear.set(2015);
    expect(component.playerList()).toHaveLength(2);
  });

  it('should rotate the selected team longitude to the horizontal map center', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    const select = document.createElement('select');
    select.append(new Option('Argentina', 'argentina'));
    select.value = 'argentina';
    component.onTeamChange({ target: select } as unknown as Event);

    const projection = (
      component as unknown as {
        _projection: { (): (coordinates: [number, number]) => [number, number] };
      }
    )._projection();
    const [x, y] = projection([WORLD_CUP_TEAMS[1].lng, WORLD_CUP_TEAMS[1].lat]);
    expect(x).toBeCloseTo(component.mapW / 2, 5);
    expect(y).not.toBeCloseTo(component.mapH / 2, 5);
  });

  it('should show only the starting club in starting mode', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('starting');

    expect(component.dots().length).toBe(2);
    expect(component.dots().every((d) => d.title.includes('Old Club'))).toBe(true);
  });

  it('should show the club before the current one in previous mode', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('previous');

    expect(component.dots().length).toBe(2);
    expect(component.dots().every((d) => d.title.includes('Middle Club'))).toBe(true);
  });

  it('should show the club after the starting one in second mode', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('second');

    expect(component.dots().length).toBe(2);
    expect(component.dots().every((d) => d.title.includes('Middle Club'))).toBe(true);
  });

  it('should show every club in career mode', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('career');

    expect(component.dots().length).toBe(6);
    expect(component.dots().some((d) => d.title.includes('Old Club'))).toBe(true);
    expect(component.dots().some((d) => d.title.includes('Middle Club'))).toBe(true);
    expect(component.dots().some((d) => d.title.includes('Current Club'))).toBe(true);
  });

  it('should show only the club(s) active during the selected year', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('year');
    component.selectedYear.set(2020);

    expect(component.dots().length).toBe(2);
    expect(component.dots().every((d) => d.title.includes('Current Club'))).toBe(true);
  });

  it('should show only the latest club at a boundary year', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('year');
    component.selectedYear.set(2017); // Old Club ends and Middle Club starts in 2017

    expect(component.dots().length).toBe(2);
    expect(component.dots().some((d) => d.title.includes('Old Club'))).toBe(false);
    expect(component.dots().some((d) => d.title.includes('Middle Club'))).toBe(true);
  });

  it('should show no dots when no club was active during the selected year', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('year');
    component.selectedYear.set(2006);

    expect(component.dots().length).toBe(0);
  });

  it('bases the year range on the earliest transfer in the data, up to 2026', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    expect(component.earliestYear()).toBe(2015);
    expect(component.maxYear).toBe(2026);
  });
});

describe('GlobalComponent single-club fallback', () => {
  let component: GlobalComponent;
  let fixture: ComponentFixture<GlobalComponent>;
  let mockDataService: any;

  beforeEach(async () => {
    mockDataService = {
      loaded: signal(false),
      error: signal(null),
      worldCupTeams: signal(WORLD_CUP_TEAMS),
      load: vi.fn().mockReturnValue(Promise.resolve()),
      loadWorldCupRoster: vi.fn((team: { id: string }) =>
        Promise.resolve([
          {
            id: `${team.id}-player`,
            name: `${team.id} Player`,
            gamesPlayed: 0,
            jerseyNumbers: [9],
            nationality: team.id,
            position: 'FW',
            clubs: [
              {
                clubName: 'Only Club',
                city: 'A',
                country: 'A',
                lat: 0,
                lng: 0,
                fromYear: 2020,
                toYear: 2024,
              },
            ],
          },
        ]),
      ),
    };

    mockFetchTopology();

    await TestBed.configureTestingModule({
      imports: [GlobalComponent],
      providers: [provideRouter([]), { provide: GeoGuesserDataService, useValue: mockDataService }],
    }).compileComponents();

    fixture = TestBed.createComponent(GlobalComponent);
    component = fixture.componentInstance;
  });

  it('falls back to the current club in previous mode when there is no earlier club', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('previous');

    expect(component.dots().length).toBe(2);
    expect(component.dots().every((d) => d.title.includes('Only Club'))).toBe(true);
  });

  it('falls back to the starting club in second mode when there is no later club', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.clubMode.set('second');

    expect(component.dots().length).toBe(2);
    expect(component.dots().every((d) => d.title.includes('Only Club'))).toBe(true);
  });
});
