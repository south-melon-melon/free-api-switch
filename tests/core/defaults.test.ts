import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isGenerationEndpoint, applyDefaults } from '../../src/core/defaults.js';
import { ProfileConfig } from '../../src/core/types.js';
import { LocalError } from '../../src/core/errors.js';

describe('isGenerationEndpoint', () => {
  it('should return true for /v1/chat/completions', () => {
    assert.ok(isGenerationEndpoint('/v1/chat/completions'));
  });

  it('should return true for /v1/messages', () => {
    assert.ok(isGenerationEndpoint('/v1/messages'));
  });

  it('should return false for other paths', () => {
    assert.ok(!isGenerationEndpoint('/v1/models'));
    assert.ok(!isGenerationEndpoint('/'));
    assert.ok(!isGenerationEndpoint('/v1/chat/completions/extra'));
  });
});

describe('applyDefaults', () => {
  function makeProfile(overrides: Partial<ProfileConfig> = {}): ProfileConfig {
    return {
      model_name: 'local-name',
      model_id: 'upstream-model-id',
      enabled: true,
      type: 'openai_compatible',
      base_url: 'https://api.example.com',
      api_key: 'sk-real',
      defaults: { max_tokens: 4096 },
      ...overrides,
    };
  }

  it('should fill missing model with profile.model_id', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      makeProfile(),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.model, 'upstream-model-id');
    assert.ok(result.appliedDefaults);
  });

  it('should overwrite existing model with profile.model_id', () => {
    const result = applyDefaults(
      JSON.stringify({ model: 'client-supplied-model', messages: [] }),
      makeProfile(),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.model, 'upstream-model-id');
    assert.ok(result.appliedDefaults);
  });

  it('should fill missing defaults fields', () => {
    const result = applyDefaults(
      JSON.stringify({ model: 'm' }),
      makeProfile(),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.max_tokens, 4096);
    assert.ok(result.appliedDefaults);
  });

  it('should not overwrite existing defaults fields', () => {
    const result = applyDefaults(
      JSON.stringify({ model: 'm', max_tokens: 100 }),
      makeProfile(),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.max_tokens, 100);
  });

  it('should overwrite model even when all fields present', () => {
    const result = applyDefaults(
      JSON.stringify({ model: 'm', max_tokens: 100 }),
      makeProfile(),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.model, 'upstream-model-id');
    assert.strictEqual(body.max_tokens, 100);
    assert.ok(result.appliedDefaults);
  });

  it('should throw REQUEST_BODY_INVALID_JSON for empty body', () => {
    assert.throws(() => applyDefaults('', makeProfile()), (err: unknown) => {
      return err instanceof LocalError && err.code === 'REQUEST_BODY_INVALID_JSON';
    });
  });

  it('should throw REQUEST_BODY_INVALID_JSON for non-object body', () => {
    assert.throws(() => applyDefaults('"just a string"', makeProfile()), (err: unknown) => {
      return err instanceof LocalError && err.code === 'REQUEST_BODY_INVALID_JSON';
    });
  });

  it('should throw REQUEST_BODY_INVALID_JSON for array body', () => {
    assert.throws(() => applyDefaults('[1, 2, 3]', makeProfile()), (err: unknown) => {
      return err instanceof LocalError && err.code === 'REQUEST_BODY_INVALID_JSON';
    });
  });

  it('should throw REQUEST_BODY_INVALID_JSON for null body', () => {
    assert.throws(() => applyDefaults('null', makeProfile()), (err: unknown) => {
      return err instanceof LocalError && err.code === 'REQUEST_BODY_INVALID_JSON';
    });
  });

  it('should throw REQUEST_BODY_INVALID_JSON for invalid JSON', () => {
    assert.throws(() => applyDefaults('not json', makeProfile()), (err: unknown) => {
      return err instanceof LocalError && err.code === 'REQUEST_BODY_INVALID_JSON';
    });
  });

  it('should handle empty defaults in profile', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.model, 'upstream-model-id');
    assert.ok(result.appliedDefaults);
  });

  // max_output_tokens tests
  it('should fill max_tokens from max_output_tokens', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ max_output_tokens: 8192, defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.max_tokens, 8192);
    assert.ok(result.appliedDefaults);
  });

  it('should prefer max_output_tokens over defaults.max_tokens', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ max_output_tokens: 8192, defaults: { max_tokens: 1024 } }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.max_tokens, 8192);
    assert.ok(result.appliedDefaults);
  });

  it('should not overwrite existing max_tokens in body', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [], max_tokens: 512 }),
      makeProfile({ max_output_tokens: 8192 }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.max_tokens, 512);
  });

  it('should fallback to defaults.max_tokens when max_output_tokens not set', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ max_output_tokens: undefined, defaults: { max_tokens: 2048 } }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.max_tokens, 2048);
    assert.ok(result.appliedDefaults);
  });

  // thinking_level tests (抽象等级 → 上游真实字段)
  it('openai_compatible: profile.thinking_level=high 注入 reasoning_effort=high', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ thinking_level: 'high', defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.reasoning_effort, 'high');
    assert.ok(!('thinking_level' in body));
    assert.ok(result.appliedDefaults);
  });

  it('openai_compatible: xhigh 映射到 reasoning_effort=high', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ thinking_level: 'xhigh', defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.reasoning_effort, 'high');
  });

  it('anthropic_compatible: profile.thinking_level=high 注入 thinking budget', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ type: 'anthropic_compatible', thinking_level: 'high', defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.deepStrictEqual(body.thinking, { type: 'enabled', budget_tokens: 12000 });
    assert.ok(!('thinking_level' in body));
    assert.ok(result.appliedDefaults);
  });

  it('anthropic_compatible: xhigh 使用更大 budget_tokens', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ type: 'anthropic_compatible', thinking_level: 'xhigh', defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.deepStrictEqual(body.thinking, { type: 'enabled', budget_tokens: 24000 });
  });

  it('openai_compatible: off 映射到 reasoning_effort=minimal', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ thinking_level: 'off', defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.reasoning_effort, 'minimal');
    assert.ok(!('thinking_level' in body));
  });

  it('anthropic_compatible: off 注入 thinking type=disabled', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ type: 'anthropic_compatible', thinking_level: 'off', defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.deepStrictEqual(body.thinking, { type: 'disabled' });
    assert.ok(!('thinking_level' in body));
  });

  it('客户端传入 body.thinking_level=medium 时以客户端为准', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [], thinking_level: 'medium' }),
      makeProfile({ thinking_level: 'high' }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.reasoning_effort, 'medium');
    assert.ok(!('thinking_level' in body));
  });

  it('openai_compatible: 客户端已传上游 reasoning_effort 则完全透传', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [], reasoning_effort: 'low' }),
      makeProfile({ thinking_level: 'high' }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.reasoning_effort, 'low');
  });

  it('openai_compatible: 客户端已传 reasoning 对象则完全透传', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [], reasoning: { effort: 'low' } }),
      makeProfile({ thinking_level: 'high' }),
    );
    const body = JSON.parse(result.bodyText);
    assert.ok(!('reasoning_effort' in body));
    assert.deepStrictEqual(body.reasoning, { effort: 'low' });
  });

  it('anthropic_compatible: 客户端已传 thinking 对象则完全透传', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [], thinking: { type: 'enabled', budget_tokens: 500 } }),
      makeProfile({ type: 'anthropic_compatible', thinking_level: 'high' }),
    );
    const body = JSON.parse(result.bodyText);
    assert.deepStrictEqual(body.thinking, { type: 'enabled', budget_tokens: 500 });
  });

  it('profile 与 body 都没有 thinking 时不注入', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [] }),
      makeProfile({ thinking_level: undefined, defaults: {} }),
    );
    const body = JSON.parse(result.bodyText);
    assert.ok(!('reasoning_effort' in body));
    assert.ok(!('thinking' in body));
    assert.ok(!('thinking_level' in body));
  });

  it('无效 body.thinking_level 会被忽略并回退到 profile', () => {
    const result = applyDefaults(
      JSON.stringify({ messages: [], thinking_level: 'ultra' }),
      makeProfile({ thinking_level: 'low' }),
    );
    const body = JSON.parse(result.bodyText);
    assert.strictEqual(body.reasoning_effort, 'low');
    assert.ok(!('thinking_level' in body));
  });
});
