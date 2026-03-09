/**
 * Bitbucket provider pull request delegates.
 */

import type {
  ProviderResponse,
  PullRequestItem,
  PullRequestQuery,
  PullRequestSearchResult,
} from '../types.js';
import { searchBitbucketPullRequestsAPI } from '../../bitbucket/pullRequests.js';
import type { BitbucketClientConfig } from '../../bitbucket/client.js';
import type {
  BitbucketPullRequest,
  BitbucketPullRequestActivity,
} from '../../bitbucket/types.js';
import { parseBitbucketProjectId } from './bitbucketSearch.js';

function toIsoDate(value?: number): string | undefined {
  return typeof value === 'number' ? new Date(value).toISOString() : undefined;
}

function mapState(
  state?: string
): 'OPEN' | 'DECLINED' | 'MERGED' | 'ALL' | undefined {
  const mapping: Record<string, 'OPEN' | 'DECLINED' | 'MERGED' | 'ALL'> = {
    open: 'OPEN',
    closed: 'DECLINED',
    merged: 'MERGED',
    all: 'ALL',
  };
  return state ? mapping[state] : undefined;
}

function mapActivitiesToComments(activities?: BitbucketPullRequestActivity[]) {
  return (activities || [])
    .filter(activity => activity.action === 'COMMENTED' && activity.comment)
    .map(activity => ({
      id: String(activity.comment?.id || ''),
      author:
        activity.comment?.author?.name ||
        activity.comment?.author?.displayName ||
        '',
      body: activity.comment?.text || '',
      createdAt: toIsoDate(activity.comment?.createdDate) || '',
      updatedAt: toIsoDate(activity.comment?.updatedDate) || '',
    }));
}

export function transformPullRequestResult(
  pullRequests: Array<
    BitbucketPullRequest & { __activities?: BitbucketPullRequestActivity[] }
  >,
  pagination: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    totalMatches: number;
  }
): PullRequestSearchResult {
  const items: PullRequestItem[] = pullRequests.map(pr => ({
    number: pr.id,
    title: pr.title,
    body: pr.description ?? null,
    url: pr.links?.self?.[0]?.href || '',
    state:
      pr.state === 'MERGED'
        ? 'merged'
        : pr.state === 'DECLINED'
          ? 'closed'
          : 'open',
    draft: pr.draft || false,
    author: pr.author?.user?.name || pr.author?.user?.displayName || '',
    assignees: (pr.participants || [])
      .filter(participant => participant.status === 'APPROVED')
      .map(
        participant =>
          participant.user?.name || participant.user?.displayName || ''
      ),
    labels: [],
    sourceBranch: pr.fromRef?.displayId || '',
    targetBranch: pr.toRef?.displayId || '',
    sourceSha: pr.fromRef?.latestCommit,
    targetSha: pr.toRef?.latestCommit,
    createdAt: toIsoDate(pr.createdDate) || '',
    updatedAt: toIsoDate(pr.updatedDate) || '',
    closedAt: toIsoDate(pr.closedDate),
    mergedAt: pr.state === 'MERGED' ? toIsoDate(pr.updatedDate) : undefined,
    commentsCount: pr.properties?.commentCount,
    comments: mapActivitiesToComments(
      (pr as { __activities?: BitbucketPullRequestActivity[] }).__activities
    ),
  }));

  return {
    items,
    totalCount: pagination.totalMatches,
    pagination,
  };
}

export async function searchPullRequests(
  query: PullRequestQuery,
  clientConfig?: BitbucketClientConfig
): Promise<ProviderResponse<PullRequestSearchResult>> {
  if (!query.projectId) {
    return {
      error:
        'Bitbucket pull request search requires owner and repo to identify a project and repository.',
      status: 400,
      provider: 'bitbucket',
      hints: [
        'Use owner=PROJECT_KEY and repo=repository-slug when querying Bitbucket Data Center pull requests.',
      ],
    };
  }

  const parsed = parseBitbucketProjectId(query.projectId);
  const result = await searchBitbucketPullRequestsAPI(
    {
      projectKey: parsed.projectKey,
      repositorySlug: parsed.repositorySlug,
      pullRequestId: query.number,
      state: mapState(query.state),
      author: query.author,
      sourceBranch: query.headBranch,
      targetBranch: query.baseBranch,
      perPage: query.limit,
      page: query.page,
      withComments: query.withComments,
    },
    clientConfig
  );

  if ('error' in result) {
    return {
      error: result.error,
      status: result.status,
      provider: 'bitbucket',
      hints: result.hints,
    };
  }

  return {
    data: transformPullRequestResult(
      result.data.pullRequests as Array<
        BitbucketPullRequest & {
          __activities?: BitbucketPullRequestActivity[];
        }
      >,
      result.data.pagination
    ),
    status: result.status,
    provider: 'bitbucket',
  };
}
