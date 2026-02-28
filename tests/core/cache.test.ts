import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestCache } from '../../src/core/cache.js';

describe('RequestCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve values', () => {
    const cache = new RequestCache({ ttl: 5000 });
    cache.set('GET:/users', [{ id: 1 }]);

    expect(cache.get('GET:/users')).toEqual([{ id: 1 }]);
  });

  it('should return undefined for missing keys', () => {
    const cache = new RequestCache();
    expect(cache.get('GET:/nope')).toBeUndefined();
  });

  it('should expire entries after TTL', () => {
    const cache = new RequestCache({ ttl: 1000 });
    cache.set('GET:/users', 'data');

    vi.advanceTimersByTime(999);
    expect(cache.get('GET:/users')).toBe('data');

    vi.advanceTimersByTime(2);
    expect(cache.get('GET:/users')).toBeUndefined();
  });

  it('should allow custom TTL per entry', () => {
    const cache = new RequestCache({ ttl: 10_000 });
    cache.set('GET:/users', 'data', 500);

    vi.advanceTimersByTime(501);
    expect(cache.get('GET:/users')).toBeUndefined();
  });

  it('should evict oldest when at maxEntries', () => {
    const cache = new RequestCache({ ttl: 60_000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('should invalidate by string pattern', () => {
    const cache = new RequestCache({ ttl: 60_000 });
    cache.set('GET:/users', 'a');
    cache.set('GET:/users/1', 'b');
    cache.set('GET:/posts', 'c');

    cache.invalidate('/users');
    expect(cache.get('GET:/users')).toBeUndefined();
    expect(cache.get('GET:/users/1')).toBeUndefined();
    expect(cache.get('GET:/posts')).toBe('c');
  });

  it('should invalidate by regex pattern', () => {
    const cache = new RequestCache({ ttl: 60_000 });
    cache.set('GET:/users', 'a');
    cache.set('POST:/users', 'b');
    cache.set('GET:/posts', 'c');

    cache.invalidate(/^GET:/);
    expect(cache.get('GET:/users')).toBeUndefined();
    expect(cache.get('POST:/users')).toBe('b');
    expect(cache.get('GET:/posts')).toBeUndefined();
  });

  it('should clear all entries', () => {
    const cache = new RequestCache({ ttl: 60_000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('should generate cache keys', () => {
    expect(RequestCache.key('GET', 'https://api.com/users')).toBe('GET:https://api.com/users');
  });

  it('should report isCacheable', () => {
    const cache = new RequestCache({ methods: ['GET'] });
    expect(cache.isCacheable('GET')).toBe(true);
    expect(cache.isCacheable('POST')).toBe(false);
  });
});
