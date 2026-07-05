import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildUpstreamHeaders } from '../../src/proxy/headerRewrite.js';
import { ProfileConfig } from '../../src/core/types.js';

describe('buildUpstreamHeaders', () => {
  function makeProfile(type: 'openai_compatible' | 'anthropic_compatible'): ProfileConfig {
    return {
      model_name: 'test',
      model_id: 'test-upstream',
      enabled: true,
      type,
      base_url: 'https://api.example.com',
      api_key: 'sk-upstream-key',
      defaults: {},
    };
  }

  it('should set Authorization: Bearer for openai_compatible', () => {
    const headers = buildUpstreamHeaders({}, makeProfile('openai_compatible'));
    assert.strictEqual(headers['authorization'], 'Bearer sk-upstream-key');
  });

  it('should set x-api-key for anthropic_compatible', () => {
    const headers = buildUpstreamHeaders({}, makeProfile('anthropic_compatible'));
    assert.strictEqual(headers['x-api-key'], 'sk-upstream-key');
  });

  it('should remove local authorization header', () => {
    const headers = buildUpstreamHeaders(
      { authorization: 'Bearer local-key' },
      makeProfile('openai_compatible'),
    );
    assert.strictEqual(headers['authorization'], 'Bearer sk-upstream-key');
  });

  it('should remove local x-api-key header', () => {
    const headers = buildUpstreamHeaders(
      { 'x-api-key': 'local-key' },
      makeProfile('anthropic_compatible'),
    );
    assert.strictEqual(headers['x-api-key'], 'sk-upstream-key');
  });

  it('should remove hop-by-hop headers', () => {
    const headers = buildUpstreamHeaders(
      {
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'transfer-encoding': 'chunked',
        upgrade: 'websocket',
        host: 'localhost:8787',
        'content-length': '100',
        'content-type': 'application/json',
      },
      makeProfile('openai_compatible'),
    );
    assert.ok(!('connection' in headers));
    assert.ok(!('keep-alive' in headers));
    assert.ok(!('transfer-encoding' in headers));
    assert.ok(!('upgrade' in headers));
    assert.ok(!('host' in headers));
    assert.ok(!('content-length' in headers));
  });

  it('should preserve business headers', () => {
    const headers = buildUpstreamHeaders(
      {
        'content-type': 'application/json',
        'accept': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      makeProfile('openai_compatible'),
    );
    assert.strictEqual(headers['content-type'], 'application/json');
    assert.strictEqual(headers['accept'], 'application/json');
    assert.strictEqual(headers['anthropic-version'], '2023-06-01');
  });
});
