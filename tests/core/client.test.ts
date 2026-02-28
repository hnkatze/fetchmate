import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createFetchMate } from '../../src/core/client.js';
import { HttpError, TimeoutError } from '../../src/core/errors.js';

const BASE = 'https://api.test.com';

const server = setupServer(
  http.get(`${BASE}/users`, () =>
    HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]),
  ),

  http.get(`${BASE}/users/:id`, ({ params }) =>
    HttpResponse.json({ id: Number(params.id), name: 'Alice' }),
  ),

  http.post(`${BASE}/users`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 3, ...body }, { status: 201 });
  }),

  http.put(`${BASE}/users/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: Number(params.id), ...body });
  }),

  http.patch(`${BASE}/users/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: Number(params.id), ...body });
  }),

  http.delete(`${BASE}/users/:id`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${BASE}/error/404`, () =>
    HttpResponse.json({ message: 'Not found' }, { status: 404 }),
  ),

  http.get(`${BASE}/error/500`, () =>
    HttpResponse.json({ message: 'Server error' }, { status: 500 }),
  ),

  http.get(`${BASE}/search`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      q: url.searchParams.get('q'),
      page: url.searchParams.get('page'),
    });
  }),

  http.get(`${BASE}/slow`, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return HttpResponse.json({ ok: true });
  }),

  http.get(`${BASE}/text`, () =>
    new HttpResponse('Hello, world!', {
      headers: { 'Content-Type': 'text/plain' },
    }),
  ),

  http.get(`${BASE}/wrapped/users`, () =>
    HttpResponse.json({
      success: true,
      message: 'Users fetched',
      data: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    }),
  ),

  http.post(`${BASE}/wrapped/users`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      success: true,
      message: 'User created',
      data: { id: 3, ...body },
    });
  }),

  http.get(`${BASE}/unwrapped/health`, () =>
    HttpResponse.json({ ok: true }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('FetchMateClient', () => {
  const api = createFetchMate({ baseUrl: BASE });

  describe('GET', () => {
    it('should fetch a typed array', async () => {
      const users = await api.get<{ id: number; name: string }[]>('/users');
      expect(users).toHaveLength(2);
      expect(users[0].name).toBe('Alice');
    });

    it('should fetch with path params', async () => {
      const user = await api.get<{ id: number; name: string }>('/users/:id', {
        params: { id: 1 },
      });
      expect(user.id).toBe(1);
    });

    it('should fetch with query params', async () => {
      const result = await api.get<{ q: string; page: string }>('/search', {
        query: { q: 'test', page: 1 },
      });
      expect(result.q).toBe('test');
      expect(result.page).toBe('1');
    });

    it('should return text for non-JSON responses', async () => {
      const text = await api.get<string>('/text');
      expect(text).toBe('Hello, world!');
    });
  });

  describe('POST', () => {
    it('should send body and return typed response', async () => {
      const user = await api.post<{ id: number; name: string }>('/users', {
        body: { name: 'Charlie' },
      });
      expect(user.id).toBe(3);
      expect(user.name).toBe('Charlie');
    });
  });

  describe('PUT', () => {
    it('should update a resource', async () => {
      const user = await api.put<{ id: number; name: string }>('/users/:id', {
        params: { id: 1 },
        body: { name: 'Updated' },
      });
      expect(user.id).toBe(1);
      expect(user.name).toBe('Updated');
    });
  });

  describe('PATCH', () => {
    it('should partially update a resource', async () => {
      const user = await api.patch<{ id: number; name: string }>('/users/:id', {
        params: { id: 1 },
        body: { name: 'Patched' },
      });
      expect(user.name).toBe('Patched');
    });
  });

  describe('DELETE', () => {
    it('should delete a resource', async () => {
      const result = await api.delete<void>('/users/:id', {
        params: { id: 1 },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('raw mode', () => {
    it('should return full response wrapper', async () => {
      const response = await api.get<{ id: number; name: string }[]>('/users', {
        raw: true,
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(2);
      expect(response.url).toContain('/users');
      expect(response.headers).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw HttpError on 404', async () => {
      try {
        await api.get('/error/404');
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        const httpError = error as HttpError;
        expect(httpError.status).toBe(404);
        expect(httpError.data).toEqual({ message: 'Not found' });
      }
    });

    it('should throw HttpError on 500', async () => {
      try {
        await api.get('/error/500', { retry: false });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).status).toBe(500);
      }
    });
  });

  describe('timeout', () => {
    it('should throw TimeoutError on slow requests', async () => {
      try {
        await api.get('/slow', { timeout: 100, retry: false });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as TimeoutError).timeout).toBe(100);
      }
    });
  });

  describe('interceptors', () => {
    it('should apply request interceptors', async () => {
      const client = createFetchMate({ baseUrl: BASE });
      client.interceptors.request.use((ctx) => {
        ctx.headers.set('X-Custom', 'test-value');
        return ctx;
      });

      // The request succeeds (interceptor ran without error)
      const users = await client.get<unknown[]>('/users');
      expect(users).toHaveLength(2);
    });

    it('should apply response interceptors', async () => {
      const client = createFetchMate({ baseUrl: BASE });
      client.interceptors.response.use((ctx) => ({
        ...ctx,
        data: { intercepted: true },
      }));

      const result = await client.get<{ intercepted: boolean }>('/users');
      expect(result.intercepted).toBe(true);
    });

    it('should support unsubscribe', async () => {
      const client = createFetchMate({ baseUrl: BASE });
      const unsub = client.interceptors.response.use((ctx) => ({
        ...ctx,
        data: { intercepted: true },
      }));

      unsub();

      const users = await client.get<unknown[]>('/users');
      expect(Array.isArray(users)).toBe(true);
    });
  });

  describe('extend', () => {
    it('should create a child client with merged config', async () => {
      const child = api.extend({
        headers: { 'X-Admin': 'true' },
      });

      const users = await child.get<unknown[]>('/users');
      expect(users).toHaveLength(2);
    });
  });

  describe('cache', () => {
    it('should cache GET requests', async () => {
      let callCount = 0;
      server.use(
        http.get(`${BASE}/cached`, () => {
          callCount++;
          return HttpResponse.json({ count: callCount });
        }),
      );

      const cached = createFetchMate({
        baseUrl: BASE,
        cache: { ttl: 5000 },
      });

      const first = await cached.get<{ count: number }>('/cached');
      const second = await cached.get<{ count: number }>('/cached');

      expect(first.count).toBe(1);
      expect(second.count).toBe(1); // Served from cache
    });

    it('should bypass cache when cache: false per request', async () => {
      let callCount = 0;
      server.use(
        http.get(`${BASE}/no-cache`, () => {
          callCount++;
          return HttpResponse.json({ count: callCount });
        }),
      );

      const client = createFetchMate({
        baseUrl: BASE,
        cache: { ttl: 5000 },
      });

      await client.get('/no-cache');
      const second = await client.get<{ count: number }>('/no-cache', {
        cache: false,
      });

      expect(second.count).toBe(2);
    });
  });

  describe('transform', () => {
    it('should unwrap encapsulated responses with global transform', async () => {
      const client = createFetchMate({
        baseUrl: BASE,
        transform: (raw) => raw.data,
      });

      const users = await client.get<{ id: number; name: string }[]>('/wrapped/users');
      expect(users).toHaveLength(2);
      expect(users[0].name).toBe('Alice');
    });

    it('should unwrap POST responses with global transform', async () => {
      const client = createFetchMate({
        baseUrl: BASE,
        transform: (raw) => raw.data,
      });

      const user = await client.post<{ id: number; name: string }>('/wrapped/users', {
        body: { name: 'Charlie' },
      });
      expect(user.id).toBe(3);
      expect(user.name).toBe('Charlie');
    });

    it('should apply transform in raw mode to .data', async () => {
      const client = createFetchMate({
        baseUrl: BASE,
        transform: (raw) => raw.data,
      });

      const response = await client.get<{ id: number; name: string }[]>('/wrapped/users', {
        raw: true,
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(2);
      expect(response.data[0].name).toBe('Alice');
    });

    it('should skip global transform with per-request transform: false', async () => {
      const client = createFetchMate({
        baseUrl: BASE,
        transform: (raw) => raw.data,
      });

      const full = await client.get<{ success: boolean; message: string; data: unknown[] }>('/wrapped/users', {
        transform: false,
      });
      expect(full.success).toBe(true);
      expect(full.message).toBe('Users fetched');
      expect(full.data).toHaveLength(2);
    });

    it('should override global transform with per-request transform', async () => {
      const client = createFetchMate({
        baseUrl: BASE,
        transform: (raw) => raw.data,
      });

      const message = await client.get<string>('/wrapped/users', {
        transform: (raw) => raw.message,
      });
      expect(message).toBe('Users fetched');
    });

    it('should work without transform on non-wrapped endpoints', async () => {
      const client = createFetchMate({
        baseUrl: BASE,
      });

      const health = await client.get<{ ok: boolean }>('/unwrapped/health');
      expect(health.ok).toBe(true);
    });

    it('should inherit transform via extend()', async () => {
      const client = createFetchMate({
        baseUrl: BASE,
        transform: (raw) => raw.data,
      });

      const admin = client.extend({ headers: { 'X-Admin': 'true' } });
      const users = await admin.get<{ id: number; name: string }[]>('/wrapped/users');
      expect(users).toHaveLength(2);
    });

    it('should override transform via extend()', async () => {
      const client = createFetchMate({
        baseUrl: BASE,
        transform: (raw) => raw.data,
      });

      const noTransform = client.extend({ transform: (raw) => raw });
      const full = await noTransform.get<{ success: boolean; data: unknown[] }>('/wrapped/users');
      expect(full.success).toBe(true);
      expect(full.data).toHaveLength(2);
    });
  });
});
