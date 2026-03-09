/**
 * Bitbucket API Client
 *
 * HTTP client for Bitbucket Data Center/Server REST API.
 * Uses native fetch with Bearer token authentication.
 *
 * @module bitbucket/client
 */

import type { BitbucketAPIError, BitbucketAPISuccess } from './types.js';
import { handleBitbucketAPIError } from './errors.js';

// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

/**
 * Bitbucket client configuration.
 */
export interface BitbucketClientConfig {
  /** Bitbucket host URL (e.g., 'https://bitbucket.mycompany.com') */
  host: string;
  /** Personal access token for authentication */
  token: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Default client configuration.
 */
const DEFAULT_CONFIG: Partial<BitbucketClientConfig> = {
  timeout: 30000, // 30 seconds
};

// ============================================================================
// HTTP CLIENT
// ============================================================================

/**
 * Make an authenticated HTTP request to the Bitbucket API.
 *
 * @param config - Client configuration
 * @param endpoint - API endpoint path (e.g., '/rest/api/1.0/projects')
 * @param options - Fetch options
 * @returns API response
 */
export async function bitbucketRequest<T>(
  config: BitbucketClientConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<BitbucketAPISuccess<T> | BitbucketAPIError> {
  const { host, token, timeout = DEFAULT_CONFIG.timeout } = config;

  // Normalize host URL (remove trailing slash)
  const baseUrl = host.replace(/\/+$/, '');

  // Construct full URL
  const url = `${baseUrl}${endpoint}`;

  // Set up headers with Bearer token authentication
  const headers: HeadersInit = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = timeout
    ? setTimeout(() => controller.abort(), timeout)
    : null;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    // Clear timeout
    if (timeoutId) clearTimeout(timeoutId);

    // Extract headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Handle non-2xx responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        response: {
          status: response.status,
          statusText: response.statusText,
          data: errorData,
          headers: responseHeaders,
        },
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Parse JSON response
    const data = await response.json();

    return {
      data: data as T,
      status: response.status,
      headers: responseHeaders,
    };
  } catch (error) {
    // Clear timeout on error
    if (timeoutId) clearTimeout(timeoutId);

    // Handle abort errors (timeout)
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('aborted'))
    ) {
      return {
        error: `Request timeout after ${timeout}ms`,
        status: 0,
        type: 'network',
        hints: ['The request took too long to complete. Try again later.'],
      };
    }

    // Handle other errors
    return handleBitbucketAPIError(error);
  }
}

/**
 * Make a GET request to the Bitbucket API.
 */
export async function bitbucketGet<T>(
  config: BitbucketClientConfig,
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<BitbucketAPISuccess<T> | BitbucketAPIError> {
  // Build query string
  let url = endpoint;
  if (params) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });
    const queryString = queryParams.toString();
    if (queryString) {
      url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`;
    }
  }

  return bitbucketRequest<T>(config, url, { method: 'GET' });
}

/**
 * Make a POST request to the Bitbucket API.
 */
export async function bitbucketPost<T>(
  config: BitbucketClientConfig,
  endpoint: string,
  body?: unknown
): Promise<BitbucketAPISuccess<T> | BitbucketAPIError> {
  return bitbucketRequest<T>(config, endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make a PUT request to the Bitbucket API.
 */
export async function bitbucketPut<T>(
  config: BitbucketClientConfig,
  endpoint: string,
  body?: unknown
): Promise<BitbucketAPISuccess<T> | BitbucketAPIError> {
  return bitbucketRequest<T>(config, endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make a DELETE request to the Bitbucket API.
 */
export async function bitbucketDelete<T>(
  config: BitbucketClientConfig,
  endpoint: string
): Promise<BitbucketAPISuccess<T> | BitbucketAPIError> {
  return bitbucketRequest<T>(config, endpoint, { method: 'DELETE' });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an API response is successful.
 */
export function isBitbucketSuccess<T>(
  response: BitbucketAPISuccess<T> | BitbucketAPIError
): response is BitbucketAPISuccess<T> {
  return 'data' in response && !('error' in response);
}

/**
 * Check if an API response is an error.
 */
export function isBitbucketError<T>(
  response: BitbucketAPISuccess<T> | BitbucketAPIError
): response is BitbucketAPIError {
  return 'error' in response;
}
