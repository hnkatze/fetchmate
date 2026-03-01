import { Injectable, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, httpResource } from '@angular/common/http';
import type { HttpResourceRef } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, retry, timeout } from 'rxjs/operators';

import { FETCHMATE_CONFIG } from './provider.js';
import type { NgFetchMateConfig, NgResourceOptions, NgMutationResult } from './types.js';
import { HttpError } from '../core/errors.js';
import { buildPath, buildQuery, joinUrl } from '../core/request.js';
import type { RequestOptions } from '../core/types.js';

interface NgRequestOptions
  extends Omit<RequestOptions, 'raw' | 'signal' | 'cache'> {}

@Injectable({ providedIn: 'root' })
export class NgFetchMate {
  private readonly http = inject(HttpClient);
  private readonly config = inject(FETCHMATE_CONFIG);

  get<T>(path: string, options?: NgRequestOptions): Observable<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options?: NgRequestOptions): Observable<T> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options?: NgRequestOptions): Observable<T> {
    return this.request<T>('PUT', path, options);
  }

  patch<T>(path: string, options?: NgRequestOptions): Observable<T> {
    return this.request<T>('PATCH', path, options);
  }

  delete<T>(path: string, options?: NgRequestOptions): Observable<T> {
    return this.request<T>('DELETE', path, options);
  }

  // ─── Signal-based API (Angular >=19.2) ───────────────────────

  /** Reactive signal-based GET using httpResource */
  resource<T>(
    urlFactory: () => string | undefined,
    options?: NgResourceOptions<T> & { defaultValue: T },
  ): HttpResourceRef<T>;
  resource<T>(
    urlFactory: () => string | undefined,
    options?: NgResourceOptions<T>,
  ): HttpResourceRef<T | undefined>;
  resource<T>(
    urlFactory: () => string | undefined,
    options: NgResourceOptions<T> = {},
  ): HttpResourceRef<T | undefined> {
    const baseUrl = this.config.baseUrl ?? '';

    const resolvedUrlFactory = () => {
      const rawUrl = urlFactory();
      if (rawUrl === undefined) return undefined;
      const resolvedPath = buildPath(rawUrl, options.params);
      const url = joinUrl(baseUrl, resolvedPath);
      const qs = buildQuery(options.query);
      return `${url}${qs}`;
    };

    const resourceOptions: Record<string, unknown> = {};
    if (options.parse) resourceOptions['parse'] = options.parse;
    if (options.defaultValue !== undefined) resourceOptions['defaultValue'] = options.defaultValue;

    return httpResource<T>(resolvedUrlFactory, resourceOptions as any);
  }

  /** Signal-based POST mutation */
  postSignal<T>(path: string, options?: NgRequestOptions): NgMutationResult<T> {
    return this.mutationSignal<T>('POST', path, options);
  }

  /** Signal-based PUT mutation */
  putSignal<T>(path: string, options?: NgRequestOptions): NgMutationResult<T> {
    return this.mutationSignal<T>('PUT', path, options);
  }

  /** Signal-based PATCH mutation */
  patchSignal<T>(path: string, options?: NgRequestOptions): NgMutationResult<T> {
    return this.mutationSignal<T>('PATCH', path, options);
  }

  /** Signal-based DELETE mutation */
  deleteSignal<T>(path: string, options?: NgRequestOptions): NgMutationResult<T> {
    return this.mutationSignal<T>('DELETE', path, options);
  }

  private mutationSignal<T>(
    method: string,
    path: string,
    options: NgRequestOptions = {},
  ): NgMutationResult<T> {
    const value = signal<T | undefined>(undefined);
    const error = signal<HttpError | undefined>(undefined);
    const isLoading = signal<boolean>(true);

    this.request<T>(method, path, options)
      .pipe(finalize(() => isLoading.set(false)))
      .subscribe({
        next: (data) => value.set(data),
        error: (err) => error.set(err),
      });

    return {
      value: value.asReadonly(),
      error: error.asReadonly(),
      isLoading: isLoading.asReadonly(),
    };
  }

  // ─── Observable-based pipeline ───────────────────────────────

  private request<T>(
    method: string,
    path: string,
    options: NgRequestOptions = {},
  ): Observable<T> {
    const resolvedPath = buildPath(path, options.params);
    const url = joinUrl(this.config.baseUrl ?? '', resolvedPath);

    const headers = new HttpHeaders({
      ...this.config.headers,
      ...options.headers,
    });

    let params = new HttpParams();
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            params = params.append(key, String(item));
          }
        } else if (value !== undefined && value !== null) {
          params = params.set(key, String(value));
        }
      }
    }

    const httpOptions: Record<string, unknown> = {
      headers,
      params,
    };

    let source$: Observable<T>;

    if (method === 'GET' || method === 'DELETE') {
      source$ = this.http.request<T>(method, url, httpOptions);
    } else {
      source$ = this.http.request<T>(method, url, {
        ...httpOptions,
        body: options.body,
      });
    }

    // Apply timeout
    const timeoutMs = options.timeout ?? this.config.timeout ?? 30_000;
    source$ = source$.pipe(timeout(timeoutMs));

    // Apply retry
    const retryOpt = options.retry;
    if (retryOpt && typeof retryOpt === 'object' && retryOpt.limit) {
      source$ = source$.pipe(retry(retryOpt.limit));
    } else {
      const globalRetry = this.config.retry;
      if (globalRetry && typeof globalRetry === 'object' && globalRetry.limit) {
        source$ = source$.pipe(retry(globalRetry.limit));
      }
    }

    // Map errors
    source$ = source$.pipe(
      catchError((err) => {
        if (err.status) {
          return throwError(
            () =>
              new HttpError(
                err.status,
                err.statusText ?? '',
                url,
                err.error,
                new Headers(),
              ),
          );
        }
        return throwError(() => err);
      }),
    );

    return source$;
  }
}
