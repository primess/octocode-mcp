/**
 * Bitbucket Data Center pull request search.
 */

import type {
  BitbucketAPIResponse,
  BitbucketPagedResponse,
  BitbucketPullRequest,
  BitbucketPullRequestActivity,
} from './types.js';
import { createBitbucketError } from './errors.js';
import {
  bitbucketGetJson,
  type BitbucketClientConfig,
} from './client.js';
import { generateCacheKey, withDataCache } from '../utils/http/cache.js';

export interface BitbucketPullRequestQuery {
  projectKey: string;
  repositorySlug: string;
  pullRequestId?: number;
  state?: 'OPEN' | 'DECLINED' | 'MERGED' | 'ALL';
  author?: string;
  sourceBranch?: string;
  targetBranch?: string;
  perPage?: number;
  page?: number;
  withComments?: boolean;
}

export interface BitbucketPullRequestResult {
  pullRequests: BitbucketPullRequest[];
  pagination: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    totalMatches: number;
  };
}

export async function getBitbucketPullRequestActivities(
  projectKey: string,
  repositorySlug: string,
  pullRequestId: number,
  clientConfig?: BitbucketClientConfig
): Promise<BitbucketPullRequestActivity[]> {
  const result = await bitbucketGetJson<
    BitbucketPagedResponse<BitbucketPullRequestActivity>
  >(
    `/rest/api/latest/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repositorySlug)}/pull-requests/${pullRequestId}/activities`,
    clientConfig,
    { limit: 1000, start: 0 }
  );

  if ('error' in result) {
    throw new Error(result.error);
  }

  return result.data.values || [];
}

export async function searchBitbucketPullRequestsAPI(
  params: BitbucketPullRequestQuery,
  clientConfig?: BitbucketClientConfig,
  sessionId?: string
): Promise<BitbucketAPIResponse<BitbucketPullRequestResult>> {
  if (!params.projectKey || !params.repositorySlug) {
    return createBitbucketError(
      'Bitbucket pull request search requires projectKey and repositorySlug',
      400,
      ['Use owner=PROJECT_KEY and repo=repository-slug when querying Bitbucket Data Center pull requests.']
    );
  }

  const perPage = Math.min(params.perPage || 20, 100);
  const page = Math.max(params.page || 1, 1);
  const start = (page - 1) * perPage;

  const cacheKey = generateCacheKey(
    'bb-api-prs',
    {
      ...params,
      perPage,
      page,
      host: clientConfig?.host,
    },
    sessionId
  );

  return withDataCache(cacheKey, async () => {
    const path = params.pullRequestId
      ? `/rest/api/latest/projects/${encodeURIComponent(params.projectKey)}/repos/${encodeURIComponent(params.repositorySlug)}/pull-requests/${params.pullRequestId}`
      : `/rest/api/latest/projects/${encodeURIComponent(params.projectKey)}/repos/${encodeURIComponent(params.repositorySlug)}/pull-requests`;

    const result = await bitbucketGetJson<
      BitbucketPagedResponse<BitbucketPullRequest> | BitbucketPullRequest
    >(
      path,
      clientConfig,
      params.pullRequestId
        ? undefined
        : {
            state: params.state || 'ALL',
            limit: perPage,
            start,
          }
    );

    if ('error' in result) {
      return result;
    }

    const pullRequests = Array.isArray((result.data as BitbucketPagedResponse<BitbucketPullRequest>).values)
      ? (result.data as BitbucketPagedResponse<BitbucketPullRequest>).values
      : [result.data as BitbucketPullRequest];

    const filtered = pullRequests.filter(pr => {
      if (params.author && pr.author?.user?.name !== params.author) return false;
      if (params.sourceBranch && pr.fromRef?.displayId !== params.sourceBranch) return false;
      if (params.targetBranch && pr.toRef?.displayId !== params.targetBranch) return false;
      return true;
    });

    const decorated = params.withComments
      ? await Promise.all(
          filtered.map(async pr => {
            try {
              const activities = await getBitbucketPullRequestActivities(
                params.projectKey,
                params.repositorySlug,
                pr.id,
                clientConfig
              );
              return {
                ...pr,
                __activities: activities,
              };
            } catch {
              return pr;
            }
          })
        )
      : filtered;

    const paged = result.data as BitbucketPagedResponse<BitbucketPullRequest>;
    const size = Array.isArray(paged.values) ? (paged.size ?? decorated.length) : decorated.length;
    const hasMore = !params.pullRequestId && !paged.isLastPage && paged.nextPageStart !== undefined;
    const totalMatches = params.pullRequestId
      ? decorated.length
      : hasMore
        ? start + size + 1
        : start + decorated.length;

    return {
      data: {
        pullRequests: decorated,
        pagination: {
          currentPage: page,
          totalPages: params.pullRequestId ? 1 : hasMore ? page + 1 : Math.max(page, 1),
          hasMore: !!hasMore,
          totalMatches,
        },
      },
      status: result.status,
    };
  }, {
    shouldCache: value => 'data' in value,
  });
}
