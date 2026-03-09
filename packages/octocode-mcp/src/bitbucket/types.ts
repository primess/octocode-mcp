/**
 * Bitbucket Data Center API types.
 */

export interface BitbucketPagedResponse<T> {
  size?: number;
  limit?: number;
  isLastPage?: boolean;
  values: T[];
  start?: number;
  nextPageStart?: number;
}

export interface BitbucketAPIError {
  error: string;
  status: number;
  type: 'http' | 'network' | 'unknown';
  hints?: string[];
  retryAfter?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

export type BitbucketAPIResponse<T> =
  | {
      data: T;
      status: number;
    }
  | BitbucketAPIError;

export interface BitbucketProjectRef {
  key?: string;
  name?: string;
}

export interface BitbucketRepoRef {
  id?: number;
  slug?: string;
  name?: string;
  project?: BitbucketProjectRef;
  links?: {
    self?: Array<{ href?: string }>;
    clone?: Array<{ href?: string; name?: string }>;
  };
  description?: string | null;
  public?: boolean;
  archived?: boolean;
  forkable?: boolean;
  state?: string;
  createdDate?: number;
  updatedDate?: number;
}

export interface BitbucketCodeSearchMatch {
  line?: number;
  lineContent?: string;
  text?: string;
  matchType?: string;
}

export interface BitbucketCodeSearchItem {
  file?: {
    path?: { toString?: string };
    name?: string;
  };
  path?: { toString?: string };
  repository?: BitbucketRepoRef;
  project?: BitbucketProjectRef;
  contentMatches?: BitbucketCodeSearchMatch[];
  pathMatches?: Array<{ text?: string }>;
}

export interface BitbucketBrowseChild {
  type?: 'FILE' | 'DIRECTORY' | string;
  path?: {
    toString?: string;
    name?: string;
  };
}

export interface BitbucketBrowseResponse {
  path?: { toString?: string };
  revision?: string;
  latestCommit?: string;
  size?: number;
  lines?: {
    start?: number;
    limit?: number;
    size?: number;
    isLastPage?: boolean;
    values?: Array<{ text?: string }>;
  };
  children?: BitbucketPagedResponse<BitbucketBrowseChild>;
}

export interface BitbucketBranch {
  id?: string;
  displayId?: string;
  latestCommit?: string;
  isDefault?: boolean;
}

export interface BitbucketPullRequestParticipant {
  approved?: boolean;
  status?: string;
  user?: { name?: string; displayName?: string };
}

export interface BitbucketPullRequest {
  id: number;
  version?: number;
  title: string;
  description?: string | null;
  state?: string;
  open?: boolean;
  closed?: boolean;
  draft?: boolean;
  createdDate?: number;
  updatedDate?: number;
  closedDate?: number;
  locked?: boolean;
  fromRef?: {
    id?: string;
    displayId?: string;
    latestCommit?: string;
    repository?: BitbucketRepoRef;
  };
  toRef?: {
    id?: string;
    displayId?: string;
    latestCommit?: string;
    repository?: BitbucketRepoRef;
  };
  author?: {
    user?: { name?: string; displayName?: string };
  };
  participants?: BitbucketPullRequestParticipant[];
  links?: {
    self?: Array<{ href?: string }>;
  };
  properties?: {
    commentCount?: number;
    openTaskCount?: number;
  };
}

export interface BitbucketPullRequestActivity {
  action?: string;
  comment?: {
    id?: number | string;
    text?: string;
    author?: { name?: string; displayName?: string };
    createdDate?: number;
    updatedDate?: number;
  };
}
