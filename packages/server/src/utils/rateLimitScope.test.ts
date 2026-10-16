import { describe, expect, it } from 'vitest';
import { isStaticAssetRequest } from './rateLimitScope.js';

describe('isStaticAssetRequest', () => {
  it('exempts the web bundle', () => {
    for (const url of ['/', '/assets/index-abc.js', '/icons/emix-tile.png', '/sw.js', '/channels/@me', '/fonts/a.woff2?v=1']) {
      expect(isStaticAssetRequest('GET', url)).toBe(true);
    }
    expect(isStaticAssetRequest('HEAD', '/assets/x.css')).toBe(true);
  });

  it('keeps counting the API, uploads and the WebSocket', () => {
    for (const url of ['/api/auth/login', '/api', '/api/uploads/avatar.png', '/api/health?x=1', '/ws', '/ws/']) {
      expect(isStaticAssetRequest('GET', url)).toBe(false);
    }
  });

  it('keeps counting every non-GET request', () => {
    expect(isStaticAssetRequest('POST', '/assets/x.js')).toBe(false);
    expect(isStaticAssetRequest('PUT', '/')).toBe(false);
  });
});
