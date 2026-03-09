/**
 * Bitbucket provider file content delegate.
 */

import type {
  ProviderResponse,
  FileContentQuery,
  FileContentResult,
} from '../types.js';
import { fetchBitbucketFileContentAPI } from '../../bitbucket/fileContent.js';
import type { BitbucketClientConfig } from '../../bitbucket/client.js';
import { parseBitbucketProjectId } from './bitbucketSearch.js';

export function transformFileContentResult(data: {
  filePath: string;
  content: string;
  size: number;
  ref: string;
  lastCommitSha?: string;
  lastModified?: string;
}): FileContentResult {
  return {
    path: data.filePath,
    content: data.content,
    encoding: 'utf-8',
    size: data.size,
    ref: data.ref,
    lastCommitSha: data.lastCommitSha,
    lastModified: data.lastModified,
  };
}

export async function getFileContent(
  query: FileContentQuery,
  clientConfig?: BitbucketClientConfig
): Promise<ProviderResponse<FileContentResult>> {
  const parsed = parseBitbucketProjectId(query.projectId);

  const result = await fetchBitbucketFileContentAPI(
    {
      projectKey: parsed.projectKey,
      repositorySlug: parsed.repositorySlug,
      path: query.path,
      ref: query.ref,
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
    data: transformFileContentResult(result.data),
    status: result.status,
    provider: 'bitbucket',
  };
}
