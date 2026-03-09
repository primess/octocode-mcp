/**
 * Bitbucket Data Center code search.
 */

import type {
  BitbucketAPIResponse,
  BitbucketCodeSearchItem,
  BitbucketPagedResponse,
} from './types.js';
import { createBitbucketError } from './errors.js';
import {
  bitbucketGetJson,
  type BitbucketClientConfig,
} from './client.js';
import { generateCacheKey, withDataCache } from '../utils/http/cache.js';

export interface BitbucketCodeSearchQuery {
  search: string;
  projectKey?: string;
  repositorySlug?: string;
  path?: string;
  perPage?: number;
  page?: number;
}

export interface BitbucketCodeSearchResult {
  items: BitbucketCodeSearchItem[];
  totalCount: number;
  pagination: {
    currentPage: number;
    totalPages: number;
    perPage: number;
    hasMore: boolean;
  };
}

export async function searchBitbucketCodeAPI(
  params: BitbucketCodeSearchQuery,
  clientConfig?: BitbucketClientConfig,
  sessionId?: string
): Promise<BitbucketAPIResponse<BitbucketCodeSearchResult>> {
  if (!params.search?.trim()) {
    return createBitbucketError('Search query is required', 400);
  }

  const perPage = Math.min(params.perPage || 20, 100);
  const page = Math.max(params.page || 1, 1);
  const start = (page - 1) * perPage;

  const cacheKey = generateCacheKey(
    'bb-api-code',
    {
      ...params,
      perPage,
      page,
      host: clientConfig?.host,
    },
    sessionId
  );

  return withDataCache(cacheKey, async () => {
    const result = await bitbucketGetJson<BitbucketPagedResponse<BitbucketCodeSearchItem>>(
      '/rest/search/latest/code',
      clientConfig,
      {
        query: params.search,
        projects: params.projectKey,
        repos: params.repositorySlug,
        path: params.path,
        limit: perPage,
        start,
      }
    );

    if ('error' in result) {
      return result;
    }

    const data = result.data;
    const size = typeof data.size === 'number' ? data.size : data.values.length;
    const hasMore = !data.isLastPage && data.nextPageStart !== undefined;
    const totalCount = hasMore ? start + size + 1 : start + size;

    return {
      data: {
        items: data.values,
        totalCount,
        pagination: {
          currentPage: page,
          totalPages: hasMore ? page + 1 : Math.max(page, 1),
          perPage,
          hasMore,
        },
      },
      status: result.status,
    };
  }, {
    shouldCache: value => 'data' in value,
  });
}
