import { describe, expect, it } from 'vitest';
import { searchBitbucketCodeAPI } from '../../src/bitbucket/codeSearch.js';

describe('Bitbucket code search', () => {
  it('requires repository scope before attempting Bitbucket code search', async () => {
    const result = await searchBitbucketCodeAPI({
      search: 'token',
    });

    expect('error' in result).toBe(true);
    if (!('error' in result)) {
      throw new Error('Expected error response');
    }
    expect(result.status).toBe(400);
    expect(result.error).toContain('requires project and repository scope');
    expect(result.hints?.[0]).toContain('owner=PROJECT_KEY');
  });
});
