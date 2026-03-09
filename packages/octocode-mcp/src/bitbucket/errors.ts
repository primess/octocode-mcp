/**
 * Bitbucket Error Handling
 *
 * Handles Bitbucket API errors and transforms them to standardized format.
 * Note: Bitbucket Data Center uses HTTP 429 for rate limiting.
 *
 * @module bitbucket/errors
 */

import type { BitbucketAPIError } from './types.js';

// ============================================================================
// ERROR CONSTANTS
// ============================================================================

export const BITBUCKET_ERROR_CODES = {
  RATE_LIMITED: {
    code: 'BB_RATE_LIMITED',
    message: 'Bitbucket API rate limit exceeded. Please wait before retrying.',
  },
  UNAUTHORIZED: {
    code: 'BB_UNAUTHORIZED',
    message: 'Bitbucket authentication failed. Check your BITBUCKET_TOKEN.',
  },
  FORBIDDEN: {
    code: 'BB_FORBIDDEN',
    message: 'Access denied. You may not have permission for this resource.',
  },
  NOT_FOUND: {
    code: 'BB_NOT_FOUND',
    message:
      'Resource not found. Check the project key, repository slug, or reference.',
  },
  BAD_REQUEST: {
    code: 'BB_BAD_REQUEST',
    message: 'Invalid request parameters.',
  },
  SERVER_ERROR: {
    code: 'BB_SERVER_ERROR',
    message: 'Bitbucket server error. Please try again later.',
  },
  NETWORK_ERROR: {
    code: 'BB_NETWORK_ERROR',
    message: 'Network error connecting to Bitbucket.',
  },
} as const;

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Handle Bitbucket API errors and convert to standardized format.
 *
 * @param error - The error to handle
 * @returns BitbucketAPIError response
 */
export function handleBitbucketAPIError(error: unknown): BitbucketAPIError {
  // Handle HTTP response errors
  if (isHttpResponseError(error)) {
    return handleHttpResponseError(error);
  }

  // Handle fetch/network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      error: BITBUCKET_ERROR_CODES.NETWORK_ERROR.message,
      status: 0,
      type: 'network',
      hints: ['Check your network connection and Bitbucket host configuration.'],
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      error: error.message,
      status: 500,
      type: 'unknown',
    };
  }

  // Unknown error type
  return {
    error: 'An unknown error occurred',
    status: 500,
    type: 'unknown',
  };
}

/**
 * HTTP Response error structure.
 */
interface HttpResponseError extends Error {
  response?: {
    status: number;
    statusText?: string;
    data?: unknown;
    headers?: Record<string, string>;
  };
  status?: number;
}

/**
 * Check if error is an HTTP response error.
 */
function isHttpResponseError(error: unknown): error is HttpResponseError {
  return (
    error !== null &&
    typeof error === 'object' &&
    ('response' in error || 'status' in error)
  );
}

/**
 * Handle HTTP response errors from Bitbucket API.
 */
function handleHttpResponseError(error: HttpResponseError): BitbucketAPIError {
  const status = error.response?.status ?? error.status ?? 500;
  const headers = error.response?.headers ?? {};

  // Extract rate limit information
  const rateLimitRemaining = headers['x-ratelimit-remaining']
    ? parseInt(headers['x-ratelimit-remaining'], 10)
    : undefined;
  const rateLimitReset = headers['x-ratelimit-reset']
    ? parseInt(headers['x-ratelimit-reset'], 10) * 1000
    : undefined;
  const retryAfter = headers['retry-after']
    ? parseInt(headers['retry-after'], 10)
    : undefined;

  // Handle specific status codes
  switch (status) {
    case 401:
      return {
        error: BITBUCKET_ERROR_CODES.UNAUTHORIZED.message,
        status,
        type: 'http',
        hints: [
          'Ensure BITBUCKET_TOKEN or BB_TOKEN environment variable is set.',
          'Verify the token has not expired.',
          'Check that the token has necessary permissions.',
        ],
      };

    case 403:
      return {
        error: BITBUCKET_ERROR_CODES.FORBIDDEN.message,
        status,
        type: 'http',
        hints: [
          'Verify that your token has permission to access this resource.',
          'Check repository or project visibility settings.',
        ],
        rateLimitRemaining,
        rateLimitReset,
      };

    case 404:
      return {
        error: BITBUCKET_ERROR_CODES.NOT_FOUND.message,
        status,
        type: 'http',
        hints: [
          'Verify the project key and repository slug are correct.',
          'Check that the resource exists and is accessible.',
          'Ensure the branch or reference name is correct.',
        ],
      };

    case 400:
      return {
        error: BITBUCKET_ERROR_CODES.BAD_REQUEST.message,
        status,
        type: 'http',
        hints: [
          'Check that all required parameters are provided.',
          'Verify parameter formats match API expectations.',
        ],
      };

    case 429:
      return {
        error: BITBUCKET_ERROR_CODES.RATE_LIMITED.message,
        status,
        type: 'http',
        hints: [
          `Rate limit will reset at: ${
            rateLimitReset ? new Date(rateLimitReset).toISOString() : 'unknown'
          }`,
          retryAfter
            ? `Retry after ${retryAfter} seconds`
            : 'Wait before making more requests',
        ],
        rateLimitRemaining: 0,
        rateLimitReset,
        retryAfter,
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        error: BITBUCKET_ERROR_CODES.SERVER_ERROR.message,
        status,
        type: 'http',
        hints: [
          'This is likely a temporary issue with the Bitbucket server.',
          'Try again in a few moments.',
        ],
      };

    default:
      return {
        error: error.message || `HTTP ${status} error`,
        status,
        type: 'http',
        rateLimitRemaining,
        rateLimitReset,
      };
  }
}

/**
 * Log rate limit information for debugging.
 *
 * @param remaining - Remaining API calls
 * @param reset - Reset timestamp (ms since epoch)
 */
export function logRateLimit(remaining: number, reset: number): void {
  const resetDate = new Date(reset);
  console.warn(
    `[Bitbucket Rate Limit] ${remaining} requests remaining. Resets at ${resetDate.toISOString()}`
  );
}
