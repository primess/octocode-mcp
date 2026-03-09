/**
 * Bitbucket Data Center file content fetching.
 */

import type { BitbucketAPIResponse, BitbucketBranch } from './types.js';
import { createBitbucketError } from './errors.js';
import {
  bitbucketGetJson,
  bitbucketGetText,
  type BitbucketClientConfig,
} from './client.js';
import { generateCacheKey, withDataCache } from '../utils/http/cache.js';

export interface BitbucketFileContentQuery {
  projectKey: string;
  repositorySlug: string;
  path: string;
  ref?: string;
}

export interface BitbucketFileContentResult {
  filePath: string;
  content: string;
  size: number;
  ref: string;
  lastCommitSha?: string;
  lastModified?: string;
}

export async function getBitbucketDefaultBranch(
  projectKey: string,
  repositorySlug: string,
  clientConfig?: BitbucketClientConfig
): Promise<string> {
  const result = await bitbucketGetJson<BitbucketBranch>(
    `/rest/api/latest/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repositorySlug)}/branches/default`,
    clientConfig
  );

  if ('error' in result) {
    throw new Error(result.error);
  }

  return result.data.displayId || 'main';
}

export async function fetchBitbucketFileContentAPI(
  params: BitbucketFileContentQuery,
  clientConfig?: BitbucketClientConfig,
  sessionId?: string
): Promise<BitbucketAPIResponse<BitbucketFileContentResult>> {
  if (!params.projectKey || !params.repositorySlug || !params.path) {
    return createBitbucketError(
      'projectKey, repositorySlug, and path are required',
      400
    );
  }

  const workingRef =
    params.ref ||
    (await getBitbucketDefaultBranch(
      params.projectKey,
      params.repositorySlug,
      clientConfig
    ));

  const cacheKey = generateCacheKey(
    'bb-api-file-content',
    {
      ...params,
      ref: workingRef,
      host: clientConfig?.host,
    },
    sessionId
  );

  return withDataCache(
    cacheKey,
    async () => {
      const [textResult, metaResult] = await Promise.all([
        bitbucketGetText(
          `/rest/api/latest/projects/${encodeURIComponent(params.projectKey)}/repos/${encodeURIComponent(params.repositorySlug)}/raw/${params.path
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`,
          clientConfig,
          { at: workingRef }
        ),
        bitbucketGetJson<{ latestCommit?: string; size?: number }>(
          `/rest/api/latest/projects/${encodeURIComponent(params.projectKey)}/repos/${encodeURIComponent(params.repositorySlug)}/browse/${params.path
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`,
          clientConfig,
          { at: workingRef, noContent: true }
        ),
      ]);

      if ('error' in textResult) {
        return textResult;
      }
      if ('error' in metaResult) {
        return metaResult;
      }

      return {
        data: {
          filePath: params.path,
          content: textResult.data.text,
          size:
            metaResult.data.size ||
            textResult.data.contentLength ||
            textResult.data.text.length,
          ref: workingRef,
          lastCommitSha: metaResult.data.latestCommit,
          lastModified: textResult.data.lastModified,
        },
        status: textResult.status,
      };
    },
    {
      shouldCache: value => 'data' in value,
    }
  );
}
