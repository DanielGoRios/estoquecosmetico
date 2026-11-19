import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Api } from './api';

export const authGuard: CanActivateFn = () => {
  const api = inject(Api);
  return api.session() ? true : inject(Router).createUrlTree(['/login']);
};
export const adminGuard: CanActivateFn = () => {
  const api = inject(Api);
  if (!api.session()) return inject(Router).createUrlTree(['/login']);
  return api.isAdmin() ? true : inject(Router).createUrlTree(['/dashboard']);
};
