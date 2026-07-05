import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildTargetUrl } from '../../src/proxy/targetUrl.js';

describe('buildTargetUrl', () => {
  it('should append path to base URL', () => {
    const url = buildTargetUrl('https://api.deepseek.com', '/v1/chat/completions');
    assert.strictEqual(url.href, 'https://api.deepseek.com/v1/chat/completions');
  });

  it('should preserve query string', () => {
    const url = buildTargetUrl('https://api.deepseek.com', '/v1/chat/completions?foo=bar');
    assert.strictEqual(url.href, 'https://api.deepseek.com/v1/chat/completions?foo=bar');
  });

  it('should handle base URL with trailing slash', () => {
    const url = buildTargetUrl('https://api.deepseek.com/', '/v1/chat/completions');
    assert.strictEqual(url.href, 'https://api.deepseek.com/v1/chat/completions');
  });

  it('should handle reqUrl without leading slash', () => {
    const url = buildTargetUrl('https://api.deepseek.com', 'v1/chat/completions');
    assert.strictEqual(url.href, 'https://api.deepseek.com/v1/chat/completions');
  });
});
