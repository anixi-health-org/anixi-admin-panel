import { NO_ERRORS_SCHEMA, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { routerTestProviders } from './router-test-providers';

type LegacyComponentTestOptions = {
  providers?: unknown[];
  imports?: unknown[];
};

/** Default TestBed setup for legacy NgModule page/component specs. */
export async function configureLegacyComponentTest(
  declarations: Type<unknown>[],
  options?: LegacyComponentTestOptions,
): Promise<void> {
  await TestBed.configureTestingModule({
    declarations,
    imports: options?.imports ?? [],
    providers: [...routerTestProviders, ...(options?.providers ?? [])],
    schemas: [NO_ERRORS_SCHEMA],
  }).compileComponents();
}
