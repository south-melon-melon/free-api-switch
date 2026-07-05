import { describe, it } from 'node:test';
import assert from 'node:assert';
import { appSchema, profileSchema, profilesSchema } from '../../src/config/schema.js';

describe('appSchema', () => {
  const validApp = {
    host: '127.0.0.1',
    port: 8787,
    log_level: 'info',
    request_timeout_ms: 30000,
    local_key: '123456',
    default_openai_model: 'openai-model',
    default_anthropic_model: 'anthropic-model',
  };

  it('should accept valid app config', () => {
    const result = appSchema.safeParse(validApp);
    assert.ok(result.success);
  });

  it('should accept alternative host values (localhost, 0.0.0.0)', () => {
    assert.ok(appSchema.safeParse({ ...validApp, host: 'localhost' }).success);
    assert.ok(appSchema.safeParse({ ...validApp, host: '0.0.0.0' }).success);
    assert.ok(appSchema.safeParse({ ...validApp, host: '192.168.1.100' }).success);
  });

  it('should reject empty host', () => {
    const result = appSchema.safeParse({ ...validApp, host: '' });
    assert.ok(!result.success);
  });

  it('should reject invalid port', () => {
    const result = appSchema.safeParse({ ...validApp, port: 0 });
    assert.ok(!result.success);
  });

  it('should reject invalid log_level', () => {
    const result = appSchema.safeParse({ ...validApp, log_level: 'verbose' });
    assert.ok(!result.success);
  });

  it('should reject missing local_key', () => {
    const { local_key: _, ...rest } = validApp;
    const result = appSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it('should reject empty local_key', () => {
    const result = appSchema.safeParse({ ...validApp, local_key: '' });
    assert.ok(!result.success);
  });

  it('should reject missing default_openai_model', () => {
    const { default_openai_model: _, ...rest } = validApp;
    const result = appSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it('should reject missing default_anthropic_model', () => {
    const { default_anthropic_model: _, ...rest } = validApp;
    const result = appSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it('should reject empty default_openai_model', () => {
    const result = appSchema.safeParse({ ...validApp, default_openai_model: '' });
    assert.ok(!result.success);
  });

  it('should reject empty default_anthropic_model', () => {
    const result = appSchema.safeParse({ ...validApp, default_anthropic_model: '' });
    assert.ok(!result.success);
  });

  it('should reject extra fields (strict)', () => {
    const result = appSchema.safeParse({ ...validApp, extra_field: true });
    assert.ok(!result.success);
  });
});

describe('profileSchema', () => {
  const validProfile = {
    model_name: 'test',
    model_id: 'test-upstream-id',
    enabled: true,
    type: 'openai_compatible' as const,
    base_url: 'https://api.example.com',
    api_key: 'sk-real-key',
  };

  it('should accept valid profile', () => {
    const result = profileSchema.safeParse(validProfile);
    assert.ok(result.success);
  });

  it('should default enabled to true', () => {
    const result = profileSchema.safeParse({
      model_name: 'test',
      model_id: 'test-upstream-id',
      type: 'openai_compatible',
      base_url: 'https://api.example.com',
      api_key: 'sk-real-key',
    });
    assert.ok(result.success);
    assert.strictEqual(result.data?.enabled, true);
  });

  it('should default defaults to {}', () => {
    const result = profileSchema.safeParse(validProfile);
    assert.ok(result.success);
    assert.deepStrictEqual(result.data?.defaults, {});
  });

  it('should accept anthropic_compatible type', () => {
    const result = profileSchema.safeParse({ ...validProfile, type: 'anthropic_compatible' });
    assert.ok(result.success);
  });

  it('should reject invalid type', () => {
    const result = profileSchema.safeParse({ ...validProfile, type: 'invalid_type' });
    assert.ok(!result.success);
  });

  it('should reject empty model_name', () => {
    const result = profileSchema.safeParse({ ...validProfile, model_name: '' });
    assert.ok(!result.success);
  });

  it('should reject empty model_id', () => {
    const result = profileSchema.safeParse({ ...validProfile, model_id: '' });
    assert.ok(!result.success);
  });

  it('should reject missing model_id', () => {
    const { model_id: _, ...rest } = validProfile;
    const result = profileSchema.safeParse(rest);
    assert.ok(!result.success);
  });

  it('should reject empty api_key', () => {
    const result = profileSchema.safeParse({ ...validProfile, api_key: '' });
    assert.ok(!result.success);
  });

  it('should reject invalid base_url', () => {
    const result = profileSchema.safeParse({ ...validProfile, base_url: 'not-a-url' });
    assert.ok(!result.success);
  });

  it('should accept max_output_tokens and max_context_tokens', () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      max_output_tokens: 8192,
      max_context_tokens: 65536,
    });
    assert.ok(result.success);
    assert.strictEqual(result.data?.max_output_tokens, 8192);
    assert.strictEqual(result.data?.max_context_tokens, 65536);
  });

  it('should accept thinking_level enum values', () => {
    for (const lvl of ['off', 'low', 'medium', 'high', 'xhigh'] as const) {
      const result = profileSchema.safeParse({
        ...validProfile,
        thinking_level: lvl,
      });
      assert.ok(result.success, `expected ${lvl} to be accepted`);
      assert.strictEqual(result.data?.thinking_level, lvl);
    }
  });

  it('should reject thinking_level as number', () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      thinking_level: 0.8,
    });
    assert.ok(!result.success);
  });

  it('should reject thinking_level as unknown string', () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      thinking_level: 'super',
    });
    assert.ok(!result.success);
  });
});

describe('profilesSchema', () => {
  it('should accept valid profiles array', () => {
    const result = profilesSchema.safeParse({
      profiles: [
        {
          model_name: 'test1',
          model_id: 'test1-upstream',
          type: 'openai_compatible',
          base_url: 'https://api.example.com',
          api_key: 'sk-real-1',
        },
        {
          model_name: 'test2',
          model_id: 'test2-upstream',
          enabled: false,
          type: 'anthropic_compatible',
          base_url: 'https://api.anthropic.com',
          api_key: 'sk-real-2',
        },
      ],
    });
    assert.ok(result.success);
  });

  it('should accept empty profiles array', () => {
    const result = profilesSchema.safeParse({ profiles: [] });
    assert.ok(result.success);
  });
});
