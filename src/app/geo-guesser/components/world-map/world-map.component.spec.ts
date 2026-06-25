import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorldMapComponent } from './world-map.component';
import { ComponentRef } from '@angular/core';
import { vi } from 'vitest';

describe('WorldMapComponent', () => {
  let component: WorldMapComponent;
  let fixture: ComponentFixture<WorldMapComponent>;
  let componentRef: ComponentRef<WorldMapComponent>;

  beforeEach(async () => {
    vi.spyOn(window, 'fetch').mockReturnValue(Promise.resolve({
      json: () => Promise.resolve({
        objects: {
          land: { type: 'GeometryCollection', geometries: [] },
          countries: { type: 'GeometryCollection', geometries: [] }
        }
      })
    } as any));

    await TestBed.configureTestingModule({
      imports: [WorldMapComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(WorldMapComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    
    componentRef.setInput('player', {
      playerId: '1',
      name: 'Test Player',
      clubs: [
        { clubName: 'Club A', fromYear: 2010, toYear: 2015, lat: 0, lng: 0 },
        { clubName: 'Club B', fromYear: 2015, toYear: 2020, lat: 10, lng: 10 }
      ]
    });
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute map points', () => {
    expect(component.mapPoints().length).toBe(2);
  });
  
  it('should recognize Austin FC', () => {
    expect(component.isAustin({ clubName: 'Austin FC', fromYear: 2020, toYear: 2022, lat: 0, lng: 0, city: 'Austin', country: 'USA' })).toBe(true);
    expect(component.isAustin({ clubName: 'Test FC', fromYear: 2020, toYear: 2022, lat: 0, lng: 0, city: 'Austin', country: 'USA' })).toBe(false);
  });
});
