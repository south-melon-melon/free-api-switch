import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractLocalKey,
  resolveProfile,
  resolveEndpointFamily,
} from '../../src/core/profileResolver.js';
import { RuntimeConfig, InterfaceType } from '../../src/core/types.js';
import { LocalError } from '../../src/core/errors.js';

describe('extractLocalKey', () => {
  it('should extract from Authorization: Bearer', () => {
    const key = extractLocalKey({ authorization: 'Bearer sk-test-key' });
    assert.strictEqual(key, 'sk-test-key');
  });

  it('should extract from Authorization: bearer (lowercase)', () => {
    const key = extractLocalKey({ authorization: 'bearer sk-test-key' });
    assert.strictEqual(key, 'sk-test-key');
  });

  it('should extract from x-api-key', () => {
    const key = extractLocalKey({ 'x-api-key': 'sk-api-key' });
    assert.strictEqual(key, 'sk-api-key');
  });

  it('should trim whitespace from Bearer token', () => {
    const key = extractLocalKey({ authorization: '  Bearer   sk-test-key  ' });
    assert.strictEqual(key, 'sk-test-key');
  });

  it('should trim whitespace from x-api-key', () => {
    const key = extractLocalKey({ 'x-api-key': '  sk-api-key  ' });
    assert.strictEqual(key, 'sk-api-key');
  });

  it('should return undefined when no auth header', () => {
    const key = extractLocalKey({});
    assert.strictEqual(key, undefined);
  });

  it('should return undefined for empty Bearer token', () => {
    const key = extractLocalKey({ authorization: 'Bearer ' });
    assert.strictEqual(key, undefined);
  });

  it('should return undefined for empty x-api-key', () => {
    const key = extractLocalKey({ 'x-api-key': '' });
    assert.strictEqual(key, undefined);
  });

  it('should prefer Authorization: Bearer over x-api-key', () => {
    const key = extractLocalKey({
      authorization: 'Bearer bearer-token',
      'x-api-key': 'x-api-token',
    });
    assert.strictEqual(key, 'bearer-token');
  });

  it('should handle x-api-key as array', () => {
    const key = extractLocalKey({ 'x-api-key': ['sk-array-key'] });
    assert.strictEqual(key, 'sk-array-key');
  });
});

describe('resolveEndpointFamily', () => {
  it('maps /v1/chat/completions to openai', () => {
    assert.strictEqual(resolveEndpointFamily('/v1/chat/completions'), 'openai');
  });

  it('maps /v1/messages to anthropic', () => {
    assert.strictEqual(resolveEndpointFamily('/v1/messages'), 'anthropic');
  });

  it('returns null for other paths', () => {
    assert.strictEqual(resolveEndpointFamily('/v1/models'), null);
    assert.strictEqual(resolveEndpointFamily('/'), null);
  });
});

describe('resolveProfile', () => {
  interface ProfileSpec {
    model_name: string;
    enabled: boolean;
    type?: InterfaceType;
  }

  function makeRuntime(
    profiles: ProfileSpec[],
    defaultOpenai = 'openai-p',
    defaultAnthropic = 'anthropic-p',
  ): RuntimeConfig {
    const enabledProfilesByModelName = new Map();
    const fullProfiles = profiles.map(p => {
      const profile = {
        model_name: p.model_name,
        model_id: `${p.model_name}-upstream`,
        enabled: p.enabled,
        type: (p.type ?? 'openai_compatible') as InterfaceType,
        base_url: 'https://api.example.com',
        api_key: 'sk-real',
        defaults: {},
      };
      if (p.enabled) {
        enabledProfilesByModelName.set(p.model_name, profile);
      }
      return profile;
    });

    return {
      app: {
        host: '127.0.0.1',
        port: 8787,
        log_level: 'info',
        request_timeout_ms: 30000,
        local_key: '123456',
        default_openai_model: defaultOpenai,
        default_anthropic_model: defaultAnthropic,
      },
      profiles: fullProfiles,
      enabledProfilesByModelName,
    };
  }

  it('should resolve openai profile for openai family', () => {
    const runtime = makeRuntime([
      { model_name: 'openai-p', enabled: true, type: 'openai_compatible' },
      { model_name: 'anthropic-p', enabled: true, type: 'anthropic_compatible' },
    ]);
    const profile = resolveProfile(runtime, '123456', 'openai');
    assert.strictEqual(profile.model_name, 'openai-p');
  });

  it('should resolve anthropic profile for anthropic family', () => {
    const runtime = makeRuntime([
      { model_name: 'openai-p', enabled: true, type: 'openai_compatible' },
      { model_name: 'anthropic-p', enabled: true, type: 'anthropic_compatible' },
    ]);
    const profile = resolveProfile(runtime, '123456', 'anthropic');
    assert.strictEqual(profile.model_name, 'anthropic-p');
  });

  it('should throw LOCAL_KEY_MISSING for undefined key', () => {
    const runtime = makeRuntime([
      { model_name: 'openai-p', enabled: true, type: 'openai_compatible' },
      { model_name: 'anthropic-p', enabled: true, type: 'anthropic_compatible' },
    ]);
    assert.throws(() => resolveProfile(runtime, undefined, 'openai'), (err: unknown) => {
      return err instanceof LocalError && err.code === 'LOCAL_KEY_MISSING';
    });
  });

  it('should throw INVALID_LOCAL_KEY for wrong key', () => {
    const runtime = makeRuntime([
      { model_name: 'openai-p', enabled: true, type: 'openai_compatible' },
      { model_name: 'anthropic-p', enabled: true, type: 'anthropic_compatible' },
    ]);
    assert.throws(() => resolveProfile(runtime, 'wrong-key', 'openai'), (err: unknown) => {
      return err instanceof LocalError && err.code === 'INVALID_LOCAL_KEY';
    });
  });
});
