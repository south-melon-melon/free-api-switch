import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Transform } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LocalError } from '../core/errors.js';
import type { Logger } from '../logging/logger.js';

const HOP_BY_HOP_RESPONSE_HEADERS = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'proxy-authenticate',
  'trailer',
  'upgrade',
];

export interface ProxyInput {
  target: URL;
  method: string;
  headers: Record<string, string>;
  bodyText: string | null;
  rawReq: IncomingMessage;
  res: ServerResponse;
  timeoutMs: number;
  logger: Logger;
}

export interface ProxyResult {
  /** 上游响应体文本（仅生成类端点收集） */
  responseBody: string | null;
}

/**
 * 将请求代理转发到上游，同时收集响应体
 */
export function proxyToUpstream(input: ProxyInput): Promise<ProxyResult> {
  const { target, method, headers, bodyText, rawReq, res, timeoutMs, logger } = input;

  return new Promise<ProxyResult>((resolve, reject) => {
    const isHttps = target.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const options = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method,
      headers,
    };

    logger.debug('proxy request', { method, url: target.href });

    const upstreamReq = requestFn(options, (upstreamRes: IncomingMessage) => {
      // 过滤响应 hop-by-hop header
      const responseHeaders: Record<string, string | string[] | undefined> = {};
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (!HOP_BY_HOP_RESPONSE_HEADERS.includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      }

      res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);

      // 收集响应体 + 流式透传
      const chunks: Buffer[] = [];
      const collector = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk);
          this.push(chunk);
          callback();
        },
      });

      upstreamRes.pipe(collector).pipe(res);

      upstreamRes.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        resolve({ responseBody });
      });

      upstreamRes.on('error', (err) => {
        if (!res.headersSent) {
          reject(new LocalError('UPSTREAM_CONNECTION_FAILED', err.message));
        } else {
          res.end();
          resolve({ responseBody: null });
        }
      });
    });

    // 超时控制
    const timer = setTimeout(() => {
      upstreamReq.destroy();
      reject(new LocalError('UPSTREAM_TIMEOUT', 'Upstream request timed out'));
    }, timeoutMs);

    upstreamReq.on('timeout', () => {
      upstreamReq.destroy();
      timer && clearTimeout(timer);
      reject(new LocalError('UPSTREAM_TIMEOUT', 'Upstream request timed out'));
    });

    upstreamReq.on('error', (err) => {
      clearTimeout(timer);
      reject(new LocalError('UPSTREAM_CONNECTION_FAILED', err.message));
    });

    // 写入 body
    if (bodyText !== null) {
      const bodyBuffer = Buffer.from(bodyText, 'utf-8');
      upstreamReq.setHeader('content-length', bodyBuffer.length);
      upstreamReq.write(bodyBuffer);
      upstreamReq.end();
    } else {
      // 流式透传原始请求体
      rawReq.pipe(upstreamReq);
    }
  });
}
