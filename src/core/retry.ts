import type { HttpMethod, RetryConfig } from './types.js';
import { HttpError } from './errors.js';

const DEFAULTS: Required<RetryConfig> = {
  limit: 3,
  methods: ['GET', 'PUT', 'DELETE'],
  statusCodes: [408, 429, 500, 502, 503, 504],
  delay: 300,
  maxDelay: 10_000,
};

export function resolveRetryConfig(
  config?: Partial<RetryConfig>,
): Required<RetryConfig> {
  return { ...DEFAULTS, ...config };
}

/** Calculate delay with exponential backoff + jitter */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
): number {
  const exponential = baseDelay * 2 ** attempt;
  const capped = Math.min(exponential, maxDelay);
  // Add jitter: random value between 0 and capped delay
  return Math.random() * capped;
}

function shouldRetry(
  error: unknown,
  config: Required<RetryConfig>,
  method: HttpMethod,
): boolean {
  if (!config.methods.includes(method)) return false;
  if (error instanceof HttpError) {
    return config.statusCodes.includes(error.status);
  }
  // Retry on network errors but not on aborts/timeouts
  return error instanceof TypeError;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  method: HttpMethod,
  config: Required<RetryConfig>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.limit; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= config.limit || !shouldRetry(error, config, method)) {
        throw error;
      }

      const delay = calculateDelay(attempt, config.delay, config.maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
