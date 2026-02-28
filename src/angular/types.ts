import type { FetchMateConfig } from '../core/types.js';

export interface NgFetchMateConfig extends FetchMateConfig {
  /** If true, errors are not rethrown but returned as EMPTY (default: false) */
  swallowErrors?: boolean;
}
