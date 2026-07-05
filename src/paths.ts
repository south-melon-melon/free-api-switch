import { resolve } from 'node:path';

/** 解析 cfgs 目录路径（跨平台） */
export function resolveCfgDir(cwd?: string): string {
  return resolve(cwd ?? process.cwd(), 'cfgs');
}

/** 解析 logs 目录路径（跨平台） */
export function resolveLogDir(cwd?: string): string {
  return resolve(cwd ?? process.cwd(), 'logs');
}
