import type {
  FetchMateInstance,
  RequestOptions,
  Resource,
  ResourceState,
} from './types.js';

export function createResource<T>(
  client: FetchMateInstance,
  path: string,
  options?: RequestOptions<false>,
): Resource<T> {
  let state: ResourceState<T> = {
    loading: true,
    data: undefined,
    error: undefined,
  };
  let fetchId = 0;
  const subscribers = new Set<(state: ResourceState<T>) => void>();

  function notify(): void {
    for (const cb of subscribers) {
      try {
        cb({ ...state });
      } catch {
        // Subscriber errors must never break the resource
      }
    }
  }

  function setState(patch: Partial<ResourceState<T>>): void {
    state = { ...state, ...patch };
    notify();
  }

  async function execute(): Promise<void> {
    const id = ++fetchId;
    setState({ loading: true });

    try {
      const data = await client.get<T>(path, options);
      if (id !== fetchId) return;
      setState({ data, error: undefined, loading: false });
    } catch (err) {
      if (id !== fetchId) return;
      setState({
        error: err instanceof Error ? err : new Error(String(err)),
        data: undefined,
        loading: false,
      });
    }
  }

  // Auto-fetch on creation
  execute();

  return {
    get loading() {
      return state.loading;
    },
    get data() {
      return state.data;
    },
    get error() {
      return state.error;
    },
    refetch: execute,
    mutate(data: T) {
      setState({ data, error: undefined, loading: false });
    },
    subscribe(cb: (state: ResourceState<T>) => void) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
