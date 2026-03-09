/**
 * Bitbucket Data Center HTTP client helpers.
 */

import { createBitbucketError, handleBitbucketAPIError } from './errors.js';
import type { BitbucketAPIResponse } from './types.js';

export interface BitbucketClientConfig {
  token?: string;
  host?: string;
}

function trimOrUndefined(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getBitbucketHostFromEnv(): string | undefined {
  return trimOrUndefined(process.env.BITBUCKET_HOST);
}

function getBitbucketTokenFromEnv(): string | undefined {
  return (
    trimOrUndefined(process.env.BITBUCKET_TOKEN) ||
    trimOrUndefined(process.env.BB_TOKEN)
  );
}

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, '');
}

function buildUrl(
  host: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(path.replace(/^\//, ''), `${normalizeHost(host)}/`);

  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function resolveClientConfig(
  config?: BitbucketClientConfig
):
  | { host: string; token: string }
  | { error: ReturnType<typeof createBitbucketError> } {
  const host = trimOrUndefined(config?.host) || getBitbucketHostFromEnv();
  if (!host) {
    return {
      error: createBitbucketError(
        'Bitbucket host not found. Set BITBUCKET_HOST or configure bitbucket.host in ~/.octocode/.octocoderc.',
        400
      ),
    };
  }

  const token = trimOrUndefined(config?.token) || getBitbucketTokenFromEnv();
  if (!token) {
    return {
      error: createBitbucketError(
        'Bitbucket token not found. Set BITBUCKET_TOKEN or BB_TOKEN environment variable, or provide token in configuration.',
        401
      ),
    };
  }

  return { host, token };
}

async function bitbucketFetch(
  path: string,
  config?: BitbucketClientConfig,
  params?: Record<string, string | number | boolean | undefined>,
  accept: string = 'application/json'
): Promise<Response | ReturnType<typeof createBitbucketError>> {
  const resolved = resolveClientConfig(config);
  if ('error' in resolved) {
    return resolved.error;
  }

  const url = buildUrl(resolved.host, path, params);

  const f = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
  if (!f) {
    return createBitbucketError('Global fetch is not available.', 500);
  }

  try {
    const response = await f(url, {
      method: 'GET',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${resolved.token}`,
      },
    });

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        body = '';
      }
      throw {
        status: response.status,
        headers: response.headers,
        body,
        message: body,
      };
    }

    return response;
  } catch (error) {
    return createBitbucketErrorFromUnknown(error);
  }
}

function createBitbucketErrorFromUnknown(
  error: unknown
): ReturnType<typeof createBitbucketError> {
  const handled = handleBitbucketAPIError(error);
  return {
    error: handled.error,
    status: handled.status,
    type: handled.type,
    hints: handled.hints,
  };
}

export async function bitbucketGetJson<T>(
  path: string,
  config?: BitbucketClientConfig,
  params?: Record<string, string | number | boolean | undefined>
): Promise<BitbucketAPIResponse<T>> {
  const response = await bitbucketFetch(path, config, params, 'application/json');
  if (!(response instanceof Response)) {
    return response;
  }

  try {
    const data = (await response.json()) as T;
    return { data, status: response.status };
  } catch (error) {
    return createBitbucketErrorFromUnknown(error);
  }
}

export async function bitbucketGetText(
  path: string,
  config?: BitbucketClientConfig,
  params?: Record<string, string | number | boolean | undefined>
): Promise<
  | {
      data: { text: string; contentLength?: number; lastModified?: string };
      status: number;
    }
  | ReturnType<typeof createBitbucketError>
> {
  const response = await bitbucketFetch(path, config, params, 'text/plain');
  if (!(response instanceof Response)) {
    return response;
  }

  try {
    const text = await response.text();
    const contentLength = response.headers.get('content-length');
    return {
      data: {
        text,
        contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
        lastModified: response.headers.get('last-modified') || undefined,
      },
      status: response.status,
    };
  } catch (error) {
    return createBitbucketErrorFromUnknown(error);
  }
}
