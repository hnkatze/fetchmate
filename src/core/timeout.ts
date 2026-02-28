interface TimeoutResult {
  signal: AbortSignal;
  clear(): void;
}

/**
 * Creates a combined AbortSignal from an optional user signal and a timeout.
 * Returns a clear() function to prevent the timeout from firing after completion.
 */
export function createTimeoutSignal(
  timeout?: number,
  userSignal?: AbortSignal,
): TimeoutResult {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // If user already aborted, propagate immediately
  if (userSignal?.aborted) {
    controller.abort(userSignal.reason);
    return { signal: controller.signal, clear: () => {} };
  }

  // Listen for user abort
  if (userSignal) {
    const onAbort = () => controller.abort(userSignal.reason);
    userSignal.addEventListener('abort', onAbort, { once: true });
  }

  // Set timeout
  if (timeout && timeout > 0) {
    timer = setTimeout(() => {
      controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    }, timeout);
  }

  return {
    signal: controller.signal,
    clear() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
