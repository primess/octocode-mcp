import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cleanup,
  getActiveProvider,
  getActiveProviderConfig,
} from '../src/serverConfig.js';

const originalEnv = { ...process.env };

describe('serverConfig - Bitbucket provider selection', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    cleanup();
  });

  it('prefers Bitbucket when BITBUCKET_TOKEN is set', () => {
    process.env.BITBUCKET_TOKEN = 'bb-token';
    process.env.BITBUCKET_HOST = 'https://bb.local';
    process.env.GITLAB_TOKEN = 'gl-token'; // should be ignored when bitbucket set

    cleanup();

    const provider = getActiveProvider();
    const config = getActiveProviderConfig();

    expect(provider).toBe('bitbucket');
    expect(config.provider).toBe('bitbucket');
    expect(config.baseUrl).toBe('https://bb.local');
    expect(config.token).toBe('bb-token');
  });
});
