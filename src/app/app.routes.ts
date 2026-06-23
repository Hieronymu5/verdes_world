import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';

const developmentOnlyRoutes: Routes = isDevMode()
  ? [
      {
        path: 'players',
        loadComponent: () =>
          import('./players-debug/players-debug.component').then((m) => m.PlayersDebugComponent),
      },
    ]
  : [];

export const routes: Routes = [
  ...developmentOnlyRoutes,
  {
    path: 'geo-guesser',
    loadComponent: () =>
      import('./geo-guesser/geo-guesser.component').then((m) => m.GeoGuesserComponent),
  },
  {
    path: '',
    redirectTo: 'geo-guesser',
    pathMatch: 'full',
  },
];
