import { resolveCfgDir } from '../paths.js';
import { loadRawConfig } from '../config/loadConfig.js';
import { validateConfig } from '../config/validateConfig.js';
import { startRuntime } from '../server/runtime.js';

export async function runCheck(): Promise<void> {
  const cfgDir = resolveCfgDir();
  const raw = loadRawConfig(cfgDir);
  const runtime = validateConfig(raw);

  const enabledCount = runtime.enabledProfilesByModelName.size;
  const totalCount = runtime.profiles.length;

  console.log('OK');
  console.log(`Profiles: ${totalCount} total, ${enabledCount} enabled`);
  console.log(`Default OpenAI model:    ${runtime.app.default_openai_model}`);
  console.log(`Default Anthropic model: ${runtime.app.default_anthropic_model}`);
  console.log(`Local key: ${runtime.app.local_key}`);
}

export async function runList(jsonOutput: boolean): Promise<void> {
  const cfgDir = resolveCfgDir();
  const raw = loadRawConfig(cfgDir);
  const runtime = validateConfig(raw);

  if (jsonOutput) {
    const output = {
      profiles: runtime.profiles.map(p => ({
        model_name: p.model_name,
        model_id: p.model_id,
        enabled: p.enabled,
        type: p.type,
        base_url: p.base_url,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    // 表格输出
    const headers = ['model_name', 'model_id', 'enabled', 'type', 'base_url'];
    const colWidths = {
      model_name: 24,
      model_id: 24,
      enabled: 8,
      type: 22,
      base_url: 40,
    };

    // 打印表头
    const headerLine = headers.map(h => h.padEnd(colWidths[h as keyof typeof colWidths])).join(' ');
    console.log(headerLine);
    console.log('-'.repeat(headerLine.length));

    // 打印行
    for (const p of runtime.profiles) {
      const row = [
        p.model_name.padEnd(colWidths.model_name),
        p.model_id.padEnd(colWidths.model_id),
        String(p.enabled).padEnd(colWidths.enabled),
        p.type.padEnd(colWidths.type),
        p.base_url.padEnd(colWidths.base_url),
      ].join(' ');
      console.log(row);
    }
  }
}

export async function runStart(): Promise<void> {
  try {
    await startRuntime();
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
