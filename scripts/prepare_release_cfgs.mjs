/*
 * 打包后处理脚本：把 cfgs/*.example.json 复制到 release/cfgs/ 作为初始配置。
 *
 * 目标：让用户拿到 release 目录下的 exe 之后，直接看到同级 cfgs/app.json 与
 * cfgs/model_api.json，无需自己手动重命名 .example.json。
 *
 * 注意：源码工程内的 cfgs/ 目录一律不修改，仅从 example 拷贝。
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const srcCfgDir = resolve(projectRoot, 'cfgs');
const releaseDir = resolve(projectRoot, 'release');
const destCfgDir = resolve(releaseDir, 'cfgs');

if (!existsSync(releaseDir)) {
  console.error(`[prepare_release_cfgs] release directory not found: ${releaseDir}`);
  process.exit(1);
}

mkdirSync(destCfgDir, { recursive: true });

// 遍历 cfgs 下所有 *.example.json，复制成同名去掉 .example 的文件
const entries = readdirSync(srcCfgDir);
let count = 0;
for (const name of entries) {
  const m = /^(.+)\.example\.json$/.exec(name);
  if (!m) continue;
  const destName = `${m[1]}.json`;
  const src = resolve(srcCfgDir, name);
  const dest = resolve(destCfgDir, destName);
  if (existsSync(dest)) {
    console.log(`[prepare_release_cfgs] skip existing: ${dest}`);
    continue;
  }
  copyFileSync(src, dest);
  console.log(`[prepare_release_cfgs] copied ${name} -> ${dest}`);
  count += 1;
}

console.log(`[prepare_release_cfgs] done, ${count} file(s) written to ${destCfgDir}`);
