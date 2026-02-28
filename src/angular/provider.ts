import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { NgFetchMateConfig } from './types.js';

export const FETCHMATE_CONFIG = new InjectionToken<NgFetchMateConfig>(
  'FETCHMATE_CONFIG',
);

/**
 * Provide FetchMate configuration at the application level.
 *
 * @example
 * ```ts
 * // app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideFetchMate({ baseUrl: 'https://api.example.com' }),
 *   ],
 * };
 * ```
 */
export function provideFetchMate(config: NgFetchMateConfig) {
  return makeEnvironmentProviders([
    { provide: FETCHMATE_CONFIG, useValue: config },
  ]);
}
