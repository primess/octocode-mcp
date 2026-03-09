import { Buffer } from 'node:buffer';
import type {
  CodeSearchQuery,
  FileContentQuery,
  PullRequestQuery,
  RepoSearchQuery,
  RepoStructureQuery,
  ProviderResponse,
  CodeSearchResult,
  FileContentResult,
  PullRequestSearchResult,
  RepoSearchResult,
  RepoStructureResult,
  DirectoryEntry,
} from '../types.js';

interface BitbucketRequestConfig {
  baseUrl: string;
  token?: string;
}

interface BitbucketPagedResponse<T> {
  values?: T[];
  start?: number;
  limit?: number;
  size?: number;
  isLastPage?: boolean;
  totalCount?: number;
  nextPageStart?: number;
}

class BitbucketError extends Error {
  status?: number;
  hints?: string[];

  constructor(message: string, status?: number, hints?: string[]) {
    super(message);
    this.status = status;
    this.hints = hints;
  }
}

function buildUrl(
  baseUrl: string,
  path: string,
  params?: URLSearchParams
): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const query = params && [...params.keys()].length > 0 ? `?${params}` : '';
  return `${normalizedBase}${normalizedPath}${query}`;
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function requestJson<T>(
  config: BitbucketRequestConfig,
  path: string,
  params?: URLSearchParams
): Promise<{ data: T; status: number }> {
  const url = buildUrl(config.baseUrl, path, params);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...buildHeaders(config.token),
    },
  });

  if (!res.ok) {
    const message = `Bitbucket request failed (${res.status})`;
    throw new BitbucketError(message, res.status);
  }

  return {
    data: (await res.json()) as T,
    status: res.status,
  };
}

async function requestText(
  config: BitbucketRequestConfig,
  path: string,
  params?: URLSearchParams
): Promise<{ text: string; status: number; size: number }> {
  const url = buildUrl(config.baseUrl, path, params);
  const res = await fetch(url, {
    headers: buildHeaders(config.token),
  });

  if (!res.ok) {
    const message = `Bitbucket request failed (${res.status})`;
    throw new BitbucketError(message, res.status);
  }

  const text = await res.text();
  const sizeHeader = res.headers.get('content-length');
  const size =
    sizeHeader && !Number.isNaN(Number(sizeHeader))
      ? Number(sizeHeader)
      : Buffer.byteLength(text, 'utf-8');

  return { text, status: res.status, size };
}

function parseProjectId(projectId?: string): {
  projectKey: string;
  repoSlug: string;
} {
  if (!projectId) {
    throw new BitbucketError('Project ID is required', 400);
  }

  const [projectKey, repoSlug] = projectId.split('/');
  if (!projectKey || !repoSlug) {
    throw new BitbucketError(
      `Invalid projectId '${projectId}'. Expected format 'PROJECT/repo'`,
      400
    );
  }

  return { projectKey, repoSlug };
}

function buildPagination(
  start: number,
  limit: number,
  isLastPage: boolean,
  pageSize: number,
  total?: number
) {
  const currentPage = Math.floor(start / limit) + 1;
  const hasMore = !isLastPage;
  const totalEntries =
    typeof total === 'number'
      ? total
      : start + pageSize + (hasMore ? limit : 0);
  const totalPages = hasMore
    ? currentPage + 1
    : Math.max(currentPage, Math.ceil(totalEntries / limit));

  return {
    currentPage,
    totalPages,
    hasMore,
    entriesPerPage: limit,
    totalEntries,
  };
}

function mapState(state?: string): 'OPEN' | 'DECLINED' | 'MERGED' | 'ALL' {
  const mapping: Record<string, 'OPEN' | 'DECLINED' | 'MERGED' | 'ALL'> = {
    open: 'OPEN',
    closed: 'DECLINED',
    merged: 'MERGED',
    all: 'ALL',
  };
  return state ? (mapping[state] ?? 'OPEN') : 'OPEN';
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function buildStructure(paths: string[]): {
  structure: Record<string, DirectoryEntry>;
  totalFolders: number;
} {
  const structure: Record<string, DirectoryEntry> = {};
  const folders = new Set<string>();

  function ensureDir(path: string) {
    if (!structure[path]) {
      structure[path] = { files: [], folders: [] };
    }
  }

  for (const rawPath of paths) {
    const parts = rawPath.split('/').filter(Boolean);
    let currentPath = '/';
    ensureDir(currentPath);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        if (!structure[currentPath].files.includes(part)) {
          structure[currentPath].files.push(part);
        }
      } else {
        const nextPath =
          currentPath === '/' ? `/${part}` : `${currentPath}/${part}`;
        if (!structure[currentPath].folders.includes(part)) {
          structure[currentPath].folders.push(part);
        }
        folders.add(nextPath);
        currentPath = nextPath;
        ensureDir(currentPath);
      }
    }
  }

  return { structure, totalFolders: folders.size };
}

function toProviderError(
  error: unknown,
  statusOverride = 500
): ProviderResponse<never> {
  if (error instanceof BitbucketError) {
    return {
      error: error.message,
      status: error.status ?? statusOverride,
      provider: 'bitbucket',
      hints: error.hints,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      status: statusOverride,
      provider: 'bitbucket',
    };
  }

  return {
    error: 'Unknown Bitbucket error',
    status: statusOverride,
    provider: 'bitbucket',
  };
}

// ============================================================================
// OPERATIONS
// ============================================================================

export async function searchCode(
  query: CodeSearchQuery,
  config: BitbucketRequestConfig
): Promise<ProviderResponse<CodeSearchResult>> {
  try {
    let projectKey: string | undefined;
    let repoSlug: string | undefined;
    if (query.projectId) {
      const parsed = parseProjectId(query.projectId);
      projectKey = parsed.projectKey;
      repoSlug = parsed.repoSlug;
    }

    const limit = query.limit ?? 10;
    const start = query.page ? (query.page - 1) * limit : 0;

    const tokens = [...query.keywords];
    if (projectKey && repoSlug) {
      tokens.unshift(`repo:${projectKey}/${repoSlug}`);
    }
    if (query.path) tokens.push(`path:${query.path}`);
    if (query.filename) tokens.push(`file:${query.filename}`);
    if (query.extension) tokens.push(`ext:${query.extension}`);

    const searchQuery = tokens.join(' ').trim();
    const params = new URLSearchParams({
      searchQuery,
      limit: String(limit),
      start: String(start),
    });

    const { data, status } = await requestJson<
      BitbucketPagedResponse<{
        file: { path: string };
        repo: { slug: string; project: { key: string } };
        contentMatches?: Array<{
          lines: Array<{ text: string; line: number }>;
        }>;
        pathMatches?: Array<{ text: string }>;
        commit?: { authorTimestamp?: number };
      }>
    >(config, '/rest/search/1.0/code', params);

    const values = data.values ?? [];
    const items = values.map(result => {
      const repoFullName = `${result.repo.project.key}/${result.repo.slug}`;
      const matches =
        result.contentMatches?.flatMap(match =>
          match.lines.map(line => ({
            context: line.text,
            positions: [[line.line, 0] as [number, number]],
          }))
        ) ?? [];

      return {
        path: result.file.path,
        matches: matches.length
          ? matches
          : [
              {
                context:
                  result.pathMatches?.[0]?.text ??
                  (query.match === 'path' ? result.file.path : ''),
                positions: [[0, 0]],
              },
            ],
        url:
          projectKey && repoSlug
            ? `${config.baseUrl.replace(
                /\/+$/,
                ''
              )}/projects/${projectKey}/repos/${repoSlug}/browse/${result.file.path}`
            : '',
        repository: {
          id: repoFullName,
          name: repoFullName,
          url:
            projectKey && repoSlug
              ? `${config.baseUrl.replace(
                  /\/+$/,
                  ''
                )}/projects/${projectKey}/repos/${repoSlug}`
              : '',
        },
        lastModifiedAt: result.commit?.authorTimestamp
          ? new Date(result.commit.authorTimestamp).toISOString()
          : undefined,
      };
    });

    const pagination = buildPagination(
      data.start ?? start,
      data.limit ?? limit,
      data.isLastPage ?? true,
      values.length,
      data.totalCount ?? data.size
    );

    const totalCount =
      typeof data.totalCount === 'number'
        ? data.totalCount
        : typeof data.size === 'number'
          ? data.size
          : values.length;

    const repositoryContext =
      projectKey && repoSlug
        ? { owner: projectKey, repo: repoSlug }
        : undefined;

    return {
      data: {
        items,
        totalCount,
        pagination,
        ...(repositoryContext ? { repositoryContext } : {}),
      },
      status,
      provider: 'bitbucket',
    };
  } catch (error) {
    return toProviderError(error);
  }
}

export async function getFileContent(
  query: FileContentQuery,
  config: BitbucketRequestConfig
): Promise<ProviderResponse<FileContentResult>> {
  try {
    const { projectKey, repoSlug } = parseProjectId(query.projectId);
    const params = new URLSearchParams();
    if (query.ref) params.set('at', query.ref);

    const encodedPath = encodePath(query.path);
    const path = `/rest/api/1.0/projects/${encodeURIComponent(
      projectKey
    )}/repos/${encodeURIComponent(repoSlug)}/raw/${encodedPath}`;

    const { text, status, size } = await requestText(config, path, params);

    return {
      data: {
        path: query.path,
        content: text,
        encoding: 'utf-8',
        size,
        ref: query.ref ?? 'HEAD',
      },
      status,
      provider: 'bitbucket',
    };
  } catch (error) {
    return toProviderError(error);
  }
}

export async function searchRepos(
  query: RepoSearchQuery,
  config: BitbucketRequestConfig
): Promise<ProviderResponse<RepoSearchResult>> {
  try {
    const limit = query.limit ?? 10;
    const start = query.page ? (query.page - 1) * limit : 0;
    const params = new URLSearchParams({
      start: String(start),
      limit: String(limit),
    });

    const path = query.owner
      ? `/rest/api/1.0/projects/${encodeURIComponent(query.owner)}/repos`
      : '/rest/api/1.0/repos';

    if (query.keywords?.length) {
      params.set('name', query.keywords.join(' '));
    }

    const { data, status } = await requestJson<
      BitbucketPagedResponse<{
        slug: string;
        name: string;
        project: { key: string; name?: string };
        links?: {
          self?: Array<{ href: string }>;
          clone?: Array<{ href: string; name: string }>;
        };
      }>
    >(config, path, params);

    const repos = (data.values ?? []).map(repo => {
      const fullPath = `${repo.project.key}/${repo.slug}`;
      const cloneUrl =
        repo.links?.clone?.find(link => link.name === 'http')?.href ||
        repo.links?.clone?.[0]?.href ||
        '';
      const webUrl =
        repo.links?.self?.[0]?.href ||
        `${config.baseUrl.replace(/\/+$/, '')}/projects/${repo.project.key}/repos/${repo.slug}`;

      return {
        id: fullPath,
        name: repo.name || repo.slug,
        fullPath,
        description: null,
        url: webUrl,
        cloneUrl,
        defaultBranch: 'main',
        stars: 0,
        forks: 0,
        visibility: 'private',
        topics: [],
        createdAt: '',
        updatedAt: '',
        lastActivityAt: '',
      };
    });

    const pagination = buildPagination(
      data.start ?? start,
      data.limit ?? limit,
      data.isLastPage ?? true,
      data.values?.length ?? 0,
      data.totalCount ?? data.size
    );

    const totalCount =
      typeof data.totalCount === 'number'
        ? data.totalCount
        : typeof data.size === 'number'
          ? data.size
          : repos.length;

    return {
      data: {
        repositories: repos,
        totalCount,
        pagination,
      },
      status,
      provider: 'bitbucket',
    };
  } catch (error) {
    return toProviderError(error);
  }
}

export async function searchPullRequests(
  query: PullRequestQuery,
  config: BitbucketRequestConfig
): Promise<ProviderResponse<PullRequestSearchResult>> {
  try {
    const { projectKey, repoSlug } = parseProjectId(query.projectId);
    const limit = query.limit ?? 10;
    const start = query.page ? (query.page - 1) * limit : 0;
    const params = new URLSearchParams({
      state: mapState(query.state),
      start: String(start),
      limit: String(limit),
    });

    const path = `/rest/api/1.0/projects/${encodeURIComponent(
      projectKey
    )}/repos/${encodeURIComponent(repoSlug)}/pull-requests`;

    const { data, status } = await requestJson<
      BitbucketPagedResponse<{
        id: number;
        title: string;
        description?: string;
        state: string;
        author: { user: { name: string } };
        createdDate?: number;
        updatedDate?: number;
        closedDate?: number;
        fromRef: {
          displayId: string;
          latestCommit?: string;
        };
        toRef: {
          displayId: string;
          latestCommit?: string;
        };
      }>
    >(config, path, params);

    const items =
      data.values?.map(pr => ({
        number: pr.id,
        title: pr.title,
        body: pr.description ?? null,
        url: `${config.baseUrl.replace(
          /\/+$/,
          ''
        )}/projects/${projectKey}/repos/${repoSlug}/pull-requests/${pr.id}`,
        state:
          pr.state.toLowerCase() === 'merged'
            ? 'merged'
            : pr.state.toLowerCase() === 'declined'
              ? 'closed'
              : 'open',
        draft: false,
        author: pr.author.user.name,
        assignees: [],
        labels: [],
        sourceBranch: pr.fromRef.displayId,
        targetBranch: pr.toRef.displayId,
        sourceSha: pr.fromRef.latestCommit,
        targetSha: pr.toRef.latestCommit,
        createdAt: pr.createdDate ? new Date(pr.createdDate).toISOString() : '',
        updatedAt: pr.updatedDate ? new Date(pr.updatedDate).toISOString() : '',
        closedAt: pr.closedDate
          ? new Date(pr.closedDate).toISOString()
          : undefined,
        mergedAt:
          pr.state.toLowerCase() === 'merged' && pr.updatedDate
            ? new Date(pr.updatedDate).toISOString()
            : undefined,
      })) ?? [];

    const pagination = buildPagination(
      data.start ?? start,
      data.limit ?? limit,
      data.isLastPage ?? true,
      data.values?.length ?? 0,
      data.totalCount ?? data.size
    );

    const totalCount =
      typeof data.totalCount === 'number'
        ? data.totalCount
        : typeof data.size === 'number'
          ? data.size
          : items.length;

    return {
      data: {
        items,
        totalCount,
        pagination,
        repositoryContext: { owner: projectKey, repo: repoSlug },
      },
      status,
      provider: 'bitbucket',
    };
  } catch (error) {
    return toProviderError(error);
  }
}

export async function getRepoStructure(
  query: RepoStructureQuery,
  config: BitbucketRequestConfig
): Promise<ProviderResponse<RepoStructureResult>> {
  try {
    const { projectKey, repoSlug } = parseProjectId(query.projectId);

    let branch = query.ref;
    if (!branch) {
      try {
        const defaultBranch = await requestJson<{
          displayId?: string;
          id?: string;
        }>(
          config,
          `/rest/api/1.0/projects/${encodeURIComponent(
            projectKey
          )}/repos/${encodeURIComponent(repoSlug)}/branches/default`
        );
        branch =
          defaultBranch.data.displayId || defaultBranch.data.id || undefined;
      } catch {
        branch = 'master';
      }
    }

    const limit = query.entriesPerPage ?? 200;
    const start =
      query.entryPageNumber && query.entryPageNumber > 1
        ? (query.entryPageNumber - 1) * limit
        : 0;

    const params = new URLSearchParams({
      at: branch ?? 'master',
      limit: String(limit),
      start: String(start),
    });

    if (typeof query.depth === 'number') {
      params.set('maxDepth', String(query.depth));
    }

    const { data, status } = await requestJson<BitbucketPagedResponse<string>>(
      config,
      `/rest/api/1.0/projects/${encodeURIComponent(
        projectKey
      )}/repos/${encodeURIComponent(repoSlug)}/files`,
      params
    );

    const paths = data.values ?? [];
    const { structure, totalFolders } = buildStructure(paths);

    const pagination = buildPagination(
      data.start ?? start,
      data.limit ?? limit,
      data.isLastPage ?? true,
      paths.length,
      data.totalCount ?? data.size
    );

    return {
      data: {
        projectPath: `${projectKey}/${repoSlug}`,
        branch: branch ?? 'master',
        defaultBranch: branch,
        path: query.path || '/',
        structure,
        summary: {
          totalFiles: paths.length,
          totalFolders,
          truncated: pagination.hasMore,
        },
        pagination,
      },
      status,
      provider: 'bitbucket',
    };
  } catch (error) {
    return toProviderError(error);
  }
}
