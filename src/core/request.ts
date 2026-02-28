/**
 * Replace path parameters in a URL pattern.
 * e.g. buildPath('/users/:id/posts/:postId', { id: '1', postId: '42' })
 *      → '/users/1/posts/42'
 */
export function buildPath(
  pattern: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return pattern;

  return pattern.replace(/:(\w+)/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter: :${key}`);
    }
    return encodeURIComponent(String(value));
  });
}

/**
 * Serialize query parameters into a URL search string.
 * Supports arrays: { tags: ['a', 'b'] } → 'tags=a&tags=b'
 */
export function buildQuery(
  query?: Record<string, string | number | boolean | (string | number)[]>,
): string {
  if (!query) return '';

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
    } else if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }

  const str = params.toString();
  return str ? `?${str}` : '';
}

/**
 * Join a base URL with a path, avoiding double slashes.
 */
export function joinUrl(base: string, path: string): string {
  if (!base) return path;

  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Build the full URL from base, path pattern, params, and query.
 */
export function buildUrl(
  base: string,
  pattern: string,
  params?: Record<string, string | number>,
  query?: Record<string, string | number | boolean | (string | number)[]>,
): string {
  const path = buildPath(pattern, params);
  const url = joinUrl(base, path);
  const qs = buildQuery(query);
  return `${url}${qs}`;
}
