import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTimeoutSignal } from '../../src/core/timeout.js';

describe('createTimeoutSignal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a signal that aborts after timeout', () => {
    const { signal } = createTimeoutSignal(1000);

    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
  });

  it('should clear timeout to prevent abort', () => {
    const { signal, clear } = createTimeoutSignal(1000);

    clear();
    vi.advanceTimersByTime(2000);
    expect(signal.aborted).toBe(false);
  });

  it('should propagate user abort', () => {
    const controller = new AbortController();
    const { signal } = createTimeoutSignal(10_000, controller.signal);

    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it('should handle already-aborted user signal', () => {
    const controller = new AbortController();
    controller.abort();

    const { signal } = createTimeoutSignal(10_000, controller.signal);
    expect(signal.aborted).toBe(true);
  });

  it('should work without timeout', () => {
    const { signal, clear } = createTimeoutSignal();
    expect(signal.aborted).toBe(false);
    clear();
  });
});
