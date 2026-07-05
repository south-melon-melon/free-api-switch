import { createServer, Server } from 'node:http';
import { RuntimeConfig } from '../core/types.js';
import { Logger } from '../logging/logger.js';
import { createRequestHandler } from './requestHandler.js';

/**
 * 启动 HTTP 服务
 */
export function startServer(runtime: RuntimeConfig, logger: Logger, logDir: string): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const handler = createRequestHandler(runtime, logger, logDir);
    const server = createServer(handler);

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${runtime.app.port} is already in use`));
      } else {
        reject(err);
      }
    });

    server.listen(runtime.app.port, runtime.app.host, () => {
      logger.info(`Server started on http://${runtime.app.host}:${runtime.app.port}`);
      logger.info(`Enabled profiles: ${runtime.enabledProfilesByModelName.size}`);
      resolve(server);
    });
  });
}
