import { describe, it, expect } from 'vitest';
import { buildPath, buildQuery, joinUrl, buildUrl } from '../../src/core/request.js';

describe('buildPath', () => {
  it('should return pattern unchanged when no params', () => {
    expect(buildPath('/users')).toBe('/users');
  });

  it('should replace single param', () => {
    expect(buildPath('/users/:id', { id: '42' })).toBe('/users/42');
  });

  it('should replace multiple params', () => {
    expect(buildPath('/users/:id/posts/:postId', { id: '1', postId: '99' }))
      .toBe('/users/1/posts/99');
  });

  it('should encode param values', () => {
    expect(buildPath('/search/:query', { query: 'hello world' }))
      .toBe('/search/hello%20world');
  });

  it('should accept numeric params', () => {
    expect(buildPath('/users/:id', { id: 42 })).toBe('/users/42');
  });

  it('should throw on missing param', () => {
    expect(() => buildPath('/users/:id', {})).toThrow('Missing path parameter: :id');
  });
});

describe('buildQuery', () => {
  it('should return empty string for no params', () => {
    expect(buildQuery()).toBe('');
    expect(buildQuery({})).toBe('');
  });

  it('should serialize simple params', () => {
    expect(buildQuery({ page: 1, limit: 10 })).toBe('?page=1&limit=10');
  });

  it('should serialize boolean params', () => {
    expect(buildQuery({ active: true })).toBe('?active=true');
  });

  it('should serialize array params', () => {
    const result = buildQuery({ tags: ['a', 'b'] });
    expect(result).toBe('?tags=a&tags=b');
  });

  it('should skip undefined/null values', () => {
    expect(buildQuery({ a: 'yes', b: undefined as unknown as string }))
      .toBe('?a=yes');
  });
});

describe('joinUrl', () => {
  it('should join base and path', () => {
    expect(joinUrl('https://api.example.com', '/users')).toBe('https://api.example.com/users');
  });

  it('should handle trailing slash on base', () => {
    expect(joinUrl('https://api.example.com/', '/users')).toBe('https://api.example.com/users');
  });

  it('should handle missing leading slash on path', () => {
    expect(joinUrl('https://api.example.com', 'users')).toBe('https://api.example.com/users');
  });

  it('should return path when base is empty', () => {
    expect(joinUrl('', '/users')).toBe('/users');
  });
});

describe('buildUrl', () => {
  it('should build complete URL', () => {
    const url = buildUrl(
      'https://api.example.com',
      '/users/:id/posts',
      { id: '1' },
      { page: 1 },
    );
    expect(url).toBe('https://api.example.com/users/1/posts?page=1');
  });
});
