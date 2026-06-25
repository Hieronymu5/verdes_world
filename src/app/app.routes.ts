import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'players',
    loadComponent: () =>
      import('./players/players.component').then((m) => m.PlayersComponent),
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
    path: '',
    redirectTo: 'game',
    pathMatch: 'full',
  },
];
