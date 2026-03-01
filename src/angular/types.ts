import type { Signal } from '@angular/core';
import type { FetchMateConfig } from '../core/types.js';
import type { HttpError } from '../core/errors.js';

export interface NgFetchMateConfig extends FetchMateConfig {
  /** If true, errors are not rethrown but returned as EMPTY (default: false) */
  swallowErrors?: boolean;
}

/** Options for signal-based resource GET (Angular >=19.2) */
export interface NgResourceOptions<T = unknown> {
  /** Path parameters — replaces :key segments */
  params?: Record<string, string | number>;
  /** Query string parameters */
  query?: Record<string, string | number | boolean | (string | number)[]>;
  /** Per-request headers */
  headers?: Record<string, string>;
  /** Parse/validate function (e.g., Zod schema.parse) */
  parse?: (raw: unknown) => T;
  /** Default value while loading */
  defaultValue?: T;
}

/** Result of a signal-based mutation (Angular >=19.2) */
export interface NgMutationResult<T> {
  /** Response data signal (undefined while loading or on error) */
  readonly value: Signal<T | undefined>;
  /** Error signal (undefined on success) */
  readonly error: Signal<HttpError | undefined>;
  /** Loading state signal */
  readonly isLoading: Signal<boolean>;
}
