/**
 * Bitbucket Data Center error handling.
 */

import type { BitbucketAPIError, BitbucketAPIResponse } from './types.js';

export const BITBUCKET_ERROR_CODES = {
  RATE_LIMITED:
    'Bitbucket API rate limit exceeded. Please wait before retrying.',
  UNAUTHORIZED: 'Bitbucket authentication failed. Check your BITBUCKET_TOKEN.',
  FORBIDDEN:
    'Access denied. You may not have permission for this Bitbucket resource.',
  NOT_FOUND:
    'Resource not found. Check the project key, repository slug, path, or reference.',
  BAD_REQUEST: 'Invalid Bitbucket request parameters.',
  SERVER_ERROR: 'Bitbucket server error. Please try again later.',
  NETWORK_ERROR: 'Network error connecting to Bitbucket.',
} as const;

interface HttpLikeError {
  message?: string;
  status?: number;
  headers?: Headers;
  body?: string;
}

export function handleBitbucketAPIError(error: unknown): BitbucketAPIError {
  if (isHttpLikeError(error)) {
    return handleHttpLikeError(error);
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      error: BITBUCKET_ERROR_CODES.NETWORK_ERROR,
      status: 0,
      type: 'network',
      hints: ['Check your network connection and BITBUCKET_HOST setting.'],
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      status: 500,
      type: 'unknown',
    };
  }

  return {
    error: 'An unknown Bitbucket error occurred',
    status: 500,
    type: 'unknown',
  };
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return !!error && typeof error === 'object' && 'status' in error;
}

function handleHttpLikeError(error: HttpLikeError): BitbucketAPIError {
  const status = error.status || 500;
  const retryAfter = error.headers?.get('retry-after');
  const rateLimitRemaining = error.headers?.get('x-ratelimit-remaining');
  const rateLimitReset = error.headers?.get('x-ratelimit-reset');

  if (status === 429) {
    return {
      error: BITBUCKET_ERROR_CODES.RATE_LIMITED,
      status,
      type: 'http',
      retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
      rateLimitRemaining: rateLimitRemaining
        ? parseInt(rateLimitRemaining, 10)
        : undefined,
      rateLimitReset: rateLimitReset ? parseInt(rateLimitReset, 10) : undefined,
      hints: [
        retryAfter
          ? `Retry after ${retryAfter} seconds.`
          : 'Retry after the rate limit window resets.',
      ],
    };
  }

  if (status === 401) {
    return {
      error: BITBUCKET_ERROR_CODES.UNAUTHORIZED,
      status,
      type: 'http',
      hints: [
        'Ensure BITBUCKET_TOKEN or BB_TOKEN is valid.',
        'Bitbucket Data Center personal access tokens usually need repository read access.',
      ],
    };
  }

  if (status === 403) {
    return {
      error: BITBUCKET_ERROR_CODES.FORBIDDEN,
      status,
      type: 'http',
      hints: [
        'Verify your token has permission to access this project or repository.',
      ],
    };
  }

  if (status === 404) {
    return {
      error: BITBUCKET_ERROR_CODES.NOT_FOUND,
      status,
      type: 'http',
      hints: [
        'Confirm the project key and repository slug use the Bitbucket Data Center format PROJECT/repo-slug.',
      ],
    };
  }

  if (status === 400) {
    return {
      error: error.body
        ? `${BITBUCKET_ERROR_CODES.BAD_REQUEST} ${error.body}`
        : BITBUCKET_ERROR_CODES.BAD_REQUEST,
      status,
      type: 'http',
    };
  }

  if (status >= 500) {
    return {
      error: BITBUCKET_ERROR_CODES.SERVER_ERROR,
      status,
      type: 'http',
    };
  }

  return {
    error: error.message || error.body || 'Bitbucket request failed',
    status,
    type: 'http',
  };
}

export function createBitbucketError(
  message: string,
  status: number = 500,
  hints?: string[]
): BitbucketAPIResponse<never> {
  return {
    error: message,
    status,
    type: 'http',
    hints,
  };
}
