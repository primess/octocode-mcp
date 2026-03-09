/**
 * Bitbucket provider search delegates.
 */

import type {
  ProviderResponse,
  CodeSearchQuery,
  CodeSearchResult,
  CodeSearchItem,
  RepoSearchQuery,
  RepoSearchResult,
  UnifiedRepository,
} from '../types.js';
import {
  searchBitbucketCodeAPI,
  type BitbucketCodeSearchQuery,
} from '../../bitbucket/codeSearch.js';
import { searchBitbucketProjectsAPI } from '../../bitbucket/projectsSearch.js';
import type { BitbucketClientConfig } from '../../bitbucket/client.js';
import type {
  BitbucketCodeSearchItem,
  BitbucketRepoRef,
} from '../../bitbucket/types.js';

export function parseBitbucketProjectId(projectId?: string): {
  projectKey: string;
  repositorySlug: string;
} {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const parts = projectId.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid Bitbucket projectId format: '${projectId}'. Expected 'PROJECT/repository-slug'.`
    );
  }

  return {
    projectKey: parts[0],
    repositorySlug: parts[1],
  };
}

function getRepositoryUrl(repository?: BitbucketRepoRef): string {
  return repository?.links?.self?.[0]?.href || '';
}

export function transformCodeSearchResult(
  items: BitbucketCodeSearchItem[],
  query: CodeSearchQuery
): CodeSearchResult {
  const transformedItems: CodeSearchItem[] = items.map(item => ({
    path: item.file?.path?.toString || item.path?.toString || '',
    matches: (item.contentMatches || []).map(match => ({
      context: match.lineContent || match.text || '',
      positions:
        typeof match.line === 'number'
          ? ([[match.line, match.line]] as [number, number][])
          : [],
    })),
    url: getRepositoryUrl(item.repository),
    repository: {
      id: String(item.repository?.id || ''),
      name:
        item.repository?.project?.key && item.repository?.slug
          ? `${item.repository.project.key}/${item.repository.slug}`
          : item.repository?.name || item.repository?.slug || '',
      url: getRepositoryUrl(item.repository),
    },
  }));

  const repositoryContext = query.projectId
    ? (() => {
        const parsed = parseBitbucketProjectId(query.projectId);
        return {
          owner: parsed.projectKey,
          repo: parsed.repositorySlug,
        };
      })()
    : undefined;

  return {
    items: transformedItems,
    totalCount: transformedItems.length,
    pagination: {
      currentPage: query.page || 1,
      totalPages: 1,
      hasMore: transformedItems.length === (query.limit || 20),
    },
    repositoryContext,
  };
}

function cloneUrl(repository: BitbucketRepoRef): string {
  return (
    repository.links?.clone?.find(link => link.name === 'http')?.href ||
    repository.links?.clone?.[0]?.href ||
    getRepositoryUrl(repository)
  );
}

export function transformRepoSearchResult(
  repositories: BitbucketRepoRef[],
  pagination: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    totalMatches: number;
  }
): RepoSearchResult {
  const transformed: UnifiedRepository[] = repositories.map(repo => ({
    id: String(repo.id || ''),
    name: repo.name || repo.slug || '',
    fullPath:
      repo.project?.key && repo.slug
        ? `${repo.project.key}/${repo.slug}`
        : repo.name || repo.slug || '',
    description: repo.description ?? null,
    url: getRepositoryUrl(repo),
    cloneUrl: cloneUrl(repo),
    defaultBranch: 'main',
    stars: 0,
    forks: 0,
    visibility: repo.public ? 'public' : 'private',
    topics: [],
    createdAt: '',
    updatedAt: '',
    lastActivityAt: '',
    archived: repo.archived,
  }));

  return {
    repositories: transformed,
    totalCount: pagination.totalMatches,
    pagination,
  };
}

export async function searchCode(
  query: CodeSearchQuery,
  clientConfig?: BitbucketClientConfig
): Promise<ProviderResponse<CodeSearchResult>> {
  const parsed = query.projectId
    ? parseBitbucketProjectId(query.projectId)
    : undefined;

  const result = await searchBitbucketCodeAPI(
    {
      search: query.keywords.join(' '),
      projectKey: parsed?.projectKey,
      repositorySlug: parsed?.repositorySlug,
      path: query.path,
      perPage: query.limit,
      page: query.page,
    } satisfies BitbucketCodeSearchQuery,
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
    data: {
      ...transformCodeSearchResult(result.data.items, query),
      pagination: {
        currentPage: result.data.pagination.currentPage,
        totalPages: result.data.pagination.totalPages,
        hasMore: result.data.pagination.hasMore,
      },
      totalCount: result.data.totalCount,
    },
    status: result.status,
    provider: 'bitbucket',
  };
}

export async function searchRepos(
  query: RepoSearchQuery,
  clientConfig?: BitbucketClientConfig
): Promise<ProviderResponse<RepoSearchResult>> {
  const result = await searchBitbucketProjectsAPI(
    {
      projectKey: query.owner,
      search: query.keywords?.join(' '),
      perPage: query.limit,
      page: query.page,
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
    data: transformRepoSearchResult(
      result.data.repositories,
      result.data.pagination
    ),
    status: result.status,
    provider: 'bitbucket',
  };
}
