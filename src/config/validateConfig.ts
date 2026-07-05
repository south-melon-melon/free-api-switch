import { appSchema, profilesSchema } from './schema.js';
import { LoadedRawConfig } from './loadConfig.js';
import { LocalError } from '../core/errors.js';
import { RuntimeConfig, ProfileConfig } from '../core/types.js';

export function validateConfig(raw: LoadedRawConfig): RuntimeConfig {
  // 1. 校验 app 配置
  const appResult = appSchema.safeParse(raw.appRaw);
  if (!appResult.success) {
    const issuePaths = appResult.error.issues.map(i => i.path.join('.')).join(', ');
    throw new LocalError('CONFIG_VALIDATION_FAILED', `app.json validation failed: ${issuePaths}`);
  }

  // 2. 校验 model_api 配置
  const profilesResult = profilesSchema.safeParse(raw.modelApiRaw);
  if (!profilesResult.success) {
    const issuePaths = profilesResult.error.issues.map(i => i.path.join('.')).join(', ');
    throw new LocalError('CONFIG_VALIDATION_FAILED', `model_api.json validation failed: ${issuePaths}`);
  }

  const profiles: ProfileConfig[] = profilesResult.data.profiles;
  const app = appResult.data;

  // 3. 业务级校验

  // 3.1 model_name 唯一（全部 profile）
  const nameSet = new Set<string>();
  for (const p of profiles) {
    if (nameSet.has(p.model_name)) {
      throw new LocalError('CONFIG_VALIDATION_FAILED', `Duplicate profile model_name: ${p.model_name}`);
    }
    nameSet.add(p.model_name);
  }

  // 只对 enabled profile 做后续校验
  const enabledProfiles = profiles.filter(p => p.enabled);

  // 3.2 base_url 不以 /v1 结尾、不含 /v1 段（仅 enabled profile）
  for (const p of enabledProfiles) {
    let url: URL;
    try {
      url = new URL(p.base_url);
    } catch {
      throw new LocalError('CONFIG_VALIDATION_FAILED', `Invalid base_url in profile: ${p.model_name}`);
    }
    const pathname = url.pathname;
    if (pathname === '/v1' || pathname.startsWith('/v1/') || pathname.endsWith('/v1')) {
      throw new LocalError(
        'CONFIG_VALIDATION_FAILED',
        `base_url must not contain /v1 segment: ${p.model_name}`,
      );
    }
  }

  // 3.3 构建 enabledProfilesByModelName
  const enabledProfilesByModelName = new Map<string, ProfileConfig>();
  for (const p of enabledProfiles) {
    enabledProfilesByModelName.set(p.model_name, p);
  }

  // 3.4 校验 default_openai_model 指向一个 enabled 且 type=openai_compatible 的 profile
  const openaiProfile = enabledProfilesByModelName.get(app.default_openai_model);
  if (!openaiProfile) {
    const enabledNames = [...enabledProfilesByModelName.keys()].join(', ') || '(none)';
    throw new LocalError(
      'CONFIG_VALIDATION_FAILED',
      `default_openai_model "${app.default_openai_model}" does not match any enabled profile. Enabled profiles: ${enabledNames}`,
    );
  }
  if (openaiProfile.type !== 'openai_compatible') {
    throw new LocalError(
      'CONFIG_VALIDATION_FAILED',
      `default_openai_model "${app.default_openai_model}" must reference a profile with type "openai_compatible", but got "${openaiProfile.type}"`,
    );
  }

  // 3.5 校验 default_anthropic_model 指向一个 enabled 且 type=anthropic_compatible 的 profile
  const anthropicProfile = enabledProfilesByModelName.get(app.default_anthropic_model);
  if (!anthropicProfile) {
    const enabledNames = [...enabledProfilesByModelName.keys()].join(', ') || '(none)';
    throw new LocalError(
      'CONFIG_VALIDATION_FAILED',
      `default_anthropic_model "${app.default_anthropic_model}" does not match any enabled profile. Enabled profiles: ${enabledNames}`,
    );
  }
  if (anthropicProfile.type !== 'anthropic_compatible') {
    throw new LocalError(
      'CONFIG_VALIDATION_FAILED',
      `default_anthropic_model "${app.default_anthropic_model}" must reference a profile with type "anthropic_compatible", but got "${anthropicProfile.type}"`,
    );
  }

  return {
    app,
    profiles,
    enabledProfilesByModelName,
  };
}
