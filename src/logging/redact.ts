import type { IncomingHttpHeaders } from 'node:http';

const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'cookie'];

/**
 * 脱敏请求头：将鉴权相关 header 值替换为 ***
 */
export function redactHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.includes(lowerKey)) {
      result[lowerKey] = '***';
    } else {
      result[lowerKey] = Array.isArray(value) ? value.join(', ') : String(value);
    }
  }
  return result;
}
