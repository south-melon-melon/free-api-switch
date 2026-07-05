import { describe, it } from 'node:test';
import assert from 'node:assert';
import { redactHeaders } from '../../src/logging/redact.js';

describe('redactHeaders', () => {
  it('should redact authorization header', () => {
    const result = redactHeaders({ authorization: 'Bearer sk-secret-token' });
    assert.strictEqual(result['authorization'], '***');
  });

  it('should redact x-api-key header', () => {
    const result = redactHeaders({ 'x-api-key': 'sk-secret-key' });
    assert.strictEqual(result['x-api-key'], '***');
  });

  it('should redact cookie header', () => {
    const result = redactHeaders({ cookie: 'session=abc123' });
    assert.strictEqual(result['cookie'], '***');
  });

  it('should preserve non-sensitive headers', () => {
    const result = redactHeaders({
      'content-type': 'application/json',
      'accept': 'application/json',
    });
    assert.strictEqual(result['content-type'], 'application/json');
    assert.strictEqual(result['accept'], 'application/json');
  });

  it('should handle case-insensitive matching', () => {
    const result = redactHeaders({ Authorization: 'Bearer token' });
    assert.strictEqual(result['authorization'], '***');
  });

  it('should handle undefined header values', () => {
    const result = redactHeaders({ 'x-custom': undefined });
    assert.ok(!('x-custom' in result));
  });
});
