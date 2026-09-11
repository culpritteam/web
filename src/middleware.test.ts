import { describe, expect, it } from 'vitest';
import { getClientIp, rateLimitExceededResponse, resolveRateLimitRule } from './middleware';

// Pure-logic coverage only — the `middleware` export itself is a thin NextRequest/NextResponse
// wrapper around these functions plus the shared rate limiter, not worth fighting the Next.js
// Edge Middleware test harness for.

describe('resolveRateLimitRule', () => {
  it('applies the auth sign-in rule to POST /api/auth/sign-in/email', () => {
    const rule = resolveRateLimitRule('/api/auth/sign-in/email', 'POST', '1.2.3.4');

    expect(rule).toEqual({ key: 'auth-signin:1.2.3.4', limit: 5, windowSeconds: 60 });
  });

  it('does not rate-limit other auth routes (e.g. sign-out, session)', () => {
    expect(resolveRateLimitRule('/api/auth/sign-out', 'POST', '1.2.3.4')).toBeNull();
    expect(resolveRateLimitRule('/api/auth/get-session', 'GET', '1.2.3.4')).toBeNull();
  });

  it('does not rate-limit a GET to the sign-in path', () => {
    expect(resolveRateLimitRule('/api/auth/sign-in/email', 'GET', '1.2.3.4')).toBeNull();
  });

  it('applies the admin rule to mutating methods under /api/admin/**', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const rule = resolveRateLimitRule('/api/admin/research', method, '5.6.7.8');
      expect(rule).toEqual({
        key: `admin:5.6.7.8:/api/admin/research`,
        limit: 30,
        windowSeconds: 60,
      });
    }
  });

  it('does not rate-limit GET requests under /api/admin/**', () => {
    expect(resolveRateLimitRule('/api/admin/research', 'GET', '5.6.7.8')).toBeNull();
  });

  it('keys the admin rule by pathname so different admin routes track independently', () => {
    const research = resolveRateLimitRule('/api/admin/research', 'POST', '5.6.7.8');
    const publications = resolveRateLimitRule('/api/admin/publications', 'POST', '5.6.7.8');

    expect(research?.key).not.toBe(publications?.key);
  });

  it('ignores unrelated public routes', () => {
    expect(resolveRateLimitRule('/api/research', 'GET', '1.2.3.4')).toBeNull();
    expect(resolveRateLimitRule('/api/turnstile/verify', 'POST', '1.2.3.4')).toBeNull();
  });
});

describe('getClientIp', () => {
  it('reads the first entry of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1' });
    expect(getClientIp(headers)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '8.8.8.8' });
    expect(getClientIp(headers)).toBe('8.8.8.8');
  });

  it('falls back to "unknown" when neither header is present', () => {
    expect(getClientIp(new Headers())).toBe('unknown');
  });
});

describe('rateLimitExceededResponse', () => {
  it('returns a 429 with the standard error envelope and Retry-After header', async () => {
    const response = rateLimitExceededResponse(42);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: 'rate_limited', message: 'Too many requests. Please try again later.' },
    });
  });
});
