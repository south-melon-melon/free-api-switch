import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalError } from '../core/errors.js';

export interface LoadedRawConfig {
  appRaw: unknown;
  modelApiRaw: unknown;
}

export function loadRawConfig(cfgDir: string): LoadedRawConfig {
  const appPath = resolve(cfgDir, 'app.json');
  const modelApiPath = resolve(cfgDir, 'model_api.json');

  let appRaw: unknown;
  let modelApiRaw: unknown;

  // 读取 app.json
  try {
    const appContent = readFileSync(appPath, 'utf-8');
    appRaw = JSON.parse(appContent);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new LocalError('CONFIG_FILE_NOT_FOUND', `Configuration file not found: ${appPath}`);
    }
    if (err instanceof SyntaxError) {
      throw new LocalError('CONFIG_JSON_INVALID', `Invalid JSON in file: app.json`);
    }
    throw err;
  }

  // 读取 model_api.json
  try {
    const modelApiContent = readFileSync(modelApiPath, 'utf-8');
    modelApiRaw = JSON.parse(modelApiContent);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new LocalError('CONFIG_FILE_NOT_FOUND', `Configuration file not found: ${modelApiPath}`);
    }
    if (err instanceof SyntaxError) {
      throw new LocalError('CONFIG_JSON_INVALID', `Invalid JSON in file: model_api.json`);
    }
    throw err;
  }

  return { appRaw, modelApiRaw };
}
