// fetch() wrapper for entity detail SSR. Backend 5xx throws (landing in the
// caller's apiUnreachable catch) so a sick backend is treated as transient,
// not as "this entity doesn't exist" — only a definitive 404 may 308 the
// URL back to its hub.
export async function fetchEntityRes(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status >= 500) {
    throw new Error(`entity API ${res.status} for ${url}`);
  }
  return res;
}
