/**
 * Bitbucket API Types
 *
 * Type definitions for Bitbucket Data Center/Server API operations.
 *
 * @module bitbucket/types
 */

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Bitbucket API error structure.
 */
export interface BitbucketAPIError {
  error: string;
  status?: number;
  type: 'http' | 'network' | 'unknown';
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  retryAfter?: number;
  hints?: string[];
}

/**
 * Bitbucket API success response.
 */
export interface BitbucketAPISuccess<T> {
  data: T;
  status: number;
  headers?: Record<string, string>;
}

/**
 * Bitbucket API response (success or error).
 */
export type BitbucketAPIResponse<T> = BitbucketAPISuccess<T> | BitbucketAPIError;

// ============================================================================
// REPOSITORY TYPES
// ============================================================================

/**
 * Bitbucket repository information.
 * Based on Bitbucket Data Center REST API v1.0.
 */
export interface BitbucketRepository {
  id: number;
  slug: string;
  name: string;
  description?: string;
  hierarchyId: string;
  scmId: string;
  state: 'AVAILABLE' | 'INITIALISING';
  statusMessage?: string;
  forkable: boolean;
  project: {
    key: string;
    id: number;
    name: string;
    description?: string;
    public: boolean;
    type: 'NORMAL' | 'PERSONAL';
    links?: {
      self?: Array<{ href: string }>;
    };
  };
  public: boolean;
  archived?: boolean;
  links?: {
    clone?: Array<{ href: string; name: string }>;
    self?: Array<{ href: string }>;
  };
}

// ============================================================================
// FILE CONTENT TYPES
// ============================================================================

/**
 * Bitbucket file content query parameters.
 */
export interface BitbucketFileContentQuery {
  /** Project key */
  projectKey: string;
  /** Repository slug */
  repositorySlug: string;
  /** File path */
  path: string;
  /** Branch/tag/commit reference (optional) */
  at?: string;
  /** Start line for partial content */
  startLine?: number;
  /** End line for partial content */
  endLine?: number;
}

/**
 * Bitbucket file content result.
 */
export interface BitbucketFileContent {
  path: string;
  content: string;
  size: number;
  encoding?: string;
  ref?: string;
}

// ============================================================================
// PULL REQUEST TYPES
// ============================================================================

/**
 * Bitbucket pull request query parameters.
 */
export interface BitbucketPullRequestQuery {
  /** Project key */
  projectKey?: string;
  /** Repository slug */
  repositorySlug?: string;
  /** PR id */
  id?: number;
  /** State filter */
  state?: 'OPEN' | 'MERGED' | 'DECLINED' | 'ALL';
  /** Direction (INCOMING=to repo, OUTGOING=from repo) */
  direction?: 'INCOMING' | 'OUTGOING';
  /** Branch reference */
  at?: string;
  /** Order by field */
  order?: 'NEWEST' | 'OLDEST';
  /** Results per page */
  limit?: number;
  /** Start index for pagination */
  start?: number;
}

/**
 * Bitbucket pull request item.
 */
export interface BitbucketPullRequest {
  id: number;
  version: number;
  title: string;
  description?: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  open: boolean;
  closed: boolean;
  createdDate: number;
  updatedDate: number;
  closedDate?: number;
  fromRef: {
    id: string;
    displayId: string;
    latestCommit: string;
    repository?: BitbucketRepository;
  };
  toRef: {
    id: string;
    displayId: string;
    latestCommit: string;
    repository?: BitbucketRepository;
  };
  locked: boolean;
  author: {
    user: {
      name: string;
      emailAddress?: string;
      id: number;
      displayName: string;
      active: boolean;
      slug: string;
      type: 'NORMAL' | 'SERVICE';
    };
    role: 'AUTHOR' | 'REVIEWER' | 'PARTICIPANT';
    approved: boolean;
    status: 'APPROVED' | 'UNAPPROVED' | 'NEEDS_WORK';
  };
  reviewers?: Array<{
    user: {
      name: string;
      emailAddress?: string;
      id: number;
      displayName: string;
      active: boolean;
      slug: string;
      type: 'NORMAL' | 'SERVICE';
    };
    lastReviewedCommit?: string;
    role: 'AUTHOR' | 'REVIEWER' | 'PARTICIPANT';
    approved: boolean;
    status: 'APPROVED' | 'UNAPPROVED' | 'NEEDS_WORK';
  }>;
  participants?: Array<{
    user: {
      name: string;
      displayName: string;
      slug: string;
    };
    role: 'AUTHOR' | 'REVIEWER' | 'PARTICIPANT';
    approved: boolean;
  }>;
  properties?: {
    mergeCommit?: {
      id: string;
      displayId: string;
    };
    openTaskCount?: number;
    resolvedTaskCount?: number;
  };
  links?: {
    self?: Array<{ href: string }>;
  };
}

/**
 * Bitbucket paginated response.
 */
export interface BitbucketPagedResponse<T> {
  size: number;
  limit: number;
  start: number;
  isLastPage: boolean;
  values: T[];
  nextPageStart?: number;
}

// ============================================================================
// REPOSITORY TREE TYPES
// ============================================================================

/**
 * Bitbucket repository tree query parameters.
 */
export interface BitbucketTreeQuery {
  /** Project key */
  projectKey: string;
  /** Repository slug */
  repositorySlug: string;
  /** Path to browse */
  path?: string;
  /** Branch/tag/commit reference */
  at?: string;
  /** Results per page */
  limit?: number;
  /** Start index for pagination */
  start?: number;
}

/**
 * Bitbucket tree item.
 */
export interface BitbucketTreeItem {
  path: {
    components: string[];
    parent?: string;
    name: string;
    extension?: string;
    toString: string;
  };
  type: 'FILE' | 'DIRECTORY';
  contentId?: string;
  size?: number;
}

// ============================================================================
// REPOSITORY SEARCH TYPES
// ============================================================================

/**
 * Bitbucket repository search query parameters.
 * Note: Bitbucket Data Center doesn't support full-text repo search,
 * so this relies on listing and client-side filtering.
 */
export interface BitbucketRepositorySearchQuery {
  /** Project key to filter by */
  projectKey?: string;
  /** Search string for name matching (client-side) */
  name?: string;
  /** Visibility filter */
  visibility?: 'public' | 'private';
  /** Results per page */
  limit?: number;
  /** Start index for pagination */
  start?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if response is a Bitbucket API error.
 */
export function isBitbucketAPIError(obj: unknown): obj is BitbucketAPIError {
  return !!(
    obj &&
    typeof obj === 'object' &&
    'error' in obj &&
    typeof (obj as Record<string, unknown>).error === 'string' &&
    'type' in obj
  );
}

/**
 * Check if response is a Bitbucket API success.
 */
export function isBitbucketAPISuccess<T>(
  obj: unknown
): obj is BitbucketAPISuccess<T> {
  return !!(
    obj &&
    typeof obj === 'object' &&
    'data' in obj &&
    'status' in obj &&
    typeof (obj as Record<string, unknown>).status === 'number'
  );
}

/**
 * Check if response is a Bitbucket paged response.
 */
export function isBitbucketPagedResponse<T>(
  obj: unknown
): obj is BitbucketPagedResponse<T> {
  return !!(
    obj &&
    typeof obj === 'object' &&
    'values' in obj &&
    Array.isArray((obj as Record<string, unknown>).values) &&
    'isLastPage' in obj
  );
}
