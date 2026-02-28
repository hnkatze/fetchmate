import type {
  RequestContext,
  RequestInterceptor,
  ResponseContext,
  ResponseInterceptor,
  ErrorInterceptor,
  Interceptors,
} from './types.js';

interface ResponseHandler {
  onFulfilled?: ResponseInterceptor;
  onRejected?: ErrorInterceptor;
}

export class InterceptorChain implements Interceptors {
  private readonly requestHandlers: RequestInterceptor[] = [];
  private readonly responseHandlers: ResponseHandler[] = [];

  readonly request = {
    use: (handler: RequestInterceptor): (() => void) => {
      this.requestHandlers.push(handler);
      return () => {
        const idx = this.requestHandlers.indexOf(handler);
        if (idx !== -1) this.requestHandlers.splice(idx, 1);
      };
    },
  };

  readonly response = {
    use: (
      onFulfilled?: ResponseInterceptor,
      onRejected?: ErrorInterceptor,
    ): (() => void) => {
      const handler: ResponseHandler = { onFulfilled, onRejected };
      this.responseHandlers.push(handler);
      return () => {
        const idx = this.responseHandlers.indexOf(handler);
        if (idx !== -1) this.responseHandlers.splice(idx, 1);
      };
    },
  };

  async applyRequest(ctx: RequestContext): Promise<RequestContext> {
    let result = ctx;
    for (const handler of this.requestHandlers) {
      result = await handler(result);
    }
    return result;
  }

  async applyResponse(ctx: ResponseContext): Promise<ResponseContext> {
    let result = ctx;
    for (const { onFulfilled } of this.responseHandlers) {
      if (onFulfilled) {
        result = await onFulfilled(result);
      }
    }
    return result;
  }

  async applyError(error: Error): Promise<Error> {
    let result = error;
    for (const { onRejected } of this.responseHandlers) {
      if (onRejected) {
        result = await onRejected(result);
      }
    }
    return result;
  }

  /** Clone interceptors for child instances */
  clone(): InterceptorChain {
    const chain = new InterceptorChain();
    for (const handler of this.requestHandlers) {
      chain.request.use(handler);
    }
    for (const { onFulfilled, onRejected } of this.responseHandlers) {
      chain.response.use(onFulfilled, onRejected);
    }
    return chain;
  }
}
