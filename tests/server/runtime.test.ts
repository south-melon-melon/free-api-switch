import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { startRuntime } from '../../src/server/runtime.js';

/**
 * 找到一个可用端口，避免测试端口冲突。
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error('failed to allocate port'));
      }
    });
  });
}

function writeCfg(cfgDir: string, port: number): void {
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(
    join(cfgDir, 'app.json'),
    JSON.stringify({
      host: '127.0.0.1',
      port,
      log_level: 'error',
      request_timeout_ms: 30000,
      local_key: 'test-key',
      default_openai_model: 'openai-profile',
      default_anthropic_model: 'anthropic-profile',
    }),
  );
  writeFileSync(
    join(cfgDir, 'model_api.json'),
    JSON.stringify({
      profiles: [
        {
          model_name: 'openai-profile',
          model_id: 'gpt-4o-mini',
          enabled: true,
          type: 'openai_compatible',
          base_url: 'https://api.example.com',
          api_key: 'sk-test-openai',
          max_output_tokens: 1024,
          max_context_tokens: 4096,
          defaults: {},
        },
        {
          model_name: 'anthropic-profile',
          model_id: 'claude-sonnet-4-20250514',
          enabled: true,
          type: 'anthropic_compatible',
          base_url: 'https://api.anthropic.com',
          api_key: 'sk-test-anthropic',
          max_output_tokens: 1024,
          max_context_tokens: 4096,
          defaults: {},
        },
      ],
    }),
  );
}

describe('startRuntime (shared entry for CLI and tray)', () => {
  let tmpRoot: string;

  before(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'fas-runtime-'));
  });

  after(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('starts the http server and close() releases the port', async () => {
    const cfgDir = join(tmpRoot, 'cfgs-1');
    const logDir = join(tmpRoot, 'logs-1');
    const port = await findFreePort();
    writeCfg(cfgDir, port);

    const running = await startRuntime({ cfgDir, logDir });
    try {
      assert.strictEqual(running.runtime.app.port, port);
      assert.ok(
        running.runtime.enabledProfilesByModelName.has('openai-profile'),
        'openai-profile should be enabled',
      );
      assert.ok(
        running.runtime.enabledProfilesByModelName.has('anthropic-profile'),
        'anthropic-profile should be enabled',
      );
      assert.ok(running.server.listening, 'server should be listening');
    } finally {
      await running.close();
    }

    // close() 之后端口应可被复用
    const reclaim = net.createServer();
    await new Promise<void>((resolve, reject) => {
      reclaim.on('error', reject);
      reclaim.listen(port, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((resolve) => reclaim.close(() => resolve()));
  });

  it('second startRuntime on the same port fails when port is occupied', async () => {
    const cfgDir = join(tmpRoot, 'cfgs-2');
    const logDir = join(tmpRoot, 'logs-2');
    const port = await findFreePort();
    writeCfg(cfgDir, port);

    const first = await startRuntime({ cfgDir, logDir });
    try {
      await assert.rejects(
        () => startRuntime({ cfgDir, logDir }),
        /already in use/i,
      );
    } finally {
      await first.close();
    }
  });
});
