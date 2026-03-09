import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseBitbucketProjectId,
  searchCode,
  searchRepos,
} from '../../../src/providers/bitbucket/bitbucketSearch.js';
import { getFileContent } from '../../../src/providers/bitbucket/bitbucketContent.js';
import { searchPullRequests } from '../../../src/providers/bitbucket/bitbucketPullRequests.js';
import { getRepoStructure } from '../../../src/providers/bitbucket/bitbucketStructure.js';

vi.mock('../../../src/bitbucket/codeSearch.js', () => ({
  searchBitbucketCodeAPI: vi.fn(),
}));

vi.mock('../../../src/bitbucket/projectsSearch.js', () => ({
  searchBitbucketProjectsAPI: vi.fn(),
}));

vi.mock('../../../src/bitbucket/fileContent.js', () => ({
  fetchBitbucketFileContentAPI: vi.fn(),
}));

vi.mock('../../../src/bitbucket/pullRequests.js', () => ({
  searchBitbucketPullRequestsAPI: vi.fn(),
}));

vi.mock('../../../src/bitbucket/repoStructure.js', () => ({
  viewBitbucketRepositoryStructureAPI: vi.fn(),
}));

import { searchBitbucketCodeAPI } from '../../../src/bitbucket/codeSearch.js';
import { searchBitbucketProjectsAPI } from '../../../src/bitbucket/projectsSearch.js';
import { fetchBitbucketFileContentAPI } from '../../../src/bitbucket/fileContent.js';
import { searchBitbucketPullRequestsAPI } from '../../../src/bitbucket/pullRequests.js';
import { viewBitbucketRepositoryStructureAPI } from '../../../src/bitbucket/repoStructure.js';

const mockSearchBitbucketCodeAPI = vi.mocked(searchBitbucketCodeAPI);
const mockSearchBitbucketProjectsAPI = vi.mocked(searchBitbucketProjectsAPI);
const mockFetchBitbucketFileContentAPI = vi.mocked(
  fetchBitbucketFileContentAPI
);
const mockSearchBitbucketPullRequestsAPI = vi.mocked(
  searchBitbucketPullRequestsAPI
);
const mockViewBitbucketRepositoryStructureAPI = vi.mocked(
  viewBitbucketRepositoryStructureAPI
);

describe('Bitbucket provider delegates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a Bitbucket project key and repository slug', () => {
    expect(parseBitbucketProjectId('PROJ/repo-slug')).toEqual({
      projectKey: 'PROJ',
      repositorySlug: 'repo-slug',
    });
  });

  it('rejects invalid Bitbucket project id format', () => {
    expect(() => parseBitbucketProjectId('invalid')).toThrow(
      "Invalid Bitbucket projectId format: 'invalid'. Expected 'PROJECT/repository-slug'."
    );
  });

  it('transforms code search results', async () => {
    mockSearchBitbucketCodeAPI.mockResolvedValue({
      data: {
        items: [
          {
            file: { path: { toString: 'src/index.ts' } },
            repository: {
              id: 10,
              slug: 'repo-slug',
              project: { key: 'PROJ' },
              links: {
                self: [
                  {
                    href: 'https://bitbucket.company.local/projects/PROJ/repos/repo-slug',
                  },
                ],
              },
            },
            contentMatches: [{ line: 12, lineContent: 'const token = true;' }],
          },
        ],
        totalCount: 1,
        pagination: { currentPage: 1, totalPages: 1, hasMore: false },
      },
      status: 200,
    } as any);

    const result = await searchCode({
      keywords: ['token'],
      projectId: 'PROJ/repo-slug',
    });

    expect(result.provider).toBe('bitbucket');
    expect(result.data?.items[0]?.path).toBe('src/index.ts');
    expect(result.data?.repositoryContext).toEqual({
      owner: 'PROJ',
      repo: 'repo-slug',
    });
  });

  it('returns Bitbucket code-search scope error when repository scope is missing', async () => {
    mockSearchBitbucketCodeAPI.mockResolvedValue({
      error:
        'Bitbucket Data Center code search currently requires project and repository scope.',
      status: 400,
      hints: [
        'Provide both owner=PROJECT_KEY and repo=repository-slug when using Bitbucket code search.',
      ],
      type: 'http',
    } as any);

    const result = await searchCode({
      keywords: ['token'],
    });

    expect(result.status).toBe(400);
    expect(result.error).toContain('requires project and repository scope');
    expect(result.hints?.[0]).toContain('owner=PROJECT_KEY');
  });

  it('transforms repository search results', async () => {
    mockSearchBitbucketProjectsAPI.mockResolvedValue({
      data: {
        repositories: [
          {
            id: 1,
            slug: 'repo-slug',
            name: 'repo-slug',
            project: { key: 'PROJ' },
            links: {
              self: [
                {
                  href: 'https://bitbucket.company.local/projects/PROJ/repos/repo-slug',
                },
              ],
              clone: [
                {
                  href: 'https://bitbucket.company.local/scm/proj/repo-slug.git',
                  name: 'http',
                },
              ],
            },
            public: false,
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          totalMatches: 1,
        },
      },
      status: 200,
    } as any);

    const result = await searchRepos({ keywords: ['repo'], owner: 'PROJ' });

    expect(result.data?.repositories[0]?.fullPath).toBe('PROJ/repo-slug');
    expect(result.data?.repositories[0]?.cloneUrl).toContain('repo-slug.git');
  });

  it('transforms file content results', async () => {
    mockFetchBitbucketFileContentAPI.mockResolvedValue({
      data: {
        filePath: 'src/index.ts',
        content: 'export const ready = true;',
        size: 26,
        ref: 'main',
        lastCommitSha: 'abc123',
      },
      status: 200,
    } as any);

    const result = await getFileContent({
      projectId: 'PROJ/repo-slug',
      path: 'src/index.ts',
    });

    expect(result.data?.content).toContain('ready');
    expect(result.data?.lastCommitSha).toBe('abc123');
  });

  it('requires repository scope for pull request searches', async () => {
    const result = await searchPullRequests({ state: 'open' });

    expect(result.error).toContain('requires owner and repo');
    expect(result.status).toBe(400);
  });

  it('transforms pull request results with comments', async () => {
    mockSearchBitbucketPullRequestsAPI.mockResolvedValue({
      data: {
        pullRequests: [
          {
            id: 42,
            title: 'Add support',
            description: 'Implements feature',
            state: 'OPEN',
            links: {
              self: [
                { href: 'https://bitbucket.company.local/pull-requests/42' },
              ],
            },
            author: { user: { name: 'alice' } },
            fromRef: { displayId: 'feature/bitbucket', latestCommit: 'abc123' },
            toRef: { displayId: 'main', latestCommit: 'def456' },
            createdDate: Date.UTC(2024, 0, 1),
            updatedDate: Date.UTC(2024, 0, 2),
            properties: { commentCount: 1 },
            __activities: [
              {
                action: 'COMMENTED',
                comment: {
                  id: 5,
                  text: 'Looks good',
                  author: { name: 'bob' },
                  createdDate: Date.UTC(2024, 0, 3),
                  updatedDate: Date.UTC(2024, 0, 3),
                },
              },
            ],
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          hasMore: false,
          totalMatches: 1,
        },
      },
      status: 200,
    } as any);

    const result = await searchPullRequests({
      projectId: 'PROJ/repo-slug',
      state: 'open',
      withComments: true,
    });

    expect(result.data?.items[0]?.number).toBe(42);
    expect(result.data?.items[0]?.comments?.[0]?.body).toBe('Looks good');
  });

  it('transforms repository structure results', async () => {
    mockViewBitbucketRepositoryStructureAPI.mockResolvedValue({
      data: {
        projectPath: 'PROJ/repo-slug',
        branch: 'main',
        path: '/',
        structure: { '.': { files: ['README.md'], folders: ['src'] } },
        summary: { totalFiles: 1, totalFolders: 1, truncated: false },
      },
      status: 200,
    } as any);

    const result = await getRepoStructure({ projectId: 'PROJ/repo-slug' });

    expect(result.data?.projectPath).toBe('PROJ/repo-slug');
    expect(result.data?.structure['.']?.folders).toEqual(['src']);
  });
});
