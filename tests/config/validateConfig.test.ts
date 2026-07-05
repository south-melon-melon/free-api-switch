import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateConfig } from '../../src/config/validateConfig.js';
import { LocalError } from '../../src/core/errors.js';

describe('validateConfig', () => {
  const validAppRaw = {
    host: '127.0.0.1',
    port: 8787,
    log_level: 'info',
    request_timeout_ms: 30000,
    local_key: '123456',
    default_openai_model: 'openai-profile',
    default_anthropic_model: 'anthropic-profile',
  };

  function makeOpenaiProfile(overrides: Record<string, unknown> = {}) {
    return {
      model_name: 'openai-profile',
      model_id: 'gpt-4o-mini',
      enabled: true,
      type: 'openai_compatible',
      base_url: 'https://api.openai.com',
      api_key: 'sk-real-openai',
      ...overrides,
    };
  }

  function makeAnthropicProfile(overrides: Record<string, unknown> = {}) {
    return {
      model_name: 'anthropic-profile',
      model_id: 'claude-sonnet-4-20250514',
      enabled: true,
      type: 'anthropic_compatible',
      base_url: 'https://api.anthropic.com',
      api_key: 'sk-real-anthropic',
      ...overrides,
    };
  }

  it('should validate a simple valid config with both defaults', () => {
    const runtime = validateConfig({
      appRaw: validAppRaw,
      modelApiRaw: { profiles: [makeOpenaiProfile(), makeAnthropicProfile()] },
    });
    assert.strictEqual(runtime.app.port, 8787);
    assert.strictEqual(runtime.profiles.length, 2);
    assert.strictEqual(runtime.enabledProfilesByModelName.size, 2);
    assert.ok(runtime.enabledProfilesByModelName.has('openai-profile'));
    assert.ok(runtime.enabledProfilesByModelName.has('anthropic-profile'));
  });

  it('should reject duplicate profile model_names', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: validAppRaw,
        modelApiRaw: {
          profiles: [
            makeOpenaiProfile({ model_name: 'same-name' }),
            makeAnthropicProfile({ model_name: 'same-name' }),
          ],
        },
      });
    }, LocalError);
  });

  it('should reject default_openai_model not matching any enabled profile', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: { ...validAppRaw, default_openai_model: 'nonexistent' },
        modelApiRaw: { profiles: [makeOpenaiProfile(), makeAnthropicProfile()] },
      });
    }, LocalError);
  });

  it('should reject default_anthropic_model not matching any enabled profile', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: { ...validAppRaw, default_anthropic_model: 'nonexistent' },
        modelApiRaw: { profiles: [makeOpenaiProfile(), makeAnthropicProfile()] },
      });
    }, LocalError);
  });

  it('should reject default_openai_model pointing at anthropic profile', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: { ...validAppRaw, default_openai_model: 'anthropic-profile' },
        modelApiRaw: { profiles: [makeOpenaiProfile(), makeAnthropicProfile()] },
      });
    }, LocalError);
  });

  it('should reject default_anthropic_model pointing at openai profile', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: { ...validAppRaw, default_anthropic_model: 'openai-profile' },
        modelApiRaw: { profiles: [makeOpenaiProfile(), makeAnthropicProfile()] },
      });
    }, LocalError);
  });

  it('should reject default_model matching a disabled profile', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: validAppRaw,
        modelApiRaw: {
          profiles: [
            makeOpenaiProfile({ enabled: false }),
            makeAnthropicProfile(),
          ],
        },
      });
    }, LocalError);
  });

  it('should reject base_url containing /v1', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: validAppRaw,
        modelApiRaw: {
          profiles: [
            makeOpenaiProfile({ base_url: 'https://api.example.com/v1' }),
            makeAnthropicProfile(),
          ],
        },
      });
    }, LocalError);
  });

  it('should reject base_url containing /v1/ path', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: validAppRaw,
        modelApiRaw: {
          profiles: [
            makeOpenaiProfile({ base_url: 'https://api.example.com/v1/' }),
            makeAnthropicProfile(),
          ],
        },
      });
    }, LocalError);
  });

  it('should reject empty host (via schema)', () => {
    assert.throws(() => {
      validateConfig({
        appRaw: { ...validAppRaw, host: '' },
        modelApiRaw: { profiles: [makeOpenaiProfile(), makeAnthropicProfile()] },
      });
    }, LocalError);
  });

  it('should build enabledProfilesByModelName only from enabled profiles', () => {
    const runtime = validateConfig({
      appRaw: validAppRaw,
      modelApiRaw: {
        profiles: [
          makeOpenaiProfile(),
          makeAnthropicProfile(),
          makeOpenaiProfile({ model_name: 'extra', enabled: false }),
        ],
      },
    });
    assert.strictEqual(runtime.profiles.length, 3);
    assert.strictEqual(runtime.enabledProfilesByModelName.size, 2);
    assert.ok(runtime.enabledProfilesByModelName.has('openai-profile'));
    assert.ok(runtime.enabledProfilesByModelName.has('anthropic-profile'));
    assert.ok(!runtime.enabledProfilesByModelName.has('extra'));
  });
});
