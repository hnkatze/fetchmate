import type { FetchMateError } from './errors.js';

// ─── HTTP Method ───────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ─── Retry Configuration ──────────────────────────────────────

export interface RetryConfig {
  /** Max number of retries (default: 3) */
  limit: number;
  /** HTTP methods to retry (default: GET, PUT, DELETE) */
  methods?: HttpMethod[];
  /** Status codes that trigger retry (default: 408, 429, 500, 502, 503, 504) */
  statusCodes?: number[];
  /** Base delay in ms for exponential backoff (default: 300) */
  delay?: number;
  /** Max delay in ms (default: 10_000) */
  maxDelay?: number;
}

// ─── Cache Configuration ──────────────────────────────────────

export interface CacheConfig {
  /** Time-to-live in ms (default: 60_000) */
  ttl: number;
  /** Max cached entries (default: 100) */
  maxEntries?: number;
  /** HTTP methods to cache (default: GET only) */
  methods?: HttpMethod[];
  /** Auto-invalidate GET cache on successful mutations (default: true) */
  autoInvalidate?: boolean;
}

// ─── Interceptors ─────────────────────────────────────────────

export interface RequestContext {
  url: string;
  method: HttpMethod;
  headers: Headers;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ResponseContext<T = unknown> {
  url: string;
  method: HttpMethod;
  status: number;
  headers: Headers;
  data: T;
}

export type RequestInterceptor = (
  ctx: RequestContext,
) => RequestContext | Promise<RequestContext>;

export type ResponseInterceptor = (
  ctx: ResponseContext,
) => ResponseContext | Promise<ResponseContext>;

export type ErrorInterceptor = (error: Error) => Error | Promise<Error>;

export interface Interceptors {
  request: {
    use(handler: RequestInterceptor): () => void;
  };
  response: {
    use(
      onFulfilled?: ResponseInterceptor,
      onRejected?: ErrorInterceptor,
    ): () => void;
  };
}

// ─── Transform ────────────────────────────────────────────────

export type ResponseTransform = (raw: any) => any;

// ─── Validate Response ────────────────────────────────────────

/**
 * Inspects the raw parsed body and throws if the API reports a business error.
 * Runs on ALL HTTP statuses (including 200) before transform.
 */
export type ValidateResponseFn = (
  raw: unknown,
  response: ResponseContext,
) => void;

// ─── Error Transform ──────────────────────────────────────────

/** Normalizes raw error body before assigning to HttpError.data */
export type ErrorTransformFn = (data: unknown) => unknown;

// ─── Dynamic Headers ──────────────────────────────────────────

export type HeadersInit =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

// ─── Request Options ──────────────────────────────────────────

export interface RequestOptions<TRaw extends boolean = false> {
  /** Path parameters — replaces :key segments */
  params?: Record<string, string | number>;
  /** Query string parameters */
  query?: Record<string, string | number | boolean | (string | number)[]>;
  /** Request body (auto-serialized to JSON) */
  body?: unknown;
  /** Per-request headers */
  headers?: Record<string, string>;
  /** Per-request timeout in ms */
  timeout?: number;
  /** User-provided AbortSignal */
  signal?: AbortSignal;
  /** Per-request retry override */
  retry?: Partial<RetryConfig> | false;
  /** Per-request cache override */
  cache?: (Partial<CacheConfig> & { autoInvalidate?: boolean }) | false;
  /** Return the full response wrapper instead of just data */
  raw?: TRaw;
  /** Per-request transform override (set to false to skip global transform) */
  transform?: ResponseTransform | false;
  /** Per-request validate override (set to false to skip global validator) */
  validateResponse?: ValidateResponseFn | false;
}

// ─── Raw Response ─────────────────────────────────────────────

export interface FetchMateResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  url: string;
}

// ─── Resource ─────────────────────────────────────────────────

export interface ResourceState<T> {
  loading: boolean;
  data: T | undefined;
  error: Error | undefined;
}

export interface Resource<T> {
  readonly loading: boolean;
  readonly data: T | undefined;
  readonly error: Error | undefined;
  /** Re-execute GET with same path + options */
  refetch(): Promise<void>;
  /** Optimistic update — sets data without refetching */
  mutate(data: T): void;
  /** Subscribe to state changes; returns unsubscribe function */
  subscribe(cb: (state: ResourceState<T>) => void): () => void;
}

// ─── Client Configuration ─────────────────────────────────────

export interface FetchMateConfig {
  /** Base URL prepended to all request paths */
  baseUrl?: string;
  /** Static headers or function evaluated per-request */
  headers?: HeadersInit;
  /** Default timeout in ms (default: 30_000) */
  timeout?: number;
  /** Retry configuration or false to disable */
  retry?: Partial<RetryConfig> | false;
  /** Cache configuration or false to disable */
  cache?: Partial<CacheConfig> | false;
  /** Transform applied to every response before returning */
  transform?: ResponseTransform;
  /** Validate raw parsed body before transform/error-check */
  validateResponse?: ValidateResponseFn;
  /** Transform raw error body before assigning to HttpError.data */
  errorTransform?: ErrorTransformFn;
  /** Called after every successful request (after transform) */
  onSuccess?: (data: unknown, ctx: ResponseContext) => void;
  /** Called after every failed request */
  onError?: (error: FetchMateError, ctx: RequestContext) => void;
}

// ─── Client Interface ─────────────────────────────────────────

export interface FetchMateInstance {
  get<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  get<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;

  post<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  post<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;

  put<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  put<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;

  patch<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  patch<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;

  delete<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  delete<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;

  /** Create a child client with merged config */
  extend(config: FetchMateConfig): FetchMateInstance;

  /** Create a reactive resource for a GET endpoint */
  resource<T>(path: string, options?: RequestOptions<false>): Resource<T>;

  /** Interceptor registries */
  interceptors: Interceptors;
}
