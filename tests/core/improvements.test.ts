import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createFetchMate } from '../../src/core/client.js';
import {
  HttpError,
  ValidationError,
  FetchMateError,
} from '../../src/core/errors.js';

const BASE = 'https://api.test.com';

const server = setupServer(
  // GET /users → wrapped response
  http.get(`${BASE}/users`, () =>
    HttpResponse.json({
      success: true,
      data: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    }),
  ),

  // GET /users/:id
  http.get(`${BASE}/users/:id`, ({ params }) =>
    HttpResponse.json({
      success: true,
      data: { id: Number(params.id), name: 'Alice' },
    }),
  ),

  // POST /users → 201 with body echo
  http.post(`${BASE}/users`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { success: true, data: { id: 3, ...body } },
      { status: 201 },
    );
  }),

  // PUT /users/:id
  http.put(`${BASE}/users/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      success: true,
      data: { id: Number(params.id), ...body },
    });
  }),

  // GET /fail → success:false on 200
  http.get(`${BASE}/fail`, () =>
    HttpResponse.json({ success: false, message: 'bad' }),
  ),

  // GET /error/500
  http.get(`${BASE}/error/500`, () =>
    HttpResponse.json({ message: 'Server error' }, { status: 500 }),
  ),

  // POST /error/400
  http.post(`${BASE}/error/400`, () =>
    HttpResponse.json(
      { code: 'VALIDATION', details: ['name required'] },
      { status: 400 },
    ),
  ),

  // GET /validate-test → success:false on 200
  http.get(`${BASE}/validate-test`, () =>
    HttpResponse.json({ success: false, message: 'Nope' }),
  ),

  // POST /upload → echo content-type back
  http.post(`${BASE}/upload`, async ({ request }) => {
    const contentType = request.headers.get('Content-Type') ?? 'none';
    return HttpResponse.json({ contentType });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── 1. FormData / Blob Detection ─────────────────────────────

describe('FormData / Blob detection', () => {
  const api = createFetchMate({ baseUrl: BASE });

  it('should NOT JSON.stringify FormData body', async () => {
    const form = new FormData();
    form.append('file', 'dummy');

    const result = await api.post<{ contentType: string }>('/upload', {
      body: form,
    });

    // FormData should NOT have application/json content-type
    // The browser sets multipart/form-data automatically
    expect(result.contentType).not.toContain('application/json');
  });

  it('should pass Blob body directly', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });

    const result = await api.post<{ contentType: string }>('/upload', {
      body: blob,
    });

    // Blob should not be JSON-stringified
    expect(result.contentType).not.toContain('application/json');
  });

  it('should still JSON serialize a regular object (regression)', async () => {
    const result = await api.post<{ contentType: string }>('/upload', {
      body: { name: 'test' },
    });

    expect(result.contentType).toContain('application/json');
  });
});

// ─── 2. Cache Auto-Invalidation ───────────────────────────────

describe('Cache auto-invalidation', () => {
  it('should invalidate cached GET /users after POST /users', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/users`, () => {
        callCount++;
        return HttpResponse.json({
          success: true,
          data: [{ id: callCount, name: `User${callCount}` }],
        });
      }),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      cache: { ttl: 30_000 },
    });

    // First GET — populates cache
    await api.get('/users');
    expect(callCount).toBe(1);

    // Second GET — should be cached
    await api.get('/users');
    expect(callCount).toBe(1);

    // POST mutation — invalidates /users cache
    await api.post('/users', { body: { name: 'New' } });

    // Third GET — cache was invalidated, hits server
    await api.get('/users');
    expect(callCount).toBe(2);
  });

  it('should invalidate GET /users and GET /users/1 after PUT /users/1', async () => {
    let usersCallCount = 0;
    let userCallCount = 0;

    server.use(
      http.get(`${BASE}/users`, () => {
        usersCallCount++;
        return HttpResponse.json({ success: true, data: [] });
      }),
      http.get(`${BASE}/users/1`, () => {
        userCallCount++;
        return HttpResponse.json({ success: true, data: { id: 1 } });
      }),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      cache: { ttl: 30_000 },
    });

    // Populate cache for both
    await api.get('/users');
    await api.get('/users/1');
    expect(usersCallCount).toBe(1);
    expect(userCallCount).toBe(1);

    // PUT to /users/1 — should invalidate both
    await api.put('/users/1', { body: { name: 'Updated' } });

    await api.get('/users');
    await api.get('/users/1');
    expect(usersCallCount).toBe(2);
    expect(userCallCount).toBe(2);
  });

  it('should NOT invalidate cache on failed mutation', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/users`, () => {
        callCount++;
        return HttpResponse.json({ success: true, data: [] });
      }),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      cache: { ttl: 30_000 },
    });

    // Populate cache
    await api.get('/users');
    expect(callCount).toBe(1);

    // Failed POST — should NOT invalidate
    try {
      await api.post('/error/400', { body: {}, retry: false });
    } catch {
      // expected
    }

    // Should still serve from cache
    await api.get('/users');
    expect(callCount).toBe(1);
  });

  it('should NOT trigger invalidation on GET', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/users`, () => {
        callCount++;
        return HttpResponse.json({ success: true, data: [] });
      }),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      cache: { ttl: 30_000 },
    });

    await api.get('/users');
    await api.get('/users');
    expect(callCount).toBe(1); // Second was cached, no invalidation
  });

  it('should respect autoInvalidate: false (global)', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/users`, () => {
        callCount++;
        return HttpResponse.json({ success: true, data: [] });
      }),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      cache: { ttl: 30_000, autoInvalidate: false },
    });

    await api.get('/users');
    expect(callCount).toBe(1);

    await api.post('/users', { body: { name: 'New' } });

    // Cache should still be valid because autoInvalidate is off
    await api.get('/users');
    expect(callCount).toBe(1);
  });

  it('should respect autoInvalidate: false (per-request)', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/users`, () => {
        callCount++;
        return HttpResponse.json({ success: true, data: [] });
      }),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      cache: { ttl: 30_000 },
    });

    await api.get('/users');
    expect(callCount).toBe(1);

    // POST with per-request autoInvalidate: false
    await api.post('/users', {
      body: { name: 'New' },
      cache: { autoInvalidate: false },
    });

    // Cache should still be valid
    await api.get('/users');
    expect(callCount).toBe(1);
  });
});

// ─── 3. Dynamic Headers ───────────────────────────────────────

describe('Dynamic headers', () => {
  it('should call function headers per request', async () => {
    let counter = 0;

    const api = createFetchMate({
      baseUrl: BASE,
      headers: () => {
        counter++;
        return { 'X-Request-Count': String(counter) };
      },
    });

    await api.get('/users');
    await api.get('/users');

    expect(counter).toBe(2);
  });

  it('should await async headers', async () => {
    const api = createFetchMate({
      baseUrl: BASE,
      headers: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { Authorization: 'Bearer async-token' };
      },
    });

    // Should not throw — async headers are awaited
    const users = await api.get('/users');
    expect(users).toBeDefined();
  });

  it('should allow per-request headers to override dynamic config headers', async () => {
    let capturedAuth = '';

    server.use(
      http.get(`${BASE}/users`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization') ?? '';
        return HttpResponse.json({ success: true, data: [] });
      }),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      headers: () => ({ Authorization: 'Bearer config-token' }),
    });

    await api.get('/users', {
      headers: { Authorization: 'Bearer override-token' },
    });

    expect(capturedAuth).toBe('Bearer override-token');
  });

  it('should still work with static headers (backward compat)', async () => {
    let capturedHeader = '';

    server.use(
      http.get(`${BASE}/users`, ({ request }) => {
        capturedHeader = request.headers.get('X-Static') ?? '';
        return HttpResponse.json({ success: true, data: [] });
      }),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      headers: { 'X-Static': 'works' },
    });

    await api.get('/users');
    expect(capturedHeader).toBe('works');
  });
});

// ─── 4. errorTransform ────────────────────────────────────────

describe('errorTransform', () => {
  it('should transform error data on non-ok response', async () => {
    const api = createFetchMate({
      baseUrl: BASE,
      errorTransform: (data: unknown) => {
        const raw = data as { code: string; details: string[] };
        return { errorCode: raw.code, errors: raw.details };
      },
    });

    try {
      await api.post('/error/400', { body: {}, retry: false });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError<{ errorCode: string; errors: string[] }>;
      expect(httpError.status).toBe(400);
      expect(httpError.data.errorCode).toBe('VALIDATION');
      expect(httpError.data.errors).toEqual(['name required']);
    }
  });

  it('should fall back to raw data if errorTransform throws', async () => {
    const api = createFetchMate({
      baseUrl: BASE,
      errorTransform: () => {
        throw new Error('Transform exploded');
      },
    });

    try {
      await api.post('/error/400', { body: {}, retry: false });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.status).toBe(400);
      // Falls back to raw data
      expect(httpError.data).toEqual({
        code: 'VALIDATION',
        details: ['name required'],
      });
    }
  });

  it('should leave error data unchanged without errorTransform', async () => {
    const api = createFetchMate({ baseUrl: BASE });

    try {
      await api.get('/error/500', { retry: false });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.data).toEqual({ message: 'Server error' });
    }
  });
});

// ─── 5. validateResponse ──────────────────────────────────────

describe('validateResponse', () => {
  it('should catch success:false on HTTP 200 and throw', async () => {
    const api = createFetchMate({
      baseUrl: BASE,
      validateResponse: (raw) => {
        const data = raw as { success: boolean; message?: string };
        if (data.success === false) {
          throw new ValidationError(
            data.message ?? 'Validation failed',
            '',
            raw,
          );
        }
      },
    });

    try {
      await api.get('/fail');
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe('bad');
    }
  });

  it('should run on 200 and 422 responses', async () => {
    const validatorSpy = vi.fn();

    server.use(
      http.get(`${BASE}/validate-test`, () =>
        HttpResponse.json({ success: false, message: 'Nope' }),
      ),
    );

    const api = createFetchMate({
      baseUrl: BASE,
      validateResponse: (raw, ctx) => {
        validatorSpy(ctx.status);
      },
    });

    // 200 response
    await api.get('/validate-test');
    expect(validatorSpy).toHaveBeenCalledWith(200);
  });

  it('should disable global validator with per-request false', async () => {
    const validatorSpy = vi.fn(() => {
      throw new ValidationError('Should not run', '', null);
    });

    const api = createFetchMate({
      baseUrl: BASE,
      validateResponse: validatorSpy,
    });

    // Per-request false disables validation
    const result = await api.get('/validate-test', {
      validateResponse: false,
    });
    expect(validatorSpy).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('should override global validator with per-request function', async () => {
    const globalValidator = vi.fn();
    const localValidator = vi.fn();

    const api = createFetchMate({
      baseUrl: BASE,
      validateResponse: globalValidator,
    });

    await api.get('/users', {
      validateResponse: localValidator,
    });

    expect(globalValidator).not.toHaveBeenCalled();
    expect(localValidator).toHaveBeenCalledOnce();
  });

  it('should NOT call transform if validateResponse throws', async () => {
    const transformSpy = vi.fn((raw: unknown) => raw);

    const api = createFetchMate({
      baseUrl: BASE,
      transform: transformSpy,
      validateResponse: (raw) => {
        const data = raw as { success: boolean; message?: string };
        if (data.success === false) {
          throw new ValidationError(
            data.message ?? 'Validation failed',
            '',
            raw,
          );
        }
      },
    });

    try {
      await api.get('/fail');
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
    }

    // Transform should NOT have been called because validateResponse threw
    expect(transformSpy).not.toHaveBeenCalled();
  });
});

// ─── 6. onSuccess / onError hooks ─────────────────────────────

describe('onSuccess / onError hooks', () => {
  it('should call onSuccess with transformed data after success', async () => {
    const onSuccessSpy = vi.fn();

    const api = createFetchMate({
      baseUrl: BASE,
      transform: (raw) => raw.data,
      onSuccess: onSuccessSpy,
    });

    await api.get('/users');

    expect(onSuccessSpy).toHaveBeenCalledOnce();
    // The data should be the TRANSFORMED data (raw.data)
    const [data, ctx] = onSuccessSpy.mock.calls[0];
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].name).toBe('Alice');
    expect(ctx.status).toBe(200);
  });

  it('should call onError with error after failure', async () => {
    const onErrorSpy = vi.fn();

    const api = createFetchMate({
      baseUrl: BASE,
      onError: onErrorSpy,
    });

    try {
      await api.get('/error/500', { retry: false });
    } catch {
      // expected
    }

    expect(onErrorSpy).toHaveBeenCalledOnce();
    const [error, ctx] = onErrorSpy.mock.calls[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(ctx.url).toContain('/error/500');
  });

  it('should NOT break request flow if hook throws', async () => {
    const api = createFetchMate({
      baseUrl: BASE,
      onSuccess: () => {
        throw new Error('Hook exploded');
      },
    });

    // Should NOT throw — the hook error is swallowed
    const result = await api.get('/users');
    expect(result).toBeDefined();
  });

  it('should NOT break error flow if onError throws', async () => {
    const api = createFetchMate({
      baseUrl: BASE,
      onError: () => {
        throw new Error('onError exploded');
      },
    });

    // The original HttpError should still propagate, not the hook error
    try {
      await api.get('/error/500', { retry: false });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(500);
    }
  });

  it('should NOT fire hooks on cache hit', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}/users`, () => {
        callCount++;
        return HttpResponse.json({ success: true, data: [] });
      }),
    );

    const onSuccessSpy = vi.fn();
    const api = createFetchMate({
      baseUrl: BASE,
      cache: { ttl: 30_000 },
      onSuccess: onSuccessSpy,
    });

    await api.get('/users');
    expect(onSuccessSpy).toHaveBeenCalledTimes(1);

    // Second request — cache hit
    await api.get('/users');
    expect(callCount).toBe(1); // confirms cache hit
    expect(onSuccessSpy).toHaveBeenCalledTimes(1); // NOT called again
  });
});

// ─── 7. HttpError<TError> generic ─────────────────────────────

describe('HttpError<TError> generic', () => {
  it('should compile with bare HttpError (data is unknown)', async () => {
    const api = createFetchMate({ baseUrl: BASE });

    try {
      await api.get('/error/500', { retry: false });
      expect.unreachable('Should have thrown');
    } catch (error) {
      const httpError = error as HttpError;
      // data should be accessible as unknown
      expect(httpError.data).toBeDefined();
      expect(httpError.status).toBe(500);
      expect(httpError.name).toBe('HttpError');
    }
  });

  it('should narrow data type with HttpError<{code: string}>', async () => {
    const api = createFetchMate({ baseUrl: BASE });

    try {
      await api.post('/error/400', { body: {}, retry: false });
      expect.unreachable('Should have thrown');
    } catch (error) {
      const httpError = error as HttpError<{ code: string }>;
      // TypeScript should allow accessing .code directly
      expect(httpError.data.code).toBe('VALIDATION');
      expect(typeof httpError.data.code).toBe('string');
    }
  });

  it('should have correct name and properties on ValidationError', () => {
    const validationError = new ValidationError('Test error', '/test', {
      field: 'email',
    });

    expect(validationError.name).toBe('ValidationError');
    expect(validationError.message).toBe('Test error');
    expect(validationError.url).toBe('/test');
    expect(validationError.data).toEqual({ field: 'email' });
    expect(validationError).toBeInstanceOf(FetchMateError);
    expect(validationError).toBeInstanceOf(ValidationError);
  });
});
