import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse, RequestListener } from 'node:http';
import { URL } from 'node:url';
import { RuntimeConfig, InterfaceType } from '../core/types.js';
import { LocalError, ERROR_HTTP_STATUS, ERROR_MESSAGES } from '../core/errors.js';
import { extractLocalKey, resolveProfile, resolveEndpointFamily } from '../core/profileResolver.js';
import { buildTargetUrl } from '../proxy/targetUrl.js';
import { buildUpstreamHeaders } from '../proxy/headerRewrite.js';
import { proxyToUpstream } from '../proxy/proxyRequest.js';
import { isGenerationEndpoint, applyDefaults } from '../core/defaults.js';
import { Logger } from '../logging/logger.js';

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 读取请求体（仅用于生成类端点）
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new LocalError('PAYLOAD_TOO_LARGE', 'Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', (err) => {
      reject(new LocalError('INTERNAL_ERROR', err.message));
    });
  });
}

/**
 * 写入本地错误响应
 */
function writeLocalError(res: ServerResponse, error: LocalError): void {
  if (res.headersSent) return;

  const statusCode = ERROR_HTTP_STATUS[error.code] ?? 500;
  const message = ERROR_MESSAGES[error.code] ?? 'Internal server error';

  const body = JSON.stringify({
    error: {
      code: error.code,
      message,
    },
  });

  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body, 'utf-8'),
  });
  res.end(body);
}

/**
 * 提取本次发送给上游 API 的完整消息数组
 * 包含 system prompt、软件插入的提示词、历史对话与本次用户输入
 */
function extractRequestMessages(bodyText: string): unknown {
  try {
    const body = JSON.parse(bodyText);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj['messages'])) return obj['messages'];
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * 从响应体中提取本次的助手消息（单轮记录）
 * 返回单个 assistant message 对象，包含完整的文本/思考/工具调用内容
 * 支持非流式 JSON 与 SSE 流式响应两种形式
 */
function extractAssistantMessage(
  responseBody: string,
  profileType: InterfaceType,
): unknown {
  // 尝试非流式 JSON
  const trimmed = responseBody.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const body = JSON.parse(responseBody);
      if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
        const obj = body as Record<string, unknown>;
        // OpenAI 兼容格式：choices[0].message
        if (Array.isArray(obj['choices']) && obj['choices'].length > 0) {
          const first = obj['choices'][0] as Record<string, unknown> | undefined;
          if (first && typeof first === 'object' && 'message' in first) {
            return first['message'];
          }
        }
        // Anthropic 兼容格式：{ role: 'assistant', content: [...] }
        if ('content' in obj) {
          return {
            role: typeof obj['role'] === 'string' ? obj['role'] : 'assistant',
            content: obj['content'],
          };
        }
      }
    } catch {
      // fall through to SSE parsing
    }
  }

  // 尝试 SSE 流式响应聚合
  if (trimmed.startsWith('data:') || trimmed.startsWith('event:')) {
    return aggregateSseResponse(responseBody, profileType);
  }

  return null;
}

/**
 * SSE 事件的一个 data 数据行
 */
interface SseEvent {
  event?: string;
  data: string;
}

function parseSseStream(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  // 事件之间以空行分隔
  const blocks = body.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventName: string | undefined;
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
  }
  return events;
}

/**
 * 聚合 SSE 流为单个 assistant message
 */
function aggregateSseResponse(
  body: string,
  profileType: InterfaceType,
): unknown {
  const events = parseSseStream(body);
  if (events.length === 0) return null;

  if (profileType === 'openai_compatible') {
    // 聚合 choices[0] 的 delta 为单个 message
    const message: {
      role: string;
      content: string;
      reasoning_content?: string;
      tool_calls?: unknown[];
    } = { role: 'assistant', content: '' };
    let finishReason: unknown = undefined;

    for (const ev of events) {
      if (ev.data === '[DONE]') continue;
      let payload: unknown;
      try {
        payload = JSON.parse(ev.data);
      } catch {
        continue;
      }
      if (typeof payload !== 'object' || payload === null) continue;
      const p = payload as Record<string, unknown>;
      const rawChoices = p['choices'];
      if (!Array.isArray(rawChoices) || rawChoices.length === 0) continue;
      const c = rawChoices[0];
      if (typeof c !== 'object' || c === null) continue;
      const cObj = c as Record<string, unknown>;
      const delta = cObj['delta'];
      if (typeof delta === 'object' && delta !== null) {
        const d = delta as Record<string, unknown>;
        if (typeof d['role'] === 'string') message.role = d['role'] as string;
        if (typeof d['content'] === 'string') message.content += d['content'] as string;
        if (typeof d['reasoning_content'] === 'string') {
          message.reasoning_content =
            (message.reasoning_content ?? '') + (d['reasoning_content'] as string);
        }
        if (Array.isArray(d['tool_calls'])) {
          message.tool_calls = [...(message.tool_calls ?? []), ...(d['tool_calls'] as unknown[])];
        }
      }
      if ('finish_reason' in cObj && cObj['finish_reason'] !== null) {
        finishReason = cObj['finish_reason'];
      }
    }

    return finishReason !== undefined ? { ...message, finish_reason: finishReason } : message;
  }

  // anthropic_compatible
  // 聚合 content_block_start + content_block_delta 为单个 assistant message
  const contentBlocks: Record<number, Record<string, unknown>> = {};
  let stopReason: unknown = undefined;
  for (const ev of events) {
    let payload: unknown;
    try {
      payload = JSON.parse(ev.data);
    } catch {
      continue;
    }
    if (typeof payload !== 'object' || payload === null) continue;
    const p = payload as Record<string, unknown>;
    const type = p['type'];
    const idx = typeof p['index'] === 'number' ? (p['index'] as number) : 0;

    if (type === 'content_block_start') {
      const block = p['content_block'];
      if (typeof block === 'object' && block !== null) {
        contentBlocks[idx] = { ...(block as Record<string, unknown>) };
      }
    } else if (type === 'content_block_delta') {
      const delta = p['delta'];
      if (typeof delta === 'object' && delta !== null) {
        const d = delta as Record<string, unknown>;
        if (!contentBlocks[idx]) contentBlocks[idx] = {};
        const dType = d['type'];
        if (dType === 'text_delta' && typeof d['text'] === 'string') {
          contentBlocks[idx]['text'] =
            (typeof contentBlocks[idx]['text'] === 'string' ? contentBlocks[idx]['text'] : '') +
            (d['text'] as string);
        } else if (dType === 'input_json_delta' && typeof d['partial_json'] === 'string') {
          contentBlocks[idx]['partial_json'] =
            (typeof contentBlocks[idx]['partial_json'] === 'string'
              ? contentBlocks[idx]['partial_json']
              : '') + (d['partial_json'] as string);
        } else if (dType === 'thinking_delta' && typeof d['thinking'] === 'string') {
          contentBlocks[idx]['thinking'] =
            (typeof contentBlocks[idx]['thinking'] === 'string'
              ? contentBlocks[idx]['thinking']
              : '') + (d['thinking'] as string);
        }
      }
    } else if (type === 'message_delta') {
      const delta = p['delta'];
      if (typeof delta === 'object' && delta !== null) {
        const d = delta as Record<string, unknown>;
        if ('stop_reason' in d && d['stop_reason'] !== null) {
          stopReason = d['stop_reason'];
        }
      }
    }
  }

  const content = Object.keys(contentBlocks)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((i) => contentBlocks[i]);
  if (content.length === 0) return null;

  const message: Record<string, unknown> = { role: 'assistant', content };
  if (stopReason !== undefined) message['stop_reason'] = stopReason;
  return message;
}

/**
 * 将本次调用的请求与响应消息写入独立日志文件
 * request_messages 为发送给上游 API 的完整 messages 数组
 * response_message 为上游返回的助手消息
 */
function writeMessageLog(
  logDir: string,
  requestMessages: unknown,
  responseMessage: unknown,
): void {
  try {
    const messagesDir = resolve(logDir, 'messages');
    mkdirSync(messagesDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = resolve(messagesDir, `${ts}.json`);

    const entry = {
      ts: new Date().toISOString(),
      request_messages: requestMessages,
      response_message: responseMessage,
    };

    writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  } catch {
    // 消息日志写入失败不阻塞主流程
  }
}

export interface AccessLog {
  ts: string;
  profile: string;
  type: InterfaceType;
  path: string;
  base_url: string;
  status: number;
  duration_ms: number;
  applied_defaults: boolean;
}

export function createRequestHandler(
  runtime: RuntimeConfig,
  logger: Logger,
  logDir: string,
): RequestListener {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const start = performance.now();
    let profileName = '-';
    let profileType: InterfaceType = 'openai_compatible';
    let baseUrl = '-';
    let reqPath = '-';
    let statusCode = 500;
    let appliedDefaults = false;
    let requestMessages: unknown = undefined;
    let responseMessage: unknown = undefined;

    try {
      // 解析请求路径
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      reqPath = url.pathname;

      // 1. 解析 local_key
      const localKey = extractLocalKey(req.headers);

      // 2. 判断端点家族并匹配 profile
      const isGen = isGenerationEndpoint(url.pathname);
      const family = resolveEndpointFamily(url.pathname);
      if (isGen && family === null) {
        throw new LocalError('UNSUPPORTED_ENDPOINT', `Unsupported generation endpoint: ${url.pathname}`);
      }
      // 非生成类端点仍需鉴权，此处按 openai 家族兜底以复用鉴权和默认路由
      const profile = resolveProfile(runtime, localKey, family ?? 'openai');
      profileName = profile.model_name;
      profileType = profile.type;
      baseUrl = profile.base_url;

      // 3. 构建目标 URL
      const target = buildTargetUrl(profile.base_url, req.url ?? '/');

      let bodyText: string | null = null;

      // 4. 读取并可能改写 body
      if (isGen) {
        const rawBody = await readBody(req);
        const result = applyDefaults(rawBody, profile);
        bodyText = result.bodyText;
        appliedDefaults = result.appliedDefaults;

        // 提取发送给上游 API 的完整 messages 数组（含 system / 软件插入的提示词 / 历史 / 本次输入）
        requestMessages = extractRequestMessages(rawBody);
      }

      // 6. 构建上游 headers
      const upstreamHeaders = buildUpstreamHeaders(req.headers, profile);

      // 7. 代理转发
      const proxyResult = await proxyToUpstream({
        target,
        method: req.method ?? 'GET',
        headers: upstreamHeaders,
        bodyText,
        rawReq: req,
        res,
        timeoutMs: runtime.app.request_timeout_ms,
        logger,
      });

      statusCode = res.statusCode;

      // 8. 提取本次的助手响应消息（单轮）
      if (isGen && proxyResult.responseBody) {
        responseMessage = extractAssistantMessage(proxyResult.responseBody, profile.type);
      }
    } catch (err: unknown) {
      if (err instanceof LocalError) {
        writeLocalError(res, err);
        statusCode = ERROR_HTTP_STATUS[err.code] ?? 500;
      } else {
        const internalError = new LocalError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Unknown error',
        );
        writeLocalError(res, internalError);
        statusCode = 500;
      }
    } finally {
      const durationMs = Math.round(performance.now() - start);
      const accessLog: AccessLog = {
        ts: new Date().toISOString(),
        profile: profileName,
        type: profileType,
        path: reqPath,
        base_url: baseUrl,
        status: statusCode,
        duration_ms: durationMs,
        applied_defaults: appliedDefaults,
      };

      logger.info('access', accessLog as unknown as Record<string, unknown>);

      // 消息日志写入独立文件（完整请求 messages + 单条响应 message）
      if (requestMessages || responseMessage) {
        writeMessageLog(logDir, requestMessages, responseMessage);
      }
    }
  };
}
