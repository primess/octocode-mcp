/**
 * Bitbucket provider repository structure delegate.
 */

import type {
  ProviderResponse,
  RepoStructureQuery,
  RepoStructureResult,
} from '../types.js';
import { viewBitbucketRepositoryStructureAPI } from '../../bitbucket/repoStructure.js';
import type { BitbucketClientConfig } from '../../bitbucket/client.js';
import { parseBitbucketProjectId } from './bitbucketSearch.js';

export async function getRepoStructure(
  query: RepoStructureQuery,
  clientConfig?: BitbucketClientConfig
): Promise<ProviderResponse<RepoStructureResult>> {
  const parsed = parseBitbucketProjectId(query.projectId);

  const result = await viewBitbucketRepositoryStructureAPI(
    {
      projectKey: parsed.projectKey,
      repositorySlug: parsed.repositorySlug,
      ref: query.ref,
      path: query.path,
      recursive: query.recursive,
      depth: query.depth,
      perPage: query.entriesPerPage,
      page: query.entryPageNumber,
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
    data: result.data,
    status: result.status,
    provider: 'bitbucket',
  };
}
