/**
 * Bitbucket Data Center configuration module.
 * Handles Bitbucket token resolution and host configuration.
 */
import { getConfigSync } from 'octocode-shared';
import type { BitbucketConfig, BitbucketTokenSourceType } from './types.js';

/** Result of Bitbucket token resolution with source tracking */
interface BitbucketTokenResolutionResult {
  token: string | null;
  source: BitbucketTokenSourceType;
}

/**
 * Resolve Bitbucket token from environment variables.
 * Priority: BITBUCKET_TOKEN > BB_TOKEN
 */
function resolveBitbucketToken(): BitbucketTokenResolutionResult {
  const bitbucketToken = process.env.BITBUCKET_TOKEN?.trim();
  if (bitbucketToken) {
    return { token: bitbucketToken, source: 'env:BITBUCKET_TOKEN' };
  }

  const bbToken = process.env.BB_TOKEN?.trim();
  if (bbToken) {
    return { token: bbToken, source: 'env:BB_TOKEN' };
  }

  return { token: null, source: 'none' };
}

/**
 * Resolve Bitbucket configuration from environment variables and global config.
 * Priority: env vars > ~/.octocode/.octocoderc > defaults
 */
function resolveBitbucketConfig(): BitbucketConfig {
  const tokenResult = resolveBitbucketToken();
  const host = getConfigSync().bitbucket.host;

  return {
    host,
    token: tokenResult.token,
    tokenSource: tokenResult.source,
    isConfigured: tokenResult.token !== null && !!host,
  };
}

/**
 * Get the Bitbucket configuration.
 * Always resolves fresh - no caching.
 */
export function getBitbucketConfig(): BitbucketConfig {
  return resolveBitbucketConfig();
}

/**
 * Get the Bitbucket API token.
 * Always resolves fresh - not cached.
 */
export function getBitbucketToken(): string | null {
  return resolveBitbucketToken().token;
}

/**
 * Get the Bitbucket host URL.
 * Priority: env var > config file
 */
export function getBitbucketHost(): string | undefined {
  return getConfigSync().bitbucket.host;
}

/**
 * Get the source of the current Bitbucket token.
 */
export function getBitbucketTokenSource(): BitbucketTokenSourceType {
  return resolveBitbucketToken().source;
}

/**
 * Check if Bitbucket is configured with a valid token and host.
 */
export function isBitbucketConfigured(): boolean {
  const config = resolveBitbucketConfig();
  return config.isConfigured;
}
