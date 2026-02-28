import { describe, it, expect, vi } from 'vitest';
import { createResource } from '../../src/core/resource.js';
import type { FetchMateInstance } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────

function createMockClient(result: Promise<any>): FetchMateInstance {
  return {
    get: vi.fn().mockReturnValue(result),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    extend: vi.fn(),
    resource: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  } as unknown as FetchMateInstance;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── Tests ───────────────────────────────────────────────────

describe('createResource', () => {
  it('should have initial state: loading=true, data=undefined, error=undefined', () => {
    const client = createMockClient(new Promise(() => {})); // never resolves
    const resource = createResource<string>(client, '/users');

    expect(resource.loading).toBe(true);
    expect(resource.data).toBeUndefined();
    expect(resource.error).toBeUndefined();
  });

  it('should set loading=false and data after successful fetch', async () => {
    const payload = { id: 1, name: 'Alice' };
    const client = createMockClient(Promise.resolve(payload));
    const resource = createResource<typeof payload>(client, '/users/1');

    await flushPromises();

    expect(resource.loading).toBe(false);
    expect(resource.data).toEqual(payload);
    expect(resource.error).toBeUndefined();
    expect(client.get).toHaveBeenCalledWith('/users/1', undefined);
  });

  it('should set loading=false and error after failed fetch', async () => {
    const err = new Error('Network failure');
    const client = createMockClient(Promise.reject(err));
    const resource = createResource<string>(client, '/items');

    await flushPromises();

    expect(resource.loading).toBe(false);
    expect(resource.data).toBeUndefined();
    expect(resource.error).toBeInstanceOf(Error);
    expect(resource.error!.message).toBe('Network failure');
  });

  it('should wrap non-Error rejections in an Error', async () => {
    const client = createMockClient(Promise.reject('string error'));
    const resource = createResource<string>(client, '/items');

    await flushPromises();

    expect(resource.error).toBeInstanceOf(Error);
    expect(resource.error!.message).toBe('string error');
  });

  it('should re-execute and update state on refetch()', async () => {
    const firstPayload = { version: 1 };
    const secondPayload = { version: 2 };

    let callCount = 0;
    const client = createMockClient(Promise.resolve(firstPayload));
    (client.get as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? firstPayload : secondPayload);
    });

    const resource = createResource<typeof firstPayload>(client, '/data');

    await flushPromises();
    expect(resource.data).toEqual(firstPayload);

    // refetch
    const refetchPromise = resource.refetch();
    expect(resource.loading).toBe(true);

    await refetchPromise;

    expect(resource.loading).toBe(false);
    expect(resource.data).toEqual(secondPayload);
    expect(resource.error).toBeUndefined();
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('should notify subscribers on state changes', async () => {
    const client = createMockClient(Promise.resolve('hello'));
    const resource = createResource<string>(client, '/greet');

    const states: Array<{ loading: boolean; data?: string; error?: Error }> = [];
    resource.subscribe((s) => {
      states.push({ ...s });
    });

    await flushPromises();

    // The subscriber should have received at least the final settled state.
    // It may also receive the initial loading=true notification from execute().
    const lastState = states[states.length - 1];
    expect(lastState.loading).toBe(false);
    expect(lastState.data).toBe('hello');
    expect(lastState.error).toBeUndefined();
    expect(states.length).toBeGreaterThanOrEqual(1);
  });

  it('should stop notifying after unsubscribe', async () => {
    let resolveGet!: (value: string) => void;
    const pending = new Promise<string>((r) => {
      resolveGet = r;
    });
    const client = createMockClient(pending);
    const resource = createResource<string>(client, '/data');

    const cb = vi.fn();
    const unsubscribe = resource.subscribe(cb);

    // Unsubscribe before the fetch resolves
    unsubscribe();

    resolveGet('done');
    await flushPromises();

    // The callback should NOT have been called after unsubscribe
    expect(cb).not.toHaveBeenCalled();
  });

  it('should set data optimistically via mutate() without fetching', async () => {
    const client = createMockClient(Promise.resolve('server-data'));
    const resource = createResource<string>(client, '/data');

    await flushPromises();
    expect(resource.data).toBe('server-data');

    const callsBefore = (client.get as ReturnType<typeof vi.fn>).mock.calls.length;

    resource.mutate('optimistic-data');

    expect(resource.loading).toBe(false);
    expect(resource.data).toBe('optimistic-data');
    expect(resource.error).toBeUndefined();

    // No additional GET call should have been made
    expect((client.get as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('should notify subscribers when mutate() is called', async () => {
    const client = createMockClient(Promise.resolve('initial'));
    const resource = createResource<string>(client, '/data');

    await flushPromises();

    const cb = vi.fn();
    resource.subscribe(cb);

    resource.mutate('updated');

    expect(cb).toHaveBeenCalledWith({
      loading: false,
      data: 'updated',
      error: undefined,
    });
  });

  it('should only apply the latest result on concurrent refetch() calls (stale guard)', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;

    const firstCall = new Promise<string>((r) => {
      resolveFirst = r;
    });
    const secondCall = new Promise<string>((r) => {
      resolveSecond = r;
    });

    let callCount = 0;
    const client = createMockClient(firstCall);
    (client.get as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? firstCall : secondCall;
    });

    const resource = createResource<string>(client, '/data');

    // Wait for first call to be in-flight (execute() was called on creation)
    // Now trigger a second refetch before the first resolves
    const refetchPromise = resource.refetch();

    // Resolve the FIRST call AFTER the second was initiated
    // This simulates a stale response arriving late
    resolveFirst('stale-data');
    await flushPromises();

    // The first result should be discarded (stale guard: id !== fetchId)
    expect(resource.data).toBeUndefined();

    // Now resolve the second (latest) call
    resolveSecond('fresh-data');
    await refetchPromise;

    expect(resource.loading).toBe(false);
    expect(resource.data).toBe('fresh-data');
    expect(resource.error).toBeUndefined();
  });

  it('should not break other subscribers when one throws', async () => {
    const client = createMockClient(Promise.resolve('data'));
    const resource = createResource<string>(client, '/data');

    const results: string[] = [];

    resource.subscribe(() => {
      throw new Error('subscriber explosion');
    });

    resource.subscribe((s) => {
      if (s.data) results.push(s.data);
    });

    await flushPromises();

    // The second subscriber should still receive the notification
    expect(results).toContain('data');
  });

  it('should pass options through to client.get()', async () => {
    const options = { query: { page: 1 }, timeout: 5000 };
    const client = createMockClient(Promise.resolve([]));
    createResource<string[]>(client, '/items', options);

    await flushPromises();

    expect(client.get).toHaveBeenCalledWith('/items', options);
  });
});
