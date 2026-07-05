import { mkdirSync } from 'node:fs';
import { createWriteStream, WriteStream } from 'node:fs';
import { join } from 'node:path';
import type { LogLevel } from '../core/types.js';

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function dailyLogPath(logDir: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(logDir, `fas-${today}.log`);
}

function openLogStream(logDir: string): WriteStream {
  mkdirSync(logDir, { recursive: true });
  return createWriteStream(dailyLogPath(logDir), { flags: 'a' });
}

export function createLogger(level: LogLevel, logDir?: string): Logger {
  const minLevel = LOG_LEVEL_ORDER[level];

  // 文件流，每天切换
  let logStream: WriteStream | null = null;
  let currentLogPath = '';

  if (logDir) {
    logStream = openLogStream(logDir);
    currentLogPath = dailyLogPath(logDir);
  }

  function shouldLog(levelName: LogLevel): boolean {
    return LOG_LEVEL_ORDER[levelName] >= minLevel;
  }

  function writeLog(
    levelName: LogLevel,
    msg: string,
    meta?: Record<string, unknown>,
  ): void {
    if (!shouldLog(levelName)) return;

    const ts = new Date().toISOString();
    const entry: Record<string, unknown> = {
      ts,
      level: levelName,
      msg,
    };

    if (meta && Object.keys(meta).length > 0) {
      entry.meta = meta;
    }

    const output = JSON.stringify(entry);

    // 控制台输出
    if (levelName === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }

    // 文件输出（日切滚动）
    if (logStream && logDir) {
      const todayPath = dailyLogPath(logDir);
      if (todayPath !== currentLogPath) {
        logStream.end();
        logStream = openLogStream(logDir);
        currentLogPath = todayPath;
      }
      logStream.write(output + '\n');
    }
  }

  return {
    debug: (msg, meta) => writeLog('debug', msg, meta),
    info: (msg, meta) => writeLog('info', msg, meta),
    warn: (msg, meta) => writeLog('warn', msg, meta),
    error: (msg, meta) => writeLog('error', msg, meta),
  };
}
