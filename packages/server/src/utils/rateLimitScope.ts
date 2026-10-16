/**
 * Emix: which requests the global per-address rate limit skips. The web
 * bundle (everything outside /api and /ws, fetched with GET or HEAD) is
 * immutable and content-hashed; a cold load is about a hundred files, so
 * counting it let two people loading the app from one address exhaust the
 * budget. API routes, uploads (/api/uploads), the WebSocket and every
 * per-route limit are still counted.
 */
export function isStaticAssetRequest(method: string, url: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const path = url.split('?')[0] ?? '';
  return !(path === '/ws' || path.startsWith('/ws/') || path === '/api' || path.startsWith('/api/'));
}
