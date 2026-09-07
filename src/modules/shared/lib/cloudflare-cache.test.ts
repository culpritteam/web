import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeCloudflareCache } from './cloudflare-cache';
import { logger } from './logger';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  process.env.CLOUDFLARE_ZONE_ID = 'test-zone';
  process.env.NEXT_PUBLIC_APP_URL = 'https://culprit.example.com';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('purgeCloudflareCache', () => {
  it('is a no-op when CLOUDFLARE_API_TOKEN is not configured', async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;

    await purgeCloudflareCache(['/research']);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('is a no-op when CLOUDFLARE_ZONE_ID is not configured', async () => {
    delete process.env.CLOUDFLARE_ZONE_ID;

    await purgeCloudflareCache(['/research']);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('warns when the integration is half-configured (token set, zone id missing)', async () => {
    delete process.env.CLOUDFLARE_ZONE_ID;
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await purgeCloudflareCache(['/events']);

    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('cloudflare_purge_skipped', {
      missing: ['CLOUDFLARE_ZONE_ID'],
      paths: ['/events'],
    });
    warn.mockRestore();
  });

  it('stays silent when the integration is switched off entirely', async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ZONE_ID;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await purgeCloudflareCache(['/events']);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is a no-op for an empty path list', async () => {
    await purgeCloudflareCache([]);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('purges the zone with absolute URLs resolved against NEXT_PUBLIC_APP_URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await purgeCloudflareCache(['/research', '/api/research']);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/test-zone/purge_cache');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
    expect(JSON.parse(init!.body as string)).toEqual({
      files: ['https://culprit.example.com/research', 'https://culprit.example.com/api/research'],
    });
  });

  it('never throws when Cloudflare returns a non-success body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, errors: [{ message: 'nope' }] }), {
        status: 200,
      }),
    );

    await expect(purgeCloudflareCache(['/research'])).resolves.toBeUndefined();
  });

  it('never throws when the fetch itself rejects (network error, timeout)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));

    await expect(purgeCloudflareCache(['/research'])).resolves.toBeUndefined();
  });
});
