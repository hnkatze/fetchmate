// Core client
export { createFetchMate, FetchMateClient } from './core/client.js';

// Resource
export { createResource } from './core/resource.js';

// Types
export type {
  FetchMateConfig,
  FetchMateInstance,
  FetchMateResponse,
  HeadersInit,
  HttpMethod,
  RequestOptions,
  ResponseTransform,
  ValidateResponseFn,
  ErrorTransformFn,
  RetryConfig,
  CacheConfig,
  RequestContext,
  ResponseContext,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  Interceptors,
  Resource,
  ResourceState,
} from './core/types.js';

// Errors
export {
  FetchMateError,
  HttpError,
  ValidationError,
  TimeoutError,
  AbortError,
  NetworkError,
  ParseError,
} from './core/errors.js';

// Utilities (for advanced use)
export { RequestCache } from './core/cache.js';
export { buildUrl, buildPath, buildQuery, joinUrl } from './core/request.js';
