# fetchmate

A typed HTTP client built on the Fetch API — with response validation, reactive state, interceptors, retry, caching, and Angular support.

## Features

- **Fully typed** — generic methods infer response types end-to-end
- **Response validation** — catch `{ success: false }` on HTTP 200 before it reaches your code
- **Response transform** — unwrap `{ data, message, success }` envelopes automatically
- **Reactive state** — `resource()` returns `{ loading, data, error }` with subscriptions
- **Error hierarchy** — distinct classes for HTTP, timeout, abort, network, parse, and validation errors
- **Typed errors** — `HttpError<TError>` gives you typed `error.data` with `errorTransform`
- **Dynamic headers** — pass a function that resolves auth tokens on every request
- **Lifecycle hooks** — global `onSuccess` / `onError` for toasts, logging, analytics
- **Interceptors** — transform requests and responses, or handle errors globally
- **Retry** — exponential backoff with jitter, configurable limits and status codes
- **Cache** — in-memory TTL cache with auto-invalidation on mutations
- **FormData / Blob** — auto-detected, no manual Content-Type handling needed
- **Timeout** — global default plus per-request override, merged with AbortSignal
- **Path & query params** — `:id` substitution, array serialization
- **Child clients** — `extend()` inherits config, interceptors, and all options
- **Angular support** — `NgFetchMate` service with Observable and Signal-based APIs
- **Zero dependencies** — core uses only the native Fetch API

## Installation

```bash
npm install fetchmate
```

Angular peer dependencies (only required for the Angular integration):

```bash
npm install @angular/core @angular/common rxjs
```

## Quick Start

```typescript
import { createFetchMate } from 'fetchmate';

const api = createFetchMate({
  baseUrl: 'https://api.example.com/v1',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
  transform: (raw) => raw.data,
  validateResponse: (raw) => {
    if (raw?.success === false) throw new Error(raw.message);
  },
  onError: (error) => toast.error(error.message),
  timeout: 10_000,
  retry: { limit: 3 },
  cache: { ttl: 60_000 },
});

// Typed requests — returns User[], not the wrapper
const users = await api.get<User[]>('/users');

// Reactive state
const resource = api.resource<User[]>('/users');
resource.subscribe(({ loading, data, error }) => {
  console.log({ loading, data, error });
});
```

---

## API Reference

### `createFetchMate(config?)`

```typescript
const api = createFetchMate(config?: FetchMateConfig): FetchMateInstance;
```

#### `FetchMateConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `''` | Base URL prepended to every request path |
| `headers` | `Record<string, string>` \| `() => Record \| Promise<Record>` | `{}` | Static headers or function evaluated per-request |
| `timeout` | `number` | `30_000` | Global timeout in milliseconds |
| `retry` | `Partial<RetryConfig> \| false` | — | Retry configuration; `false` disables |
| `cache` | `Partial<CacheConfig> \| false` | — | Cache configuration; `false` disables |
| `transform` | `(raw: any) => any` | — | Unwrap response envelopes globally |
| `validateResponse` | `(raw, ctx) => void` | — | Validate raw body; throw to reject |
| `errorTransform` | `(data: unknown) => unknown` | — | Normalize error body before `HttpError.data` |
| `onSuccess` | `(data, ctx) => void` | — | Called after every successful request |
| `onError` | `(error, ctx) => void` | — | Called after every failed request |

---

### HTTP Methods

```typescript
api.get<T>(path, options?): Promise<T>
api.post<T>(path, options?): Promise<T>
api.put<T>(path, options?): Promise<T>
api.patch<T>(path, options?): Promise<T>
api.delete<T>(path, options?): Promise<T>
```

#### `RequestOptions`

| Option | Type | Description |
|--------|------|-------------|
| `params` | `Record<string, string \| number>` | Path parameter values (`:key` segments) |
| `query` | `Record<string, string \| number \| boolean \| array>` | Query string parameters |
| `body` | `unknown` | Request body — JSON-serialized (or raw for FormData/Blob) |
| `headers` | `Record<string, string>` | Per-request headers (override config) |
| `timeout` | `number` | Per-request timeout in ms |
| `signal` | `AbortSignal` | External abort signal |
| `retry` | `Partial<RetryConfig> \| false` | Per-request retry override |
| `cache` | `Partial<CacheConfig> \| false` | Per-request cache override |
| `raw` | `boolean` | Return full `FetchMateResponse<T>` |
| `transform` | `fn \| false` | Per-request transform override |
| `validateResponse` | `fn \| false` | Per-request validation override |

---

### Response Validation

Catch API-level errors that come back as HTTP 200:

```typescript
// Your API returns: { success: false, message: "Email taken", data: null }
// Without validation: you'd get null back and no error

const api = createFetchMate({
  baseUrl: 'https://api.example.com',
  transform: (raw) => raw.data,
  validateResponse: (raw, ctx) => {
    if (raw?.success === false) {
      throw new Error(raw.message); // "Email taken"
    }
  },
});

try {
  const user = await api.post<User>('/users', { body: { email: 'taken@test.com' } });
} catch (error) {
  console.error(error.message); // "Email taken"
}
```

**Pipeline order**: `fetch → parse → validateResponse → errorCheck → interceptors → transform`

- Runs on ALL HTTP statuses (200, 422, etc.)
- Throws **before** `transform` runs, so your transform never sees bad data
- Disable per-request: `{ validateResponse: false }`
- Override per-request: `{ validateResponse: (raw) => { ... } }`

---

### Response Transform

Unwrap encapsulated API responses once, use everywhere:

```typescript
const api = createFetchMate({
  baseUrl: 'https://api.example.com',
  transform: (raw) => raw.data,
});

// API returns: { success: true, message: "OK", data: [{ id: 1, name: "Alice" }] }
const users = await api.get<User[]>('/users');
// users = [{ id: 1, name: "Alice" }] — already unwrapped

// Skip transform for a specific request
const full = await api.get<ApiResponse>('/users', { transform: false });

// Override transform for a specific request
const msg = await api.get<string>('/users', { transform: (raw) => raw.message });
```

---

### Reactive State — `resource()`

Get `{ loading, data, error }` with automatic fetching and subscriptions:

```typescript
const users = api.resource<User[]>('/users');

// Initial state: loading=true, data=undefined, error=undefined
// Auto-fetches on creation

users.subscribe(({ loading, data, error }) => {
  if (loading) showSpinner();
  else if (error) showError(error.message);
  else renderUsers(data);
});

// Refetch
await users.refetch();

// Optimistic update (no network call)
users.mutate([...users.data!, newUser]);
```

Also available as a standalone factory:

```typescript
import { createResource } from 'fetchmate';

const users = createResource<User[]>(api, '/users', { query: { active: true } });
```

---

### Dynamic Headers

Pass a function to resolve headers on every request — great for auth tokens:

```typescript
const api = createFetchMate({
  baseUrl: 'https://api.example.com',
  headers: () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'X-Request-Id': crypto.randomUUID(),
  }),
});

// Async headers are also supported
const api2 = createFetchMate({
  headers: async () => {
    const token = await refreshTokenIfExpired();
    return { Authorization: `Bearer ${token}` };
  },
});
```

Per-request headers always override config headers on key conflicts.

---

### Error Handling

#### Error classes

| Class | When thrown | Notable properties |
|-------|-------------|-------------------|
| `HttpError<TError>` | Non-2xx response | `status`, `statusText`, `url`, `data: TError`, `headers` |
| `ValidationError` | `validateResponse` throws | `url`, `data`, `message` |
| `TimeoutError` | Timeout exceeded | `url`, `timeout` |
| `AbortError` | Request cancelled | `url` |
| `NetworkError` | No connection | `url`, `cause` |
| `ParseError` | Body parse failure | `url`, `cause` |

All extend `FetchMateError` which extends `Error`.

#### Typed error data with `errorTransform`

```typescript
interface ApiError {
  code: string;
  message: string;
}

const api = createFetchMate({
  baseUrl: 'https://api.example.com',
  errorTransform: (raw: any) => ({
    code: raw?.code ?? 'UNKNOWN',
    message: raw?.message ?? 'Something went wrong',
  }),
});

try {
  await api.get('/protected');
} catch (error) {
  if (error instanceof HttpError) {
    const { code, message } = error.data as ApiError;
    console.error(`[${code}] ${message}`);
  }
}
```

If `errorTransform` throws, fetchmate falls back to the raw response body — your app never breaks.

#### Full error handling example

```typescript
import { HttpError, TimeoutError, NetworkError, ValidationError } from 'fetchmate';

try {
  const user = await api.get<User>('/users/999');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('API validation failed:', error.message);
  } else if (error instanceof HttpError) {
    console.error(`HTTP ${error.status}:`, error.data);
  } else if (error instanceof TimeoutError) {
    console.error(`Timed out after ${error.timeout}ms`);
  } else if (error instanceof NetworkError) {
    console.error('No connection');
  }
}
```

---

### Lifecycle Hooks

Global callbacks for cross-cutting concerns. Hooks never break the request flow — if a hook throws, the error is silently caught.

```typescript
const api = createFetchMate({
  baseUrl: 'https://api.example.com',
  transform: (raw) => raw.data,
  onSuccess: (data, ctx) => {
    analytics.track('api_success', { method: ctx.method, url: ctx.url });
  },
  onError: (error, ctx) => {
    toast.error(error.message);
    Sentry.captureException(error);
  },
});
```

- `onSuccess` receives **transformed** data (after `transform`)
- `onError` receives the normalized `FetchMateError`
- Hooks do **not** fire for cache hits
- Hooks do **not** affect return values or thrown errors

---

### Interceptors

Transform every request or response, with unsubscribe support.

```typescript
// Add a header to every request
const unsub = api.interceptors.request.use((ctx) => {
  ctx.headers.set('X-Trace-Id', generateId());
  return ctx;
});

// Log responses
api.interceptors.response.use((ctx) => {
  console.log(`[${ctx.status}] ${ctx.method} ${ctx.url}`);
  return ctx;
});

// Handle errors globally
api.interceptors.response.use(undefined, (error) => {
  if (error instanceof HttpError && error.status === 401) {
    window.location.href = '/login';
  }
  return error;
});

// Stop an interceptor
unsub();
```

---

### Retry

Exponential backoff with jitter, configurable per-client or per-request.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | `3` | Max retry attempts |
| `methods` | `HttpMethod[]` | `['GET', 'PUT', 'DELETE']` | Methods eligible for retry |
| `statusCodes` | `number[]` | `[408, 429, 500, 502, 503, 504]` | Status codes that trigger retry |
| `delay` | `number` | `300` | Base delay in ms |
| `maxDelay` | `number` | `10_000` | Maximum delay cap |

```typescript
const api = createFetchMate({
  retry: { limit: 3, delay: 500 },
});

// Disable retry for a specific request
await api.post('/auth/token', { body: creds, retry: false });
```

---

### Cache

In-memory TTL cache with automatic mutation invalidation.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `60_000` | Time-to-live in ms |
| `maxEntries` | `number` | `100` | Max cached entries |
| `methods` | `HttpMethod[]` | `['GET']` | Methods to cache |
| `autoInvalidate` | `boolean` | `true` | Invalidate GET cache on mutations |

```typescript
const api = createFetchMate({
  cache: { ttl: 30_000 },
});

// First call: network request
const users = await api.get<User[]>('/users');

// Second call: served from cache
const cached = await api.get<User[]>('/users');

// POST to /users → auto-invalidates GET /users cache
await api.post('/users', { body: newUser });

// Next GET hits the network again (cache was invalidated)
const fresh = await api.get<User[]>('/users');
```

Disable auto-invalidation:

```typescript
// Globally
createFetchMate({ cache: { ttl: 30_000, autoInvalidate: false } });

// Per-request
await api.post('/users', { body: data, cache: { autoInvalidate: false } });
```

---

### FormData & File Upload

FormData and Blob bodies are auto-detected — no manual Content-Type handling needed:

```typescript
const form = new FormData();
form.append('avatar', file);
form.append('name', 'Jane');

// Content-Type is automatically set to multipart/form-data with boundary
await api.post('/users/avatar', { body: form });

// Blob bodies also work
const blob = new Blob([csvData], { type: 'text/csv' });
await api.post('/import', { body: blob });
```

---

### Timeout

```typescript
const api = createFetchMate({ timeout: 15_000 });

// Per-request override
await api.get('/slow', { timeout: 60_000 });

// Combine with user AbortSignal
const controller = new AbortController();
await api.get('/data', { signal: controller.signal, timeout: 5_000 });
```

---

### Path & Query Parameters

```typescript
// Path params — /users/42/posts/15
await api.get('/users/:userId/posts/:postId', {
  params: { userId: 42, postId: 15 },
});

// Query params — /products?category=electronics&inStock=true
await api.get('/products', {
  query: { category: 'electronics', inStock: true },
});

// Array query params — /search?tag=ts&tag=node
await api.get('/search', {
  query: { tag: ['ts', 'node'] },
});
```

---

### `extend()` — Child Clients

Create scoped clients that inherit all parent config:

```typescript
const api = createFetchMate({
  baseUrl: 'https://api.example.com/v1',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
  transform: (raw) => raw.data,
  validateResponse: (raw) => { if (!raw.success) throw new Error(raw.message); },
  onError: (err) => toast.error(err.message),
});

// Child inherits everything, adds extra header
const adminApi = api.extend({
  headers: { 'X-Admin': 'true' },
});

// Child overrides transform
const rawApi = api.extend({
  transform: (raw) => raw, // no unwrapping
});
```

---

### Raw Mode

Access the full response metadata:

```typescript
const response = await api.get<User>('/users/1', { raw: true });

response.status;  // 200
response.headers; // Headers
response.url;     // full URL
response.data;    // User (after transform)
```

---

## Angular

The `fetchmate/angular` entry point provides an Angular-native integration built on `HttpClient`.

### Setup

```typescript
// app.config.ts
import { provideHttpClient } from '@angular/common/http';
import { provideFetchMate } from 'fetchmate/angular';

export const appConfig = {
  providers: [
    provideHttpClient(),
    provideFetchMate({
      baseUrl: 'https://api.example.com/v1',
      timeout: 15_000,
    }),
  ],
};
```

### Usage

```typescript
import { inject } from '@angular/core';
import { NgFetchMate } from 'fetchmate/angular';

export class UsersComponent {
  private readonly http = inject(NgFetchMate);

  readonly users$ = this.http.get<User[]>('/users');
}
```

```html
@if (users$ | async; as users) {
  @for (user of users; track user.id) {
    <div>{{ user.name }}</div>
  }
}
```

All methods return `Observable<T>` and support the same options as the core client (params, query, body, headers, timeout, retry).

### Signal-based API (Angular >=19.2)

For projects using Angular's full signals approach, `NgFetchMate` also provides signal-based methods that coexist with the Observable API.

#### Reactive GET with `resource()`

Uses Angular's `httpResource` under the hood — the request re-fires automatically when signals in the URL factory change:

```typescript
import { signal, computed } from '@angular/core';
import { NgFetchMate } from 'fetchmate/angular';

export class UserProfile {
  private readonly http = inject(NgFetchMate);

  readonly userId = signal(1);
  readonly user = this.http.resource<User>(() => `/users/${this.userId()}`);
}
```

```html
@if (user.hasValue()) {
  <h1>{{ user.value().name }}</h1>
} @else if (user.isLoading()) {
  <spinner />
} @else if (user.error()) {
  <error-message [error]="user.error()" />
}
```

The returned `HttpResourceRef<T>` exposes signals: `value()`, `isLoading()`, `error()`, `hasValue()`, and a `reload()` method.

#### Resource options

```typescript
// With path params and query
readonly posts = this.http.resource<Post[]>(
  () => `/users/${this.userId()}/posts`,
  {
    params: { userId: this.userId() },
    query: { limit: 10 },
  },
);

// With response validation (e.g., Zod)
readonly user = this.http.resource<User>(
  () => `/users/${this.userId()}`,
  { parse: userSchema.parse },
);

// With default value (removes undefined from type)
readonly users = this.http.resource<User[]>(
  () => '/users',
  { defaultValue: [] },
);

// Return undefined to skip the request (resource stays idle)
readonly user = this.http.resource<User>(
  () => this.userId() ? `/users/${this.userId()}` : undefined,
);
```

#### Signal-based mutations

For POST, PUT, PATCH, and DELETE, use the signal mutation methods. They reuse the same Observable pipeline (timeout, retry, error mapping) and expose the result as signals:

```typescript
export class UserForm {
  private readonly http = inject(NgFetchMate);

  save(data: CreateUser) {
    const result = this.http.postSignal<User>('/users', { body: data });

    // result.value()     — Signal<User | undefined>
    // result.error()     — Signal<HttpError | undefined>
    // result.isLoading() — Signal<boolean>
    return result;
  }
}
```

All mutation methods:

```typescript
http.postSignal<T>(path, options?)    // → NgMutationResult<T>
http.putSignal<T>(path, options?)     // → NgMutationResult<T>
http.patchSignal<T>(path, options?)   // → NgMutationResult<T>
http.deleteSignal<T>(path, options?)  // → NgMutationResult<T>
```

#### `NgMutationResult<T>`

| Signal | Type | Description |
|--------|------|-------------|
| `value` | `Signal<T \| undefined>` | Response data (undefined while loading or on error) |
| `error` | `Signal<HttpError \| undefined>` | Error (undefined on success) |
| `isLoading` | `Signal<boolean>` | Whether the request is in flight |

> **Note**: Signal-based methods require Angular >=19.2. Observable methods (`get`, `post`, `put`, `patch`, `delete`) continue to work on Angular >=17.

---

## TypeScript

### Exported types

```typescript
// Core types
import type {
  FetchMateConfig,
  FetchMateInstance,
  FetchMateResponse,
  RequestOptions,
  HttpMethod,
  HeadersInit,
  RetryConfig,
  CacheConfig,
  ResponseTransform,
  ValidateResponseFn,
  ErrorTransformFn,
  RequestContext,
  ResponseContext,
  Resource,
  ResourceState,
} from 'fetchmate';

// Angular types
import type {
  NgFetchMateConfig,
  NgResourceOptions,
  NgMutationResult,
} from 'fetchmate/angular';
```

---

## Request Pipeline

The full execution order with all features enabled:

```
1. Resolve dynamic headers
2. Detect body type (FormData/Blob → raw, object → JSON)
3. Apply request interceptors
4. fetch()
5. Parse response (JSON / text / undefined)
6. validateResponse (runs on ALL statuses)
7. Error check (!response.ok → errorTransform → throw HttpError)
8. Apply response interceptors
9. Apply transform
10. Cache store / auto-invalidation
11. onSuccess / onError hooks
```

---

## License

MIT
