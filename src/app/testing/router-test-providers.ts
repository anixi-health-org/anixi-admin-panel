import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

/** Minimal router stubs for standalone component specs. */
export const routerTestProviders = [
  {
    provide: ActivatedRoute,
    useValue: {
      snapshot: { params: {}, queryParams: {}, data: {} },
      params: of({}),
      queryParams: of({}),
      data: of({}),
    },
  },
  {
    provide: Router,
    useValue: {
      navigate: () => Promise.resolve(true),
      navigateByUrl: () => Promise.resolve(true),
      events: of(),
    },
  },
];
