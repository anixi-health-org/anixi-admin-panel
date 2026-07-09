import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return combineLatest([authService.authReady$, authService.isAuthenticatedAdmin$]).pipe(
    filter(([ready]) => ready),
    take(1),
    map(([, isAdmin]) => (isAdmin ? true : router.createUrlTree(['/login'])))
  );
};
