import type { IncomingHttpHeaders } from 'node:http';
import { ProfileConfig } from '../core/types.js';

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

const LOCAL_AUTH_HEADERS = [
  'authorization',
  'x-api-key',
];

const STRIP_HEADERS = [
  ...LOCAL_AUTH_HEADERS,
  ...HOP_BY_HOP_HEADERS,
  'host',
  'content-length',
];

/**
 * 构建上游请求头：
 * - 复制 incoming headers
 * - 删除本地鉴权字段
 * - 删除 hop-by-hop / 连接类 header
 * - 删除 host / content-length
 * - 注入上游鉴权 header
 */
export function buildUpstreamHeaders(
  incoming: IncomingHttpHeaders,
  profile: ProfileConfig,
): Record<string, string> {
  const headers: Record<string, string> = {};

  // 复制 incoming headers
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }

  // 删除不应透传的 header
  for (const key of STRIP_HEADERS) {
    delete headers[key];
  }

  // 注入上游鉴权
  if (profile.type === 'openai_compatible') {
    headers['authorization'] = `Bearer ${profile.api_key}`;
  } else {
    headers['x-api-key'] = profile.api_key;
  }

  return headers;
}
