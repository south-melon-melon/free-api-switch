export const INTERFACE_TYPES = ['openai_compatible', 'anthropic_compatible'] as const;
export type InterfaceType = (typeof INTERFACE_TYPES)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * 抽象推理强度等级到上游真实字段的单一数据源（Single Source of Truth）。
 *
 * 新增/调整一个等级只需修改本对象，其它模块（core/defaults.ts、
 * config/schema.ts、tray/settingsAssets.ts UI 下拉框）会自动使用新等级。
 *
 * 每一项定义：
 *   - openai_effort：openai_compatible 协议下 `reasoning_effort` 的实际值。
 *   - anthropic_thinking：anthropic_compatible 协议下 `thinking` 对象的实际值。
 *
 * 关于 xhigh：不是 OpenAI 官方值，落回 "high"；Anthropic 侧提高 budget_tokens。
 * 关于 off：OpenAI 走 "minimal"（当前接口最接近关闭推理的档位）；
 *   Anthropic 走 `{ type: "disabled" }`。
 */
export const THINKING_LEVEL_MAP = {
  off:    { openai_effort: 'minimal', anthropic_thinking: { type: 'disabled' } as const },
  low:    { openai_effort: 'low',     anthropic_thinking: { type: 'enabled', budget_tokens: 1024  } as const },
  medium: { openai_effort: 'medium',  anthropic_thinking: { type: 'enabled', budget_tokens: 4096  } as const },
  high:   { openai_effort: 'high',    anthropic_thinking: { type: 'enabled', budget_tokens: 12000 } as const },
  xhigh:  { openai_effort: 'high',    anthropic_thinking: { type: 'enabled', budget_tokens: 24000 } as const },
} as const;

/** 有序的抽象等级列表（供 schema enum 与 UI 下拉框使用），从 MAP 派生 */
export type ThinkingLevel = keyof typeof THINKING_LEVEL_MAP;
export const THINKING_LEVELS = Object.keys(THINKING_LEVEL_MAP) as [ThinkingLevel, ...ThinkingLevel[]];

/** 上游协议家族标识（由请求路径决定） */
export const ENDPOINT_FAMILIES = ['openai', 'anthropic'] as const;
export type EndpointFamily = (typeof ENDPOINT_FAMILIES)[number];

export interface AppConfig {
  /** 监听地址，例如 127.0.0.1 / localhost / 0.0.0.0 / 局域网 IP */
  host: string;
  port: number;
  log_level: LogLevel;
  request_timeout_ms: number;
  /** 本地 token，工具 API Key 字段填写此值 */
  local_key: string;
  /** OpenAI 兼容端点使用的默认 profile.model_name */
  default_openai_model: string;
  /** Anthropic 兼容端点使用的默认 profile.model_name */
  default_anthropic_model: string;
}

export interface ProfileConfig {
  /** 本地标识，用于 app.default_*_model 匹配（不会发送到上游） */
  model_name: string;
  /** 真实发送到上游 API 的模型名 */
  model_id: string;
  enabled: boolean;
  type: InterfaceType;
  base_url: string;
  api_key: string;
  /** 最大输出 token，请求缺 max_tokens 时补全 */
  max_output_tokens?: number;
  /** 最大上下文长度 token，请求缺 max_context_tokens 时补全 */
  max_context_tokens?: number;
  /** 默认思考等级（抽象级别），请求缺 thinking_level 时按 profile.type 翻译并注入 */
  thinking_level?: ThinkingLevel;
  defaults: Record<string, unknown>;
}

export interface RuntimeConfig {
  app: AppConfig;
  profiles: ProfileConfig[];
  /** 仅包含 enabled === true 的 profile，key 为 profile.model_name */
  enabledProfilesByModelName: Map<string, ProfileConfig>;
}
