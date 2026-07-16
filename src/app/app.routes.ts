import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'players',
    loadComponent: () => import('./players/players.component').then((m) => m.PlayersComponent),
  },
  {
    path: 'players/:player-id',
    loadComponent: () =>
      import('./players/player-detail/player-detail.component').then(
        (m) => m.PlayerDetailComponent,
      ),
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about.component').then((m) => m.AboutComponent),
  },
  {
    path: 'game',
    loadComponent: () =>
      import('./geo-guesser/geo-guesser.component').then((m) => m.GeoGuesserComponent),
  },
  {
    path: 'report',
    loadComponent: () => import('./report/report.component').then((m) => m.ReportComponent),
  },
  {
    path: 'global',
    loadComponent: () => import('./global/global.component').then((m) => m.GlobalComponent),
  },
  {
    path: '',
    redirectTo: 'game',
    pathMatch: 'full',
  },
];
