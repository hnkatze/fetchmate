import type {
  FetchMateConfig,
  FetchMateInstance,
  FetchMateResponse,
  HeadersInit as FMHeadersInit,
  HttpMethod,
  RequestContext,
  RequestOptions,
  Resource,
  ResponseContext,
  ResponseTransform,
  RetryConfig,
  ValidateResponseFn,
} from './types.js';
import {
  FetchMateError,
  HttpError,
  TimeoutError,
  AbortError,
  NetworkError,
  ParseError,
} from './errors.js';
import { createTimeoutSignal } from './timeout.js';
import { RequestCache } from './cache.js';
import { resolveRetryConfig, withRetry } from './retry.js';
import { InterceptorChain } from './interceptors.js';
import { buildUrl } from './request.js';
import { createResource } from './resource.js';

const DEFAULT_TIMEOUT = 30_000;
const MUTATION_METHODS: HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Detect FormData-like objects (instanceof + duck-typing for cross-realm) */
function isFormDataLike(body: unknown): boolean {
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true;
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as any).append === 'function' &&
    typeof (body as any).getAll === 'function'
  );
}

function isBlobLike(body: unknown): boolean {
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
  return false;
}

function isRawBody(body: unknown): boolean {
  return (
    typeof body === 'string' || isFormDataLike(body) || isBlobLike(body)
  );
}

export class FetchMateClient implements FetchMateInstance {
  private readonly config: {
    baseUrl: string;
    headers: FMHeadersInit;
    timeout: number;
    retry: FetchMateConfig['retry'];
    cache: FetchMateConfig['cache'];
    transform?: ResponseTransform;
    validateResponse?: ValidateResponseFn;
    errorTransform?: FetchMateConfig['errorTransform'];
    onSuccess?: FetchMateConfig['onSuccess'];
    onError?: FetchMateConfig['onError'];
  };

  private readonly chain: InterceptorChain;
  private readonly requestCache: RequestCache | null;

  constructor(config: FetchMateConfig = {}, chain?: InterceptorChain) {
    this.config = {
      baseUrl: config.baseUrl ?? '',
      headers: config.headers ?? {},
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      retry: config.retry,
      cache: config.cache,
      transform: config.transform,
      validateResponse: config.validateResponse,
      errorTransform: config.errorTransform,
      onSuccess: config.onSuccess,
      onError: config.onError,
    };

    this.chain = chain ?? new InterceptorChain();

    this.requestCache =
      config.cache !== false && config.cache
        ? new RequestCache(config.cache)
        : null;
  }

  get interceptors() {
    return this.chain;
  }

  get<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  get<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;
  get<T>(path: string, options?: RequestOptions<boolean>): Promise<unknown> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  post<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;
  post<T>(path: string, options?: RequestOptions<boolean>): Promise<unknown> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  put<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;
  put<T>(path: string, options?: RequestOptions<boolean>): Promise<unknown> {
    return this.request<T>('PUT', path, options);
  }

  patch<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  patch<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;
  patch<T>(path: string, options?: RequestOptions<boolean>): Promise<unknown> {
    return this.request<T>('PATCH', path, options);
  }

  delete<T>(path: string, options?: RequestOptions<false>): Promise<T>;
  delete<T>(path: string, options: RequestOptions<true>): Promise<FetchMateResponse<T>>;
  delete<T>(path: string, options?: RequestOptions<boolean>): Promise<unknown> {
    return this.request<T>('DELETE', path, options);
  }

  resource<T>(path: string, options?: RequestOptions<false>): Resource<T> {
    return createResource<T>(this, path, options);
  }

  extend(config: FetchMateConfig): FetchMateInstance {
    const parentHeaders = this.config.headers;
    let mergedHeaders: FMHeadersInit;

    if (config.headers !== undefined) {
      mergedHeaders = config.headers;
    } else {
      mergedHeaders = parentHeaders;
    }

    const merged: FetchMateConfig = {
      baseUrl: config.baseUrl ?? this.config.baseUrl,
      headers: mergedHeaders,
      timeout: config.timeout ?? this.config.timeout,
      retry: config.retry !== undefined ? config.retry : this.config.retry,
      cache: config.cache !== undefined ? config.cache : this.config.cache,
      transform: config.transform !== undefined ? config.transform : this.config.transform,
      validateResponse: config.validateResponse !== undefined ? config.validateResponse : this.config.validateResponse,
      errorTransform: config.errorTransform !== undefined ? config.errorTransform : this.config.errorTransform,
      onSuccess: config.onSuccess !== undefined ? config.onSuccess : this.config.onSuccess,
      onError: config.onError !== undefined ? config.onError : this.config.onError,
    };

    return new FetchMateClient(merged, this.chain.clone());
  }

  // ─── Private ──────────────────────────────────────────────────

  private async request<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions<boolean> = {},
  ): Promise<T | FetchMateResponse<T>> {
    const url = buildUrl(
      this.config.baseUrl,
      path,
      options.params,
      options.query,
    );

    // Check cache
    const useCache = this.shouldCache(method, options);
    if (useCache && this.requestCache) {
      const cacheKey = RequestCache.key(method, url);
      const cached = this.requestCache.get<FetchMateResponse<T>>(cacheKey);
      if (cached) {
        // Hooks do NOT fire for cache hits
        return options.raw ? cached : cached.data;
      }
    }

    const retryConfig = this.resolveRetry(options);
    const execute = () => this.executeFetch<T>(method, url, options);

    try {
      let result = retryConfig
        ? await withRetry(execute, method, retryConfig)
        : await execute();

      // Apply transform
      const transform = this.resolveTransform(options);
      if (transform) {
        result = { ...result, data: transform(result.data) };
      }

      // Cache store (after transform)
      if (useCache && this.requestCache) {
        const cacheKey = RequestCache.key(method, url);
        const ttl =
          options.cache && typeof options.cache === 'object'
            ? options.cache.ttl
            : undefined;
        this.requestCache.set(cacheKey, result, ttl);
      }

      // Cache auto-invalidation for mutations
      if (MUTATION_METHODS.includes(method) && this.requestCache) {
        const shouldInvalidate = this.shouldAutoInvalidate(options);
        if (shouldInvalidate) {
          this.requestCache.invalidateByPath(url);
        }
      }

      // onSuccess hook (never throws)
      if (this.config.onSuccess) {
        try {
          this.config.onSuccess(result.data, {
            url,
            method,
            status: result.status,
            headers: result.headers,
            data: result.data,
          });
        } catch {
          // Hooks must never break the flow
        }
      }

      return options.raw ? result : result.data;
    } catch (error) {
      // onError hook (never throws)
      if (this.config.onError && error instanceof FetchMateError) {
        try {
          this.config.onError(error, { url, method, headers: new Headers() });
        } catch {
          // Hooks must never break the flow
        }
      }
      throw error;
    }
  }

  private async executeFetch<T>(
    method: HttpMethod,
    url: string,
    options: RequestOptions<boolean>,
  ): Promise<FetchMateResponse<T>> {
    const timeout = options.timeout ?? this.config.timeout;
    const { signal, clear } = createTimeoutSignal(timeout, options.signal);

    try {
      // 1. Resolve dynamic headers
      const resolvedConfigHeaders = await this.resolveHeaders();
      const headers = new Headers(resolvedConfigHeaders);
      if (options.headers) {
        for (const [k, v] of Object.entries(options.headers)) {
          headers.set(k, v);
        }
      }

      let requestCtx: RequestContext = {
        url,
        method,
        headers,
        body: options.body,
        signal,
      };

      // 2. Apply request interceptors
      requestCtx = await this.chain.applyRequest(requestCtx);

      // 3. Build fetch init with body detection
      const init: RequestInit = {
        method,
        headers: requestCtx.headers,
        signal: requestCtx.signal,
      };

      if (requestCtx.body !== undefined && requestCtx.body !== null) {
        if (isRawBody(requestCtx.body)) {
          // FormData, Blob, or string — pass directly, don't set Content-Type
          init.body = requestCtx.body as BodyInit;
        } else {
          if (!requestCtx.headers.has('Content-Type')) {
            requestCtx.headers.set('Content-Type', 'application/json');
          }
          init.body = JSON.stringify(requestCtx.body);
        }
      }

      // 4. Execute fetch
      const response = await fetch(requestCtx.url, init);

      // 5. Parse response
      const data = await this.parseResponse<T>(response, url);

      // 6. validateResponse (runs on ALL statuses)
      const validator = this.resolveValidator(options);
      if (validator) {
        validator(data, {
          url,
          method,
          status: response.status,
          headers: response.headers,
          data: data as unknown,
        });
      }

      // 7. Error check: !response.ok → apply errorTransform → throw HttpError
      if (!response.ok) {
        let errorData: unknown = data;
        if (this.config.errorTransform) {
          try {
            errorData = this.config.errorTransform(data);
          } catch {
            // Fallback to raw data if errorTransform throws
          }
        }
        throw new HttpError(
          response.status,
          response.statusText,
          url,
          errorData,
          response.headers,
        );
      }

      // 8. Apply response interceptors
      let responseCtx = {
        url,
        method,
        status: response.status,
        headers: response.headers,
        data: data as unknown,
      };
      responseCtx = await this.chain.applyResponse(responseCtx);

      return {
        data: responseCtx.data as T,
        status: responseCtx.status,
        headers: responseCtx.headers,
        url,
      };
    } catch (error) {
      throw await this.normalizeError(error, url, timeout);
    } finally {
      clear();
    }
  }

  private async resolveHeaders(): Promise<Record<string, string>> {
    const headers = this.config.headers;
    if (typeof headers === 'function') {
      return await headers();
    }
    return headers as Record<string, string>;
  }

  private async parseResponse<T>(
    response: Response,
    url: string,
  ): Promise<T> {
    const contentType = response.headers.get('Content-Type') ?? '';

    try {
      if (response.status === 204 || response.headers.get('Content-Length') === '0') {
        return undefined as T;
      }

      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }

      return (await response.text()) as T;
    } catch (cause) {
      throw new ParseError(url, cause);
    }
  }

  private async normalizeError(
    error: unknown,
    url: string,
    timeout: number,
  ): Promise<never> {
    if (
      error instanceof HttpError ||
      error instanceof TimeoutError ||
      error instanceof AbortError ||
      error instanceof NetworkError ||
      error instanceof ParseError
    ) {
      throw await this.chain.applyError(error);
    }

    if (error instanceof DOMException) {
      const isTimeout =
        error.name === 'TimeoutError' ||
        error.message === 'The operation timed out.' ||
        error.message.includes('TimeoutError');
      const normalized = isTimeout
        ? new TimeoutError(url, timeout)
        : new AbortError(url);
      throw await this.chain.applyError(normalized);
    }

    if (error instanceof TypeError) {
      const normalized = new NetworkError(url, error);
      throw await this.chain.applyError(normalized);
    }

    throw await this.chain.applyError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  private shouldCache(
    method: HttpMethod,
    options: RequestOptions<boolean>,
  ): boolean {
    if (options.cache === false) return false;
    if (!this.requestCache) return false;
    return this.requestCache.isCacheable(method);
  }

  private shouldAutoInvalidate(options: RequestOptions<boolean>): boolean {
    if (!this.requestCache) return false;
    // Per-request override
    if (options.cache && typeof options.cache === 'object') {
      if (options.cache.autoInvalidate === false) return false;
      if (options.cache.autoInvalidate === true) return true;
    }
    // Global config
    return this.requestCache.config.autoInvalidate;
  }

  private resolveRetry(
    options: RequestOptions<boolean>,
  ): Required<RetryConfig> | null {
    if (options.retry === false) return null;
    if (this.config.retry === false) return null;

    const merged = {
      ...(typeof this.config.retry === 'object' ? this.config.retry : {}),
      ...(typeof options.retry === 'object' ? options.retry : {}),
    };

    if (!merged.limit && merged.limit !== 0 && !this.config.retry && !options.retry) {
      return null;
    }

    return resolveRetryConfig(merged);
  }

  private resolveTransform(
    options: RequestOptions<boolean>,
  ): ResponseTransform | null {
    if (options.transform === false) return null;
    if (typeof options.transform === 'function') return options.transform;
    return this.config.transform ?? null;
  }

  private resolveValidator(
    options: RequestOptions<boolean>,
  ): ValidateResponseFn | null {
    if (options.validateResponse === false) return null;
    if (typeof options.validateResponse === 'function') return options.validateResponse;
    return this.config.validateResponse ?? null;
  }
}

export function createFetchMate(config?: FetchMateConfig): FetchMateInstance {
  return new FetchMateClient(config);
}
