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
import {
  searchCode,
  getFileContent,
  searchRepos,
  searchPullRequests,
  getRepoStructure,
} from './bitbucketApi.js';

interface BitbucketProviderConfig {
  baseUrl: string;
  token?: string;
}

export class BitbucketProvider implements ICodeHostProvider {
  readonly type = 'bitbucket' as const;
  private readonly config: BitbucketProviderConfig;

  constructor(config?: ProviderConfig) {
    this.config = {
      baseUrl: (config?.baseUrl || 'https://bitbucket.org').replace(/\/+$/, ''),
      token: config?.token,
    };
  }

  async searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>> {
    return searchCode(query, this.config);
  }

  async getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>> {
    return getFileContent(query, this.config);
  }

  async searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>> {
    return searchRepos(query, this.config);
  }

  async searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>> {
    return searchPullRequests(query, this.config);
  }

  async getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>> {
    return getRepoStructure(query, this.config);
  }
}
