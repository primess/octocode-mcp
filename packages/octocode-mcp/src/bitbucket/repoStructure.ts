/**
 * Bitbucket Data Center repository structure fetching.
 */

import type {
  BitbucketAPIResponse,
  BitbucketBrowseChild,
  BitbucketBrowseResponse,
} from './types.js';
import { createBitbucketError } from './errors.js';
import {
  bitbucketGetJson,
  type BitbucketClientConfig,
} from './client.js';
import { getBitbucketDefaultBranch } from './fileContent.js';
import { generateCacheKey, withDataCache } from '../utils/http/cache.js';
import { shouldIgnoreDir, shouldIgnoreFile } from '../utils/file/filters.js';

export interface BitbucketRepoStructureQuery {
  projectKey: string;
  repositorySlug: string;
  ref?: string;
  path?: string;
  recursive?: boolean;
  depth?: number;
  perPage?: number;
  page?: number;
}

export interface BitbucketRepoStructureResult {
  projectPath: string;
  branch: string;
  path: string;
  summary: {
    totalFiles: number;
    totalFolders: number;
    truncated: boolean;
  };
  structure: Record<string, { files: string[]; folders: string[] }>;
  pagination?: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    entriesPerPage: number;
    totalEntries: number;
  };
  hints?: string[];
}

interface FlatItem {
  path: string;
  type: 'file' | 'dir';
}

function relativeDepth(basePath: string, itemPath: string): number {
  const base = basePath.replace(/^\/+|\/+$/g, '');
  const normalizedItem = itemPath.replace(/^\/+|\/+$/g, '');
  if (!base) {
    return normalizedItem ? normalizedItem.split('/').length - 1 : 0;
  }
  const remainder = normalizedItem.startsWith(base)
    ? normalizedItem.slice(base.length).replace(/^\/+/, '')
    : normalizedItem;
  return remainder ? remainder.split('/').length - 1 : 0;
}

function buildStructure(
  items: FlatItem[],
  basePath: string
): Record<string, { files: string[]; folders: string[] }> {
  const structure: Record<string, { files: string[]; folders: string[] }> = {};
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/^\/+|\/+$/g, '');

  for (const item of items) {
    let relativePath = item.path.replace(/^\/+/, '');
    if (normalizedBase && relativePath.startsWith(normalizedBase)) {
      relativePath = relativePath.slice(normalizedBase.length).replace(/^\/+/, '');
    }

    const segments = relativePath.split('/').filter(Boolean);
    const name = segments.pop();
    const parent = segments.length > 0 ? segments.join('/') : '.';
    if (!name) continue;

    structure[parent] ||= { files: [], folders: [] };
    if (item.type === 'file') {
      structure[parent].files.push(name);
    } else {
      structure[parent].folders.push(name);
    }
  }

  for (const entry of Object.values(structure)) {
    entry.files.sort();
    entry.folders.sort();
  }

  return structure;
}

async function fetchBrowsePage(
  projectKey: string,
  repositorySlug: string,
  browsePath: string,
  ref: string,
  start: number,
  limit: number,
  clientConfig?: BitbucketClientConfig
): Promise<BitbucketAPIResponse<BitbucketBrowseResponse>> {
  const encodedPath = browsePath
    ? `/${browsePath.split('/').map(encodeURIComponent).join('/')}`
    : '';

  return bitbucketGetJson<BitbucketBrowseResponse>(
    `/rest/api/latest/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repositorySlug)}/browse${encodedPath}`,
    clientConfig,
    {
      at: ref,
      noContent: true,
      start,
      limit,
    }
  );
}

async function collectItems(
  params: BitbucketRepoStructureQuery,
  ref: string,
  clientConfig?: BitbucketClientConfig
): Promise<BitbucketAPIResponse<FlatItem[]>> {
  const queue = [params.path?.replace(/^\/+|\/+$/g, '') || ''];
  const recursive = params.recursive !== false;
  const depthLimit = params.depth ?? Number.POSITIVE_INFINITY;
  const limit = 1000;
  const items: FlatItem[] = [];

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    let start = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await fetchBrowsePage(
        params.projectKey,
        params.repositorySlug,
        currentPath,
        ref,
        start,
        limit,
        clientConfig
      );

      if ('error' in response) {
        return response;
      }

      const children = response.data.children;
      const values = children?.values || [];

      for (const child of values) {
        const fullPath = child.path?.toString || child.path?.name;
        if (!fullPath) continue;

        if (child.type === 'DIRECTORY') {
          if (shouldIgnoreDir(fullPath.split('/').pop() || fullPath)) continue;
          items.push({ path: fullPath, type: 'dir' });
          if (recursive && relativeDepth(params.path || '/', fullPath) < depthLimit) {
            queue.push(fullPath);
          }
        } else {
          if (shouldIgnoreFile(fullPath)) continue;
          items.push({ path: fullPath, type: 'file' });
        }
      }

      hasMore = !!children && !children.isLastPage && children.nextPageStart !== undefined;
      start = children?.nextPageStart ?? 0;
    }

    if (!recursive) {
      break;
    }
  }

  return { data: items, status: 200 };
}

export async function viewBitbucketRepositoryStructureAPI(
  params: BitbucketRepoStructureQuery,
  clientConfig?: BitbucketClientConfig,
  sessionId?: string
): Promise<BitbucketAPIResponse<BitbucketRepoStructureResult>> {
  if (!params.projectKey || !params.repositorySlug) {
    return createBitbucketError(
      'Bitbucket repository structure requires projectKey and repositorySlug',
      400
    );
  }

  const ref =
    params.ref ||
    (await getBitbucketDefaultBranch(
      params.projectKey,
      params.repositorySlug,
      clientConfig
    ));

  const cacheKey = generateCacheKey(
    'bb-api-structure',
    {
      ...params,
      ref,
      host: clientConfig?.host,
    },
    sessionId
  );

  return withDataCache(cacheKey, async () => {
    const collected = await collectItems(params, ref, clientConfig);
    if ('error' in collected) {
      return collected;
    }

    const allItems = collected.data;
    const entriesPerPage = params.perPage || 20;
    const currentPage = params.page || 1;
    const totalEntries = allItems.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / entriesPerPage));
    const startIndex = (currentPage - 1) * entriesPerPage;
    const pageItems = allItems.slice(startIndex, startIndex + entriesPerPage);
    const hasMore = currentPage < totalPages;
    const totalFiles = allItems.filter(item => item.type === 'file').length;
    const totalFolders = allItems.filter(item => item.type === 'dir').length;

    return {
      data: {
        projectPath: `${params.projectKey}/${params.repositorySlug}`,
        branch: ref,
        path: params.path || '/',
        structure: buildStructure(pageItems, params.path || '/'),
        summary: {
          totalFiles,
          totalFolders,
          truncated: hasMore,
        },
        pagination: {
          currentPage,
          totalPages,
          hasMore,
          entriesPerPage,
          totalEntries,
        },
        hints: hasMore
          ? [`Page ${currentPage}/${totalPages}. Use entryPageNumber=${currentPage + 1} for more.`]
          : undefined,
      },
      status: 200,
    };
  }, {
    shouldCache: value => 'data' in value,
  });
}
