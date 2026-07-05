/*
 * 配置管理窗口：
 *   - 提供打开/复用单例窗口的能力；
 *   - 通过 IPC 暴露 "fas:settings:load" 与 "fas:settings:save" 两个方法；
 *   - "save" 先做完整校验（复用 validateConfig 的 schema + 业务规则），
 *     校验通过后原子性写盘（*.tmp -> rename），最后调用外部传入的 restart
 *     回调重启内部 HTTP runtime。
 */
import { BrowserWindow, ipcMain } from 'electron';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateConfig } from '../config/validateConfig.js';
import { materializeSettingsAssets } from './settingsAssets.js';

export interface SettingsWindowDeps {
  /** 获取当前 cfgs 目录。运行时可能因重启而变化，因此每次调用现取。 */
  getCfgDir(): string;
  /**
   * 保存并生效：将新的配置文本写盘后，重启内部 HTTP runtime。
   * 若重启失败会抛错，由调用方转换为 UI 错误提示。
   */
  restartRuntime(): Promise<void>;
  /** 保存成功后同步刷新托盘菜单（默认模型勾选项等） */
  onConfigApplied?: () => void;
}

let win: BrowserWindow | null = null;
let ipcRegistered = false;

/**
 * 打开或聚焦设置窗口。
 * 首次调用时会同步注册 IPC 处理器（进程生命周期内只注册一次）。
 */
export async function openSettingsWindow(deps: SettingsWindowDeps): Promise<void> {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }

  registerIpcOnce(deps);

  const { htmlPath, preloadPath } = await materializeSettingsAssets();

  win = new BrowserWindow({
    width: 960,
    height: 640,
    title: 'Free API Switch 配置',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('closed', () => {
    win = null;
  });

  await win.loadFile(htmlPath);
}

/**
 * 注册 IPC 处理器。所有对配置文件的读写都通过主进程完成，
 * 避免渲染进程直接访问 fs，保持权限收敛。
 */
function registerIpcOnce(deps: SettingsWindowDeps): void {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle('fas:settings:load', async () => {
    const cfgDir = deps.getCfgDir();
    const appPath = resolve(cfgDir, 'app.json');
    const modelApiPath = resolve(cfgDir, 'model_api.json');
    const appRaw = existsSync(appPath) ? await readFile(appPath, 'utf-8') : '{}';
    const modelApiRaw = existsSync(modelApiPath)
      ? await readFile(modelApiPath, 'utf-8')
      : '{"profiles":[]}';
    return {
      app: JSON.parse(appRaw),
      modelApi: JSON.parse(modelApiRaw),
    };
  });

  ipcMain.handle('fas:settings:save', async (_event, payload: { app: unknown; modelApi: unknown }) => {
    try {
      // 1. 复用现有 schema + 业务校验，保证不会写出无法启动的配置
      validateConfig({ appRaw: payload.app, modelApiRaw: payload.modelApi });

      // 2. 原子写盘：先写 .tmp，再 rename 覆盖，避免中途失败破坏原文件
      const cfgDir = deps.getCfgDir();
      const appPath = resolve(cfgDir, 'app.json');
      const modelApiPath = resolve(cfgDir, 'model_api.json');
      const appText = JSON.stringify(payload.app, null, 2) + '\n';
      const modelApiText = JSON.stringify(payload.modelApi, null, 2) + '\n';
      const appTmp = appPath + '.tmp';
      const modelApiTmp = modelApiPath + '.tmp';
      await writeFile(appTmp, appText, 'utf-8');
      await writeFile(modelApiTmp, modelApiText, 'utf-8');
      await rename(appTmp, appPath);
      await rename(modelApiTmp, modelApiPath);

      // 3. 重启内部 HTTP runtime，让端口、密钥、模型列表全部按新配置生效
      await deps.restartRuntime();
      deps.onConfigApplied?.();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  });
}
