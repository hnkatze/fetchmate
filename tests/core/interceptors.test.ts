import { describe, it, expect, vi } from 'vitest';
import { InterceptorChain } from '../../src/core/interceptors.js';
import type { RequestContext, ResponseContext } from '../../src/core/types.js';

function makeRequestCtx(overrides?: Partial<RequestContext>): RequestContext {
  return {
    url: 'https://api.com/test',
    method: 'GET',
    headers: new Headers(),
    ...overrides,
  };
}

function makeResponseCtx(overrides?: Partial<ResponseContext>): ResponseContext {
  return {
    url: 'https://api.com/test',
    method: 'GET',
    status: 200,
    headers: new Headers(),
    data: { ok: true },
    ...overrides,
  };
}

describe('InterceptorChain', () => {
  describe('request interceptors', () => {
    it('should apply request interceptors in order', async () => {
      const chain = new InterceptorChain();

      chain.request.use((ctx) => {
        ctx.headers.set('X-First', '1');
        return ctx;
      });
      chain.request.use((ctx) => {
        ctx.headers.set('X-Second', '2');
        return ctx;
      });

      const result = await chain.applyRequest(makeRequestCtx());
      expect(result.headers.get('X-First')).toBe('1');
      expect(result.headers.get('X-Second')).toBe('2');
    });

    it('should support async interceptors', async () => {
      const chain = new InterceptorChain();

      chain.request.use(async (ctx) => {
        ctx.headers.set('X-Async', 'yes');
        return ctx;
      });

      const result = await chain.applyRequest(makeRequestCtx());
      expect(result.headers.get('X-Async')).toBe('yes');
    });

    it('should support unsubscribe', async () => {
      const chain = new InterceptorChain();
      const handler = vi.fn((ctx: RequestContext) => {
        ctx.headers.set('X-Removed', 'yes');
        return ctx;
      });

      const unsubscribe = chain.request.use(handler);
      unsubscribe();

      const result = await chain.applyRequest(makeRequestCtx());
      expect(result.headers.has('X-Removed')).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('response interceptors', () => {
    it('should apply response interceptors', async () => {
      const chain = new InterceptorChain();

      chain.response.use((ctx) => ({
        ...ctx,
        data: { ...(ctx.data as object), extra: true },
      }));

      const result = await chain.applyResponse(makeResponseCtx());
      expect(result.data).toEqual({ ok: true, extra: true });
    });

    it('should apply error interceptors', async () => {
      const chain = new InterceptorChain();
      const spy = vi.fn((error: Error) => error);

      chain.response.use(undefined, spy);

      const error = new Error('test');
      await chain.applyError(error);
      expect(spy).toHaveBeenCalledWith(error);
    });

    it('should support unsubscribe for response', async () => {
      const chain = new InterceptorChain();
      const handler = vi.fn((ctx: ResponseContext) => ctx);

      const unsub = chain.response.use(handler);
      unsub();

      await chain.applyResponse(makeResponseCtx());
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('clone', () => {
    it('should clone interceptors to a new chain', async () => {
      const chain = new InterceptorChain();
      chain.request.use((ctx) => {
        ctx.headers.set('X-Cloned', 'yes');
        return ctx;
      });

      const cloned = chain.clone();
      const result = await cloned.applyRequest(makeRequestCtx());
      expect(result.headers.get('X-Cloned')).toBe('yes');
    });

    it('should not share state after clone', async () => {
      const chain = new InterceptorChain();
      const cloned = chain.clone();

      cloned.request.use((ctx) => {
        ctx.headers.set('X-New', 'yes');
        return ctx;
      });

      const original = await chain.applyRequest(makeRequestCtx());
      expect(original.headers.has('X-New')).toBe(false);
    });
  });
});
