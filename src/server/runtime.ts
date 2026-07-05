import type { Server } from 'node:http';
import { loadRawConfig } from '../config/loadConfig.js';
import { validateConfig } from '../config/validateConfig.js';
import { createLogger, type Logger } from '../logging/logger.js';
import { resolveCfgDir, resolveLogDir } from '../paths.js';
import type { RuntimeConfig } from '../core/types.js';
import { startServer } from './app.js';

export interface StartRuntimeOptions {
  /** cfgs 目录路径，缺省使用 process.cwd()/cfgs */
  cfgDir?: string;
  /** logs 目录路径，缺省使用 process.cwd()/logs */
  logDir?: string;
}

export interface RunningRuntime {
  runtime: RuntimeConfig;
  logger: Logger;
  cfgDir: string;
  logDir: string;
  server: Server;
  /** 优雅关闭 HTTP 服务，释放监听端口 */
  close(): Promise<void>;
}

/**
 * 共享的运行时启动入口。
 * CLI (`fas start`) 与桌面托盘入口都通过此函数启动本机代理服务。
 */
export async function startRuntime(options: StartRuntimeOptions = {}): Promise<RunningRuntime> {
  const cfgDir = options.cfgDir ?? resolveCfgDir();
  const logDir = options.logDir ?? resolveLogDir();

  const raw = loadRawConfig(cfgDir);
  const runtime = validateConfig(raw);
  const logger = createLogger(runtime.app.log_level, logDir);

  const server = await startServer(runtime, logger, logDir);

  return {
    runtime,
    logger,
    cfgDir,
    logDir,
    server,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => {
          if (err) rejectClose(err);
          else resolveClose();
        });
      }),
  };
}
