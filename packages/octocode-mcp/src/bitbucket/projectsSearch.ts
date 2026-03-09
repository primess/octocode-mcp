/**
 * Bitbucket Data Center repository search.
 */

import type {
  BitbucketAPIResponse,
  BitbucketPagedResponse,
  BitbucketRepoRef,
} from './types.js';
import { bitbucketGetJson, type BitbucketClientConfig } from './client.js';
import { generateCacheKey, withDataCache } from '../utils/http/cache.js';

export interface BitbucketProjectsSearchQuery {
  projectKey?: string;
  search?: string;
  perPage?: number;
  page?: number;
}

export interface BitbucketProjectsSearchResult {
  repositories: BitbucketRepoRef[];
  pagination: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    totalMatches: number;
  };
}

export async function searchBitbucketProjectsAPI(
  params: BitbucketProjectsSearchQuery,
  clientConfig?: BitbucketClientConfig,
  sessionId?: string
): Promise<BitbucketAPIResponse<BitbucketProjectsSearchResult>> {
  const perPage = Math.min(params.perPage || 20, 100);
  const page = Math.max(params.page || 1, 1);
  const start = (page - 1) * perPage;

  const cacheKey = generateCacheKey(
    'bb-api-repos',
    {
      ...params,
      perPage,
      page,
      host: clientConfig?.host,
    },
    sessionId
  );

  return withDataCache(
    cacheKey,
    async () => {
      const path = params.projectKey
        ? `/rest/api/latest/projects/${encodeURIComponent(params.projectKey)}/repos`
        : '/rest/api/latest/repos';

      const result = await bitbucketGetJson<
        BitbucketPagedResponse<BitbucketRepoRef>
      >(path, clientConfig, {
        name: params.search,
        limit: perPage,
        start,
      });

      if ('error' in result) {
        return result;
      }

      const data = result.data;
      const values = Array.isArray(data.values) ? data.values : [];
      const filtered = params.search
        ? values.filter(repo => {
            const haystack = [
              repo.name,
              repo.slug,
              repo.description,
              repo.project?.name,
              repo.project?.key,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(params.search!.toLowerCase());
          })
        : values;

      const size = typeof data.size === 'number' ? data.size : filtered.length;
      const hasMore = !data.isLastPage && data.nextPageStart !== undefined;
      const totalMatches = hasMore ? start + size + 1 : start + filtered.length;

      return {
        data: {
          repositories: filtered,
          pagination: {
            currentPage: page,
            totalPages: hasMore ? page + 1 : Math.max(page, 1),
            hasMore,
            totalMatches,
          },
        },
        status: result.status,
      };
    },
    {
      shouldCache: value => 'data' in value,
    }
  );
}
