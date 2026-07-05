/*
 * Free API Switch - Windows 托盘主进程
 *
 * 职责：
 *   - Electron app ready 后创建托盘图标；
 *   - 通过 requestSingleInstanceLock 保证单实例；
 *   - 调用共享的 startRuntime 启动 fas 本机代理服务；
 *   - 右键菜单：按 OpenAI / Anthropic 家族列出所有 enabled profile，
 *     点击后写回 cfgs/app.json 对应的 default_*_model 字段并热更新 runtime；
 *   - 右键菜单还提供 "配置管理" 项，打开设置窗口编辑 app.json / model_api.json；
 *   - 右键菜单还提供 "退出" 项，退出时优雅关闭 HTTP 服务并 app.quit()；
 *   - 启动失败通过 Notification 通知用户，并保留托盘图标以便退出；
 *   - 支持 --debug / FAS_TRAY_DEBUG=1 调试模式：额外输出 console.log。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { app, Menu, Notification, Tray, nativeImage } from 'electron';
import type { RunningRuntime, StartRuntimeOptions } from '../server/runtime.js';
import { startRuntime } from '../server/runtime.js';
import type { EndpointFamily, ProfileConfig } from '../core/types.js';
import { openSettingsWindow } from './settingsWindow.js';

// 16x16 纯色 PNG（灰色），base64 编码，作为托盘图标的最后兜底。
// 优先使用 assets/icon.ico，仅当图标文件缺失时回退到该内联 PNG。
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAOElEQVR42mNk' +
  'YGD4z0AEYBxVSF+FjIyMDAz/GRj+MzAwMDAyMDAyMDAwMDAwMDAwMDAwMDAw' +
  'AAAqQwHtxN8bkAAAAABJRU5ErkJggg==';

/**
 * 解析 assets/icon.ico 的绝对路径。
 *
 * 三种运行形态都要照顾到：
 *   - 开发态（tsc 编译到 dist/tray/main.js）：assets/ 在项目根，即 dist 的上级；
 *   - Electron 直接运行源代码目录：process.resourcesPath 指向 electron/resources；
 *   - electron-builder 打包后：assets 被打进 resources/ 或 asar，取 process.resourcesPath。
 */
function resolveIconPath(): string | null {
  const candidates: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(resolve(here, '..', '..', 'assets', 'icon.ico'));
  } catch {
    // ignore
  }
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    candidates.push(resolve(process.resourcesPath, 'assets', 'icon.ico'));
    candidates.push(resolve(process.resourcesPath, 'app', 'assets', 'icon.ico'));
  }
  candidates.push(resolve(process.cwd(), 'assets', 'icon.ico'));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const isDebug =
  process.argv.includes('--debug') || process.env.FAS_TRAY_DEBUG === '1';

function debugLog(...args: unknown[]): void {
  if (isDebug) {
    // eslint-disable-next-line no-console
    console.log('[fas-tray]', ...args);
  }
}

function notify(title: string, body: string): void {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch (err) {
    debugLog('notification failed:', err);
  }
}

let tray: Tray | null = null;
let running: RunningRuntime | null = null;
let quitting = false;
// 全局记录 runtime 启动参数，供"保存并重启"复用相同 cfgDir/logDir
let runtimeOptions: StartRuntimeOptions = {};

async function shutdown(): Promise<void> {
  if (quitting) return;
  quitting = true;

  debugLog('shutdown requested');
  try {
    if (running) {
      running.logger.info('tray: quit requested, closing http server');
      await running.close();
      running.logger.info('tray: http server closed');
    }
  } catch (err) {
    debugLog('shutdown error:', err);
  } finally {
    running = null;
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.quit();
  }
}

/**
 * 将 default_openai_model 或 default_anthropic_model 写回 cfgs/app.json，
 * 并同步更新内存中的 runtime.app 使新请求立即生效。
 */
function switchDefaultModel(family: EndpointFamily, modelName: string): void {
  if (!running) return;
  const field = family === 'openai' ? 'default_openai_model' : 'default_anthropic_model';
  const appJsonPath = resolve(running.cfgDir, 'app.json');

  try {
    const raw = readFileSync(appJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    parsed[field] = modelName;
    writeFileSync(appJsonPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    running.logger.error('tray: failed to persist default model', { family, modelName, error: msg });
    notify('切换失败', `写入 app.json 失败：${msg}`);
    return;
  }

  // 热更新内存中的默认，无需重启进程
  running.runtime.app[field] = modelName;
  running.logger.info('tray: default model switched', { family, modelName });
  notify('Free API Switch', `已切换 ${family} 默认模型：${modelName}`);

  // 刷新菜单以更新勾选状态
  rebuildTrayMenu();
}

/**
 * 重启内部 HTTP runtime：关闭旧 server，用当前配置重新启动。
 * 用于配置管理保存后立即生效。
 */
async function restartRuntime(): Promise<void> {
  if (running) {
    try {
      await running.close();
    } catch (err) {
      debugLog('restart: close old runtime failed:', err);
    }
    running = null;
  }
  running = await startRuntime(runtimeOptions);
  const { app: appCfg } = running.runtime;
  running.logger.info('tray: proxy server restarted', {
    host: appCfg.host,
    port: appCfg.port,
  });
  if (tray) {
    tray.setToolTip(`Free API Switch (http://${appCfg.host}:${appCfg.port})`);
  }
  rebuildTrayMenu();
}

function buildContextMenu(): Menu {
  const openaiItems: Electron.MenuItemConstructorOptions[] = [];
  const anthropicItems: Electron.MenuItemConstructorOptions[] = [];

  if (running) {
    const { app: appCfg, enabledProfilesByModelName } = running.runtime;
    const profiles: ProfileConfig[] = [...enabledProfilesByModelName.values()];

    for (const p of profiles.filter((x) => x.type === 'openai_compatible')) {
      openaiItems.push({
        label: `${p.model_name}  (${p.model_id})`,
        type: 'radio',
        checked: p.model_name === appCfg.default_openai_model,
        click: () => switchDefaultModel('openai', p.model_name),
      });
    }
    for (const p of profiles.filter((x) => x.type === 'anthropic_compatible')) {
      anthropicItems.push({
        label: `${p.model_name}  (${p.model_id})`,
        type: 'radio',
        checked: p.model_name === appCfg.default_anthropic_model,
        click: () => switchDefaultModel('anthropic', p.model_name),
      });
    }
  }

  if (openaiItems.length === 0) {
    openaiItems.push({ label: '(无 enabled openai profile)', enabled: false });
  }
  if (anthropicItems.length === 0) {
    anthropicItems.push({ label: '(无 enabled anthropic profile)', enabled: false });
  }

  return Menu.buildFromTemplate([
    { label: 'OpenAI 默认模型', enabled: false },
    ...openaiItems,
    { type: 'separator' },
    { label: 'Anthropic 默认模型', enabled: false },
    ...anthropicItems,
    { type: 'separator' },
    {
      label: '配置管理...',
      click: () => {
        void openSettingsWindow({
          getCfgDir: () => running?.cfgDir ?? resolveCfgDirFallback(),
          restartRuntime: async () => {
            await restartRuntime();
          },
          onConfigApplied: () => {
            notify('Free API Switch', '配置已保存并生效');
          },
        }).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          notify('配置窗口打开失败', msg);
          debugLog('openSettingsWindow failed:', msg);
        });
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        void shutdown();
      },
    },
  ]);
}

/**
 * runtime 未启动时兜底给出 cfgDir。使用与 bootstrap 相同的逻辑。
 * 这样即便当前 runtime 启动失败，用户也能通过设置窗口编辑配置尝试恢复。
 */
function resolveCfgDirFallback(): string {
  if (runtimeOptions.cfgDir) return runtimeOptions.cfgDir;
  return resolve(process.cwd(), 'cfgs');
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildContextMenu());
}

function buildTray(): void {
  const iconPath = resolveIconPath();
  const image = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_BASE64, 'base64'));
  if (iconPath) {
    debugLog('tray icon:', iconPath);
  } else {
    debugLog('tray icon: fallback inline PNG (assets/icon.ico not found)');
  }
  tray = new Tray(image);
  tray.setToolTip('Free API Switch');
  tray.setContextMenu(buildContextMenu());
}

async function bootstrap(): Promise<void> {
  buildTray();

  try {
    // 打包后：从 exe 同级目录读取 cfgs 与 logs，方便用户把 exe + cfgs 放在一起
    // 开发态（npm run tray:dev）：保持默认（process.cwd()/cfgs、logs）
    //
    // portable NSIS exe 运行时会先解压到 %TEMP%\<UNPACK_DIR_NAME>\ 再启动，
    // app.getPath('exe') 指向的是临时解压路径而非用户双击的原始 exe 路径。
    // NSIS 包装器会在启动子进程前设置 PORTABLE_EXECUTABLE_DIR 环境变量指向
    // 原始 exe 所在目录（见 portable.nsi），优先使用它来定位 cfgs/logs。
    const baseDir = app.isPackaged
      ? (process.env.PORTABLE_EXECUTABLE_DIR ?? dirname(app.getPath('exe')))
      : process.cwd();
    runtimeOptions = app.isPackaged
      ? {
          cfgDir: resolve(baseDir, 'cfgs'),
          logDir: resolve(baseDir, 'logs'),
        }
      : {};
    running = await startRuntime(runtimeOptions);
    const { app: appCfg } = running.runtime;
    running.logger.info('tray: proxy server started', {
      host: appCfg.host,
      port: appCfg.port,
    });
    if (tray) {
      tray.setToolTip(`Free API Switch (http://${appCfg.host}:${appCfg.port})`);
    }
    debugLog(`proxy started on http://${appCfg.host}:${appCfg.port}`);
    // runtime 就绪后重建菜单，填充可选 profile
    rebuildTrayMenu();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog('startRuntime failed:', msg);
    notify('Free API Switch 启动失败', msg);
    // 保留托盘图标，让用户可以右键退出
  }
}

// 单实例锁：避免重复启动造成端口占用或多个托盘图标
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 已经存在实例，直接退出
  app.quit();
} else {
  app.on('second-instance', () => {
    notify('Free API Switch', '已在运行，请从系统托盘退出');
  });

  // 托盘应用不依赖窗口存活。用户关闭"配置管理"窗口后应用应继续运行。
  // Electron 默认在所有窗口关闭时退出应用，注册空监听即可覆盖默认行为，
  // 让进程保持存活直到用户显式点击托盘 "退出"。
  app.on('window-all-closed', () => {
    // 保持进程存活，什么都不做
  });

  app.on('before-quit', (e) => {
    if (!quitting && running) {
      // 拦截一次，走优雅关闭流程
      e.preventDefault();
      void shutdown();
    }
  });

  app.whenReady().then(() => {
    void bootstrap();
  });
}
