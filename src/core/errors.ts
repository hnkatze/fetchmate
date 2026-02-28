export class FetchMateError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FetchMateError';
  }
}

export class HttpError<TError = unknown> extends FetchMateError {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly data: TError,
    public readonly headers: Headers,
  ) {
    super(`HTTP ${status} ${statusText}: ${url}`);
    this.name = 'HttpError';
  }
}

export class ValidationError extends FetchMateError {
  constructor(
    message: string,
    public readonly url: string,
    public readonly data: unknown,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class TimeoutError extends FetchMateError {
  constructor(
    public readonly url: string,
    public readonly timeout: number,
  ) {
    super(`Request timed out after ${timeout}ms: ${url}`);
    this.name = 'TimeoutError';
  }
}

export class AbortError extends FetchMateError {
  constructor(public readonly url: string) {
    super(`Request aborted: ${url}`);
    this.name = 'AbortError';
  }
}

export class NetworkError extends FetchMateError {
  constructor(
    public readonly url: string,
    cause?: unknown,
  ) {
    super(`Network error: ${url}`, cause);
    this.name = 'NetworkError';
  }
}

export class ParseError extends FetchMateError {
  constructor(
    public readonly url: string,
    cause?: unknown,
  ) {
    super(`Failed to parse response: ${url}`, cause);
    this.name = 'ParseError';
  }
}
