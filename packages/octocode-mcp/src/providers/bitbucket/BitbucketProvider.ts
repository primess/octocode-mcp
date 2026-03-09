/**
 * Bitbucket Data Center provider adapter.
 */

import type {
  ICodeHostProvider,
  ProviderConfig,
  ProviderResponse,
  CodeSearchQuery,
  CodeSearchResult,
  FileContentQuery,
  FileContentResult,
  RepoSearchQuery,
  RepoSearchResult,
  PullRequestQuery,
  PullRequestSearchResult,
  RepoStructureQuery,
  RepoStructureResult,
} from '../types.js';
import * as bitbucketSearch from './bitbucketSearch.js';
import * as bitbucketContent from './bitbucketContent.js';
import * as bitbucketPullRequests from './bitbucketPullRequests.js';
import * as bitbucketStructure from './bitbucketStructure.js';
import { handleBitbucketAPIError } from '../../bitbucket/errors.js';
import type { BitbucketClientConfig } from '../../bitbucket/client.js';
import type { BitbucketAPIError } from '../../bitbucket/types.js';

export class BitbucketProvider implements ICodeHostProvider {
  readonly type = 'bitbucket' as const;
  private clientConfig: BitbucketClientConfig;

  constructor(config?: ProviderConfig) {
    this.clientConfig = {
      host: config?.baseUrl,
      token: config?.token || config?.authInfo?.token,
    };
  }

  async searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>> {
    try {
      return await bitbucketSearch.searchCode(query, this.clientConfig);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>> {
    try {
      return await bitbucketContent.getFileContent(query, this.clientConfig);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>> {
    try {
      return await bitbucketSearch.searchRepos(query, this.clientConfig);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>> {
    try {
      return await bitbucketPullRequests.searchPullRequests(
        query,
        this.clientConfig
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>> {
    try {
      return await bitbucketStructure.getRepoStructure(query, this.clientConfig);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown): ProviderResponse<never> {
    const apiError = handleBitbucketAPIError(error);

    return {
      error: apiError.error,
      status: apiError.status || 500,
      provider: 'bitbucket',
      hints: apiError.hints,
      rateLimit: this.extractRateLimit(apiError),
    };
  }

  private extractRateLimit(
    apiError: BitbucketAPIError
  ): ProviderResponse<never>['rateLimit'] {
    if (
      apiError.rateLimitRemaining === undefined &&
      apiError.retryAfter === undefined &&
      apiError.rateLimitReset === undefined
    ) {
      return undefined;
    }

    return {
      remaining: apiError.rateLimitRemaining ?? 0,
      reset:
        apiError.rateLimitReset ??
        Math.floor(Date.now() / 1000) + (apiError.retryAfter ?? 60),
      retryAfter: apiError.retryAfter,
    };
  }
}
