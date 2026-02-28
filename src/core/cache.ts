import type { HttpMethod } from './types.js';

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
}

export interface RequestCacheConfig {
  ttl: number;
  maxEntries: number;
  methods: HttpMethod[];
  autoInvalidate: boolean;
}

const DEFAULTS: RequestCacheConfig = {
  ttl: 60_000,
  maxEntries: 100,
  methods: ['GET'],
  autoInvalidate: true,
};

export class RequestCache {
  private readonly store = new Map<string, CacheEntry>();
  readonly config: RequestCacheConfig;

  constructor(config?: Partial<RequestCacheConfig>) {
    const provided: Record<string, unknown> = {};
    if (config) {
      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) provided[key] = value;
      }
    }
    this.config = { ...DEFAULTS, ...provided } as RequestCacheConfig;
  }

  static key(method: string, url: string): string {
    return `${method}:${url}`;
  }

  isCacheable(method: HttpMethod): boolean {
    return this.config.methods.includes(method);
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  set(key: string, data: unknown, ttl?: number): void {
    if (this.store.size >= this.config.maxEntries) {
      const oldest = this.store.keys().next().value!;
      this.store.delete(oldest);
    }

    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttl ?? this.config.ttl),
    });
  }

  invalidate(pattern: string | RegExp): void {
    for (const key of this.store.keys()) {
      const matches =
        typeof pattern === 'string'
          ? key.includes(pattern)
          : pattern.test(key);
      if (matches) this.store.delete(key);
    }
  }

  /** Invalidate cached GET entries matching a mutation path (segment-aware) */
  invalidateByPath(mutationPath: string): void {
    const mutationSegments = this.extractPath(mutationPath)
      .split('/')
      .filter(Boolean);

    for (const key of [...this.store.keys()]) {
      if (!key.startsWith('GET:')) continue;

      const cachedUrl = key.slice(4);
      const cachedSegments = this.extractPath(cachedUrl)
        .split('/')
        .filter(Boolean);

      const shorter =
        cachedSegments.length <= mutationSegments.length
          ? cachedSegments
          : mutationSegments;
      const longer =
        cachedSegments.length <= mutationSegments.length
          ? mutationSegments
          : cachedSegments;

      const isSegmentPrefix = shorter.every((seg, i) => seg === longer[i]);
      if (isSegmentPrefix) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private extractPath(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url.split('?')[0];
    }
  }
}
