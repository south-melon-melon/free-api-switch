import { ProfileConfig, THINKING_LEVEL_MAP, THINKING_LEVELS, ThinkingLevel } from './types.js';
import { LocalError } from './errors.js';

const GENERATION_ENDPOINTS = ['/v1/chat/completions', '/v1/messages'] as const;

/**
 * 判定请求路径是否属于生成类端点
 */
export function isGenerationEndpoint(pathname: string): boolean {
  return (GENERATION_ENDPOINTS as readonly string[]).includes(pathname);
}

export interface ApplyDefaultsResult {
  bodyText: string;
  appliedDefaults: boolean;
}

/** 用于快速校验客户端传入的 thinking_level 是否合法 */
const THINKING_LEVEL_SET: ReadonlySet<string> = new Set(THINKING_LEVELS);

/**
 * 判断请求体是否已带上游真实的推理强度字段。
 * 如果客户端已经明确表达，则完全透传，不再由本代理注入。
 */
function bodyAlreadyHasUpstreamThinking(
  bodyObj: Record<string, unknown>,
  profileType: ProfileConfig['type'],
): boolean {
  if (profileType === 'openai_compatible') {
    // OpenAI Responses API 使用 reasoning.effort；Chat Completions 顶层 reasoning_effort
    if ('reasoning_effort' in bodyObj) return true;
    const reasoning = bodyObj['reasoning'];
    if (typeof reasoning === 'object' && reasoning !== null) return true;
    return false;
  }
  // anthropic_compatible
  return 'thinking' in bodyObj;
}

/**
 * 把抽象 thinking level 翻译成上游真实字段，写入 bodyObj。
 * 已存在同名字段时不覆盖（尊重客户端已表达意图）。
 * 翻译规则统一来源于 THINKING_LEVEL_MAP（见 core/types.ts）。
 */
function injectThinking(
  bodyObj: Record<string, unknown>,
  level: ThinkingLevel,
  profileType: ProfileConfig['type'],
): boolean {
  const mapping = THINKING_LEVEL_MAP[level];
  if (profileType === 'openai_compatible') {
    if (!('reasoning_effort' in bodyObj)) {
      bodyObj['reasoning_effort'] = mapping.openai_effort;
      return true;
    }
    return false;
  }
  // anthropic_compatible
  if (!('thinking' in bodyObj)) {
    // 使用 { ...obj } 避免共享 readonly 引用
    bodyObj['thinking'] = { ...mapping.anthropic_thinking };
    return true;
  }
  return false;
}

/**
 * 从 body 中提取客户端传入的抽象 thinking_level（本项目自定义字段）。
 * 合法值来自 THINKING_LEVELS；不合法值一律忽略。
 */
function extractClientThinkingLevel(bodyObj: Record<string, unknown>): ThinkingLevel | null {
  const raw = bodyObj['thinking_level'];
  if (typeof raw === 'string' && THINKING_LEVEL_SET.has(raw)) return raw as ThinkingLevel;
  return null;
}

/**
 * 对生成类端点的请求体执行缺省参数补全。
 * `body.model` 始终被覆盖为 profile.model_id（真实上游模型名）。
 *
 * thinking_level 处理规则：
 *   1. 若客户端 body 里已带上游真实字段（openai 的 reasoning_effort / reasoning；
 *      anthropic 的 thinking），完全透传，不做任何处理。
 *   2. 否则按以下优先级取抽象等级：body.thinking_level > profile.thinking_level。
 *      取到后按 profile.type 翻译为上游真实字段并注入 body。
 *   3. body.thinking_level 是本项目自定义字段，注入后从 body 中剥离，避免上游看到未知字段。
 */
export function applyDefaults(
  bodyText: string,
  profile: ProfileConfig,
): ApplyDefaultsResult {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new LocalError('REQUEST_BODY_INVALID_JSON', 'Request body is not valid JSON');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new LocalError('REQUEST_BODY_INVALID_JSON', 'Request body is not valid JSON');
  }

  const bodyObj = body as Record<string, unknown>;
  let appliedDefaults = false;

  // 始终用 profile.model_id 覆盖客户端传来的 model
  if (bodyObj['model'] !== profile.model_id) {
    bodyObj['model'] = profile.model_id;
    appliedDefaults = true;
  }

  // 补 max_tokens（优先用 max_output_tokens，其次用 defaults 中的 max_tokens）
  if (!('max_tokens' in bodyObj)) {
    if (profile.max_output_tokens !== undefined) {
      bodyObj['max_tokens'] = profile.max_output_tokens;
      appliedDefaults = true;
    } else if ('max_tokens' in profile.defaults) {
      bodyObj['max_tokens'] = profile.defaults['max_tokens'];
      appliedDefaults = true;
    }
  }

  // 补 max_context_tokens（优先用 profile.max_context_tokens，其次用 defaults 中的 max_context_tokens）
  if (!('max_context_tokens' in bodyObj)) {
    if (profile.max_context_tokens !== undefined) {
      bodyObj['max_context_tokens'] = profile.max_context_tokens;
      appliedDefaults = true;
    } else if ('max_context_tokens' in profile.defaults) {
      bodyObj['max_context_tokens'] = profile.defaults['max_context_tokens'];
      appliedDefaults = true;
    }
  }

  // 处理 thinking：客户端优先，其次是 profile 抽象等级
  // 只要客户端已经带了上游真实字段就完全透传（也不注入 profile 级别）
  if (!bodyAlreadyHasUpstreamThinking(bodyObj, profile.type)) {
    const clientLevel = extractClientThinkingLevel(bodyObj);
    const level: ThinkingLevel | null = clientLevel ?? profile.thinking_level ?? null;
    if (level !== null) {
      if (injectThinking(bodyObj, level, profile.type)) {
        appliedDefaults = true;
      }
    }
  }
  // 抽象字段是本代理专用，无论是否注入都要从 body 中剥离，避免上游收到未知字段
  if ('thinking_level' in bodyObj) {
    delete bodyObj['thinking_level'];
  }

  // 补 defaults 中缺失的顶层字段（跳过已由 profile 专用字段处理的 key，也跳过 thinking_level）
  const profileOverrideKeys = new Set<string>(['thinking_level']);
  if (profile.max_output_tokens !== undefined) profileOverrideKeys.add('max_tokens');
  if (profile.max_context_tokens !== undefined) profileOverrideKeys.add('max_context_tokens');
  for (const key of Object.keys(profile.defaults)) {
    if (profileOverrideKeys.has(key)) continue;
    if (!(key in bodyObj)) {
      bodyObj[key] = profile.defaults[key];
      appliedDefaults = true;
    }
  }

  return {
    bodyText: JSON.stringify(bodyObj),
    appliedDefaults,
  };
}
