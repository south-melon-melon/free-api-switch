import type { IncomingHttpHeaders } from 'node:http';
import { RuntimeConfig, ProfileConfig, EndpointFamily } from './types.js';
import { LocalError } from './errors.js';

/**
 * 从请求头中提取 local_key
 * 优先级：Authorization: Bearer <token> → x-api-key
 */
export function extractLocalKey(headers: IncomingHttpHeaders): string | undefined {
  const authHeader = headers['authorization'];
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }

  const apiKeyHeader = headers['x-api-key'];
  if (apiKeyHeader) {
    const key = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    const trimmed = key.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}

/**
 * 根据请求路径判定端点所属的协议家族。
 * - `/v1/chat/completions` → openai
 * - `/v1/messages` → anthropic
 * - 其他生成类端点未定义，返回 null
 */
export function resolveEndpointFamily(pathname: string): EndpointFamily | null {
  if (pathname === '/v1/chat/completions') return 'openai';
  if (pathname === '/v1/messages') return 'anthropic';
  return null;
}

/**
 * 校验 localKey 并按照端点家族选择默认 profile
 */
export function resolveProfile(
  runtime: RuntimeConfig,
  localKey: string | undefined,
  family: EndpointFamily,
): ProfileConfig {
  if (!localKey) {
    throw new LocalError('LOCAL_KEY_MISSING', 'Missing local API key');
  }

  if (localKey !== runtime.app.local_key) {
    throw new LocalError('INVALID_LOCAL_KEY', 'Invalid local API key');
  }

  const modelName =
    family === 'openai' ? runtime.app.default_openai_model : runtime.app.default_anthropic_model;
  const profile = runtime.enabledProfilesByModelName.get(modelName);
  if (!profile) {
    throw new LocalError(
      'CONFIG_VALIDATION_FAILED',
      `Default profile for ${family} endpoint not found: ${modelName}`,
    );
  }

  return profile;
}
