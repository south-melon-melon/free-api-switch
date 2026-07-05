export type ErrorCode =
  | 'CONFIG_FILE_NOT_FOUND'
  | 'CONFIG_JSON_INVALID'
  | 'CONFIG_VALIDATION_FAILED'
  | 'LOCAL_KEY_MISSING'
  | 'INVALID_LOCAL_KEY'
  | 'PROFILE_DISABLED'
  | 'UNSUPPORTED_ENDPOINT'
  | 'REQUEST_BODY_INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UPSTREAM_CONNECTION_FAILED'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL_ERROR';

export class LocalError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = 'LocalError';
  }
}

/** HTTP 状态码映射 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  CONFIG_FILE_NOT_FOUND: 500,
  CONFIG_JSON_INVALID: 500,
  CONFIG_VALIDATION_FAILED: 500,
  LOCAL_KEY_MISSING: 401,
  INVALID_LOCAL_KEY: 401,
  PROFILE_DISABLED: 401,
  UNSUPPORTED_ENDPOINT: 404,
  REQUEST_BODY_INVALID_JSON: 400,
  PAYLOAD_TOO_LARGE: 413,
  UPSTREAM_CONNECTION_FAILED: 502,
  UPSTREAM_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

/** 本地错误对应的用户可见消息 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  CONFIG_FILE_NOT_FOUND: 'Configuration file not found',
  CONFIG_JSON_INVALID: 'Configuration file contains invalid JSON',
  CONFIG_VALIDATION_FAILED: 'Configuration validation failed',
  LOCAL_KEY_MISSING: 'Missing local API key',
  INVALID_LOCAL_KEY: 'Invalid local API key',
  PROFILE_DISABLED: 'Profile is disabled',
  UNSUPPORTED_ENDPOINT: 'Unsupported endpoint',
  REQUEST_BODY_INVALID_JSON: 'Request body is not valid JSON',
  PAYLOAD_TOO_LARGE: 'Request body too large',
  UPSTREAM_CONNECTION_FAILED: 'Failed to connect to upstream server',
  UPSTREAM_TIMEOUT: 'Upstream request timed out',
  INTERNAL_ERROR: 'Internal server error',
};
