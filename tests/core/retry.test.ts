import { describe, it, expect, vi } from 'vitest';
import { withRetry, resolveRetryConfig } from '../../src/core/retry.js';
import { HttpError } from '../../src/core/errors.js';

describe('resolveRetryConfig', () => {
  it('should use defaults for empty config', () => {
    const config = resolveRetryConfig({});
    expect(config.limit).toBe(3);
    expect(config.methods).toContain('GET');
    expect(config.statusCodes).toContain(500);
    expect(config.delay).toBe(300);
    expect(config.maxDelay).toBe(10_000);
  });

  it('should override specific fields', () => {
    const config = resolveRetryConfig({ limit: 5, delay: 100 });
    expect(config.limit).toBe(5);
    expect(config.delay).toBe(100);
    expect(config.methods).toContain('GET');
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const config = resolveRetryConfig({ limit: 3 });

    const result = await withRetry(fn, 'GET', config);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable HTTP error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpError(500, 'Internal', '/api', null, new Headers()))
      .mockRejectedValueOnce(new HttpError(503, 'Unavailable', '/api', null, new Headers()))
      .mockResolvedValue('ok');

    const config = resolveRetryConfig({ limit: 3, delay: 0 });
    const result = await withRetry(fn, 'GET', config);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable methods', async () => {
    const error = new HttpError(500, 'Internal', '/api', null, new Headers());
    const fn = vi.fn().mockRejectedValue(error);
    const config = resolveRetryConfig({ limit: 3, delay: 0, methods: ['GET'] });

    await expect(withRetry(fn, 'POST', config)).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not retry non-retryable status codes', async () => {
    const error = new HttpError(400, 'Bad Request', '/api', null, new Headers());
    const fn = vi.fn().mockRejectedValue(error);
    const config = resolveRetryConfig({ limit: 3, delay: 0 });

    await expect(withRetry(fn, 'GET', config)).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after exhausting retries', async () => {
    const error = new HttpError(500, 'Internal', '/api', null, new Headers());
    const fn = vi.fn().mockRejectedValue(error);
    const config = resolveRetryConfig({ limit: 2, delay: 0 });

    await expect(withRetry(fn, 'GET', config)).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
