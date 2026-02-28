import { describe, it, expect } from 'vitest';
import {
  FetchMateError,
  HttpError,
  TimeoutError,
  AbortError,
  NetworkError,
  ParseError,
} from '../../src/core/errors.js';

describe('FetchMateError', () => {
  it('should set name and message', () => {
    const error = new FetchMateError('test error');
    expect(error.name).toBe('FetchMateError');
    expect(error.message).toBe('test error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should accept a cause', () => {
    const cause = new Error('root');
    const error = new FetchMateError('test', cause);
    expect(error.cause).toBe(cause);
  });
});

describe('HttpError', () => {
  it('should store status, url, and data', () => {
    const headers = new Headers();
    const error = new HttpError(404, 'Not Found', '/users/1', { message: 'gone' }, headers);

    expect(error.name).toBe('HttpError');
    expect(error.status).toBe(404);
    expect(error.statusText).toBe('Not Found');
    expect(error.url).toBe('/users/1');
    expect(error.data).toEqual({ message: 'gone' });
    expect(error.headers).toBe(headers);
    expect(error).toBeInstanceOf(FetchMateError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('TimeoutError', () => {
  it('should store url and timeout', () => {
    const error = new TimeoutError('/api/slow', 5000);
    expect(error.name).toBe('TimeoutError');
    expect(error.url).toBe('/api/slow');
    expect(error.timeout).toBe(5000);
    expect(error.message).toContain('5000ms');
  });
});

describe('AbortError', () => {
  it('should store url', () => {
    const error = new AbortError('/api/cancelled');
    expect(error.name).toBe('AbortError');
    expect(error.url).toBe('/api/cancelled');
  });
});

describe('NetworkError', () => {
  it('should store url and cause', () => {
    const cause = new TypeError('Failed to fetch');
    const error = new NetworkError('/api/down', cause);
    expect(error.name).toBe('NetworkError');
    expect(error.url).toBe('/api/down');
    expect(error.cause).toBe(cause);
  });
});

describe('ParseError', () => {
  it('should store url and cause', () => {
    const cause = new SyntaxError('Unexpected token');
    const error = new ParseError('/api/bad-json', cause);
    expect(error.name).toBe('ParseError');
    expect(error.url).toBe('/api/bad-json');
    expect(error.cause).toBe(cause);
  });
});
