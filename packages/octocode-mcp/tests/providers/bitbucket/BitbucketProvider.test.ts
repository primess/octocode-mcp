import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BitbucketProvider } from '../../../src/providers/bitbucket/BitbucketProvider.js';

const TEST_BASE_URL = 'https://bitbucket.example.com';

describe('BitbucketProvider', () => {
  const provider = new BitbucketProvider({
    baseUrl: TEST_BASE_URL,
    token: 'bb-token',
    type: 'bitbucket',
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searchCode maps responses into unified format', async () => {
    const mockJson = {
      values: [
        {
          file: { path: 'src/index.ts' },
          repo: { slug: 'repo', project: { key: 'PROJ' } },
          contentMatches: [
            {
              lines: [{ text: 'const answer = 42;', line: 10 }],
            },
          ],
          commit: { authorTimestamp: 1731196800000 },
        },
      ],
      start: 0,
      limit: 2,
      isLastPage: true,
      size: 1,
    };

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockJson), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    fetchMock.mockClear();

    const result = await provider.searchCode({
      keywords: ['answer'],
      projectId: 'PROJ/repo',
      limit: 2,
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/rest/search/1.0/code?searchQuery=repo%3APROJ%2Frepo+answer&limit=2&start=0`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer bb-token',
        },
      }
    );

    expect(result.provider).toBe('bitbucket');
    expect(result.data?.items).toHaveLength(1);
    expect(result.data?.items[0].repository.name).toBe('PROJ/repo');
    expect(result.data?.items[0].matches[0].context).toContain('answer');
    expect(result.data?.pagination.currentPage).toBe(1);
    expect(result.data?.repositoryContext?.owner).toBe('PROJ');
  });

  it('getFileContent returns raw text and encoding metadata', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('console.log("hi")', {
        status: 200,
        headers: { 'content-length': '17' },
      })
    );
    fetchMock.mockClear();

    const result = await provider.getFileContent({
      projectId: 'PROJ/repo',
      path: 'src/index.ts',
      ref: 'main',
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/rest/api/1.0/projects/PROJ/repos/repo/raw/src/index.ts?at=main`,
      {
        headers: {
          Authorization: 'Bearer bb-token',
        },
      }
    );

    expect(result.data?.content).toContain('console.log');
    expect(result.data?.encoding).toBe('utf-8');
    expect(result.data?.ref).toBe('main');
  });
});
