import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  bitbucketGetJson,
  bitbucketGetText,
} from '../../src/bitbucket/client.js';

function createHeaders(values: Record<string, string> = {}): Headers {
  return {
    get(name: string) {
      return values[name.toLowerCase()] || values[name] || null;
    },
  } as unknown as Headers;
}

describe('Bitbucket client', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.BITBUCKET_TOKEN = 'bb-token';
    process.env.BITBUCKET_HOST = 'https://bitbucket.company.local';
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('uses bearer auth and host when fetching JSON', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ values: [] }),
      headers: createHeaders(),
    } as unknown as Response);

    await bitbucketGetJson('/rest/api/latest/repos', undefined, { limit: 10 });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://bitbucket.company.local/rest/api/latest/repos?limit=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer bb-token',
          Accept: 'application/json',
        }),
      })
    );
  });

  it('returns text content metadata for raw file fetches', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('hello world'),
      headers: createHeaders({
        'content-length': '11',
        'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
      }),
    } as unknown as Response);

    const result = await bitbucketGetText('/rest/api/latest/test.txt');

    expect('data' in result).toBe(true);
    if (!('data' in result)) {
      throw new Error('Expected text response');
    }
    expect(result.data.text).toBe('hello world');
    expect(result.data.contentLength).toBe(11);
    expect(result.data.lastModified).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
  });

  it('returns a config error when host is missing', async () => {
    delete process.env.BITBUCKET_HOST;

    const result = await bitbucketGetJson('/rest/api/latest/repos');

    expect('error' in result && result.error).toContain(
      'Bitbucket host not found'
    );
  });
});
