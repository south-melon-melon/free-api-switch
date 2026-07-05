/*
 * 设置窗口静态资源：HTML 页面与 preload 脚本。
 *
 * 说明：
 *   - tsc 只编译 .ts 文件，不会复制 .html/.css/.js 静态资源。
 *   - 为避免额外的构建拷贝步骤，这里把 HTML 与 preload 内容以字符串形式内联，
 *     首次打开设置窗口时写入 app.getPath('userData')/settings-ui/ 下的真实文件，
 *     再由 BrowserWindow 通过 loadFile / webPreferences.preload 引用。
 *   - preload 使用 .cjs 扩展名，避免受 package.json 中 "type": "module" 影响
 *     被当作 ESM 加载。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { THINKING_LEVELS } from '../core/types.js';

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>Free API Switch 配置</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f6f8;
    --panel: #ffffff;
    --border: #d0d7de;
    --text: #1f2328;
    --muted: #656d76;
    --accent: #0969da;
    --danger: #cf222e;
    --success: #1a7f37;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117;
      --panel: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8d96a0;
      --accent: #4493f8;
      --danger: #f85149;
      --success: #3fb950;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: "Segoe UI", "Microsoft YaHei", -apple-system, sans-serif;
    font-size: 13px;
    background: var(--bg);
    color: var(--text);
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  header {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  header button {
    background: transparent;
    border: none;
    color: var(--text);
    padding: 10px 18px;
    font-size: 13px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  header button.active {
    border-bottom-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  main { flex: 1; overflow: auto; padding: 16px; }
  section.tab { display: none; }
  section.tab.active { display: block; }
  .form-grid {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 8px 12px;
    align-items: center;
    max-width: 720px;
  }
  .form-grid label { color: var(--muted); }
  input[type="text"], input[type="number"], select, textarea {
    width: 100%;
    padding: 6px 8px;
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    font-family: "Consolas", "Menlo", monospace;
  }
  textarea { min-height: 84px; resize: vertical; }
  .models-layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 16px;
    height: 100%;
  }
  .profile-list {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 160px);
  }
  .profile-list-header {
    padding: 8px;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 6px;
  }
  .profile-list-header button {
    flex: 1;
    padding: 6px 8px;
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }
  .profile-list-header button:hover { border-color: var(--accent); color: var(--accent); }
  .profile-list ul {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
    flex: 1;
  }
  .profile-list li {
    padding: 8px 10px;
    cursor: pointer;
    border-left: 3px solid transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .profile-list li:hover { background: rgba(9,105,218,0.08); }
  .profile-list li.active { border-left-color: var(--accent); background: rgba(9,105,218,0.12); }
  .profile-list li .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .profile-list li .badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(0,0,0,0.08);
    color: var(--muted);
  }
  .profile-list li.disabled .name { color: var(--muted); text-decoration: line-through; }
  .profile-detail {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    overflow-y: auto;
  }
  .profile-detail .empty { color: var(--muted); text-align: center; padding: 40px; }
  footer {
    padding: 10px 16px;
    background: var(--panel);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  footer .msg { flex: 1; }
  footer .msg.error { color: var(--danger); white-space: pre-wrap; }
  footer .msg.ok { color: var(--success); }
  footer button {
    padding: 6px 14px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
  }
  footer button.primary { background: var(--accent); color: white; border-color: var(--accent); }
  footer button.primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .hint { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row > * { flex: 1; }
  .checkbox-row { display: flex; align-items: center; gap: 6px; }
  .checkbox-row input { width: auto; }
</style>
</head>
<body>
  <header>
    <button id="tab-btn-app" class="active" data-tab="app">应用配置 (app.json)</button>
    <button id="tab-btn-models" data-tab="models">模型 API (model_api.json)</button>
  </header>
  <main>
    <section id="tab-app" class="tab active">
      <div class="form-grid">
        <label>host</label>
        <input type="text" id="app-host" placeholder="127.0.0.1" />
        <label>port</label>
        <input type="number" id="app-port" min="1" max="65535" />
        <label>log_level</label>
        <select id="app-log-level">
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <label>request_timeout_ms</label>
        <input type="number" id="app-timeout" min="1" />
        <label>local_key</label>
        <input type="text" id="app-local-key" placeholder="本地代理鉴权 key" />
        <label>default_openai_model</label>
        <select id="app-default-openai"></select>
        <label>default_anthropic_model</label>
        <select id="app-default-anthropic"></select>
      </div>
    </section>
    <section id="tab-models" class="tab">
      <div class="models-layout">
        <div class="profile-list">
          <div class="profile-list-header">
            <button id="btn-add">新增</button>
            <button id="btn-duplicate">复制</button>
            <button id="btn-delete">删除</button>
          </div>
          <ul id="profiles"></ul>
        </div>
        <div class="profile-detail" id="profile-detail">
          <div class="empty">选择左侧一个 profile 进行编辑，或点击"新增"</div>
        </div>
      </div>
    </section>
  </main>
  <footer>
    <span id="msg" class="msg"></span>
    <button id="btn-reload">重新加载</button>
    <button id="btn-save" class="primary">保存并重启</button>
  </footer>

<script>
/* eslint-disable */
(function () {
  const api = window.fasSettings;
  let state = { app: null, modelApi: null };
  let selectedIndex = -1;

  function $(id) { return document.getElementById(id); }

  function setMsg(text, kind) {
    const el = $('msg');
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function renderAppTab() {
    const a = state.app || {};
    $('app-host').value = a.host ?? '';
    $('app-port').value = a.port ?? '';
    $('app-log-level').value = a.log_level ?? 'info';
    $('app-timeout').value = a.request_timeout_ms ?? '';
    $('app-local-key').value = a.local_key ?? '';
    refreshDefaultModelOptions();
  }

  function refreshDefaultModelOptions() {
    const profiles = (state.modelApi && state.modelApi.profiles) || [];
    const openaiSel = $('app-default-openai');
    const anthSel = $('app-default-anthropic');
    const buildOptions = (sel, type, current) => {
      sel.innerHTML = '';
      const enabled = profiles.filter(p => p.enabled && p.type === type);
      if (enabled.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(无可用 profile - 请先启用或新增)';
        sel.appendChild(opt);
      }
      let matched = false;
      for (const p of enabled) {
        const opt = document.createElement('option');
        opt.value = p.model_name;
        opt.textContent = p.model_name + '  (' + p.model_id + ')';
        if (p.model_name === current) { opt.selected = true; matched = true; }
        sel.appendChild(opt);
      }
      if (!matched && current) {
        const opt = document.createElement('option');
        opt.value = current;
        opt.textContent = current + '  (当前，已失效)';
        opt.selected = true;
        sel.insertBefore(opt, sel.firstChild);
      }
    };
    buildOptions(openaiSel, 'openai_compatible', state.app && state.app.default_openai_model);
    buildOptions(anthSel, 'anthropic_compatible', state.app && state.app.default_anthropic_model);
  }

  function collectApp() {
    return {
      host: $('app-host').value.trim(),
      port: Number($('app-port').value),
      log_level: $('app-log-level').value,
      request_timeout_ms: Number($('app-timeout').value),
      local_key: $('app-local-key').value,
      default_openai_model: $('app-default-openai').value,
      default_anthropic_model: $('app-default-anthropic').value,
    };
  }

  function renderProfileList() {
    const ul = $('profiles');
    ul.innerHTML = '';
    const profiles = (state.modelApi && state.modelApi.profiles) || [];
    profiles.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = (i === selectedIndex ? 'active' : '') + (p.enabled ? '' : ' disabled');
      li.dataset.index = String(i);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.model_name || '(未命名)';
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = p.type === 'openai_compatible' ? 'openai' : 'anthropic';
      li.appendChild(name);
      li.appendChild(badge);
      li.addEventListener('click', () => {
        commitProfileForm();
        selectedIndex = i;
        renderProfileList();
        renderProfileDetail();
      });
      ul.appendChild(li);
    });
  }

  function renderProfileDetail() {
    const container = $('profile-detail');
    const profiles = (state.modelApi && state.modelApi.profiles) || [];
    if (selectedIndex < 0 || selectedIndex >= profiles.length) {
      container.innerHTML = '<div class="empty">选择左侧一个 profile 进行编辑，或点击"新增"</div>';
      return;
    }
    const p = profiles[selectedIndex];
    const defaultsStr = JSON.stringify(p.defaults ?? {}, null, 2);
    container.innerHTML = '';
    const fields = [
      { key: 'model_name',        label: 'model_name',        type: 'text',   value: p.model_name ?? '' },
      { key: 'model_id',          label: 'model_id',          type: 'text',   value: p.model_id ?? '' },
      { key: 'enabled',           label: 'enabled',           type: 'checkbox', value: p.enabled !== false },
      { key: 'type',              label: 'type',              type: 'select', value: p.type ?? 'openai_compatible', options: ['openai_compatible', 'anthropic_compatible'] },
      { key: 'base_url',          label: 'base_url',          type: 'text',   value: p.base_url ?? '', hint: '不要包含 /v1 路径' },
      { key: 'api_key',           label: 'api_key',           type: 'text',   value: p.api_key ?? '' },
      { key: 'max_output_tokens', label: 'max_output_tokens', type: 'number', value: p.max_output_tokens ?? '' , hint: '留空表示不限制' },
      { key: 'max_context_tokens',label: 'max_context_tokens',type: 'number', value: p.max_context_tokens ?? '' , hint: '留空表示不限制' },
      { key: 'thinking_level',    label: 'thinking_level',    type: 'select', value: p.thinking_level ?? '' , options: ['', ...__THINKING_LEVELS__], hint: '抽象等级：openai→reasoning_effort（off→minimal），anthropic→thinking（off→disabled）；留空表示不设置' },
      { key: 'defaults',          label: 'defaults',          type: 'textarea', value: defaultsStr, hint: '必须是合法 JSON 对象' },
    ];
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    for (const f of fields) {
      const label = document.createElement('label');
      label.textContent = f.label;
      grid.appendChild(label);
      let input;
      if (f.type === 'select') {
        input = document.createElement('select');
        for (const opt of f.options) {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt;
          if (opt === f.value) o.selected = true;
          input.appendChild(o);
        }
      } else if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.value = String(f.value);
      } else if (f.type === 'checkbox') {
        const wrap = document.createElement('div');
        wrap.className = 'checkbox-row';
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(f.value);
        const span = document.createElement('span');
        span.textContent = '启用该 profile';
        wrap.appendChild(input);
        wrap.appendChild(span);
        input.dataset.key = f.key;
        grid.appendChild(wrap);
        continue;
      } else {
        input = document.createElement('input');
        input.type = f.type;
        input.value = String(f.value);
      }
      input.dataset.key = f.key;
      const cell = document.createElement('div');
      cell.appendChild(input);
      if (f.hint) {
        const h = document.createElement('div');
        h.className = 'hint';
        h.textContent = f.hint;
        cell.appendChild(h);
      }
      grid.appendChild(cell);
    }
    container.appendChild(grid);
  }

  function commitProfileForm() {
    const profiles = (state.modelApi && state.modelApi.profiles) || [];
    if (selectedIndex < 0 || selectedIndex >= profiles.length) return;
    const p = profiles[selectedIndex];
    const container = $('profile-detail');
    const inputs = container.querySelectorAll('[data-key]');
    inputs.forEach((el) => {
      const key = el.dataset.key;
      if (key === 'enabled') {
        p.enabled = el.checked;
      } else if (key === 'max_output_tokens' || key === 'max_context_tokens') {
        const v = el.value.trim();
        if (v === '') delete p[key]; else p[key] = Number(v);
      } else if (key === 'thinking_level') {
        const v = el.value;
        if (v === '') { delete p.thinking_level; }
        else { p.thinking_level = v; }
      } else if (key === 'defaults') {
        // 保留原始文本；保存时再解析并抛错
        p.__defaults_raw = el.value;
      } else {
        p[key] = el.value;
      }
    });
  }

  function collectModelApi() {
    commitProfileForm();
    const profiles = ((state.modelApi && state.modelApi.profiles) || []).map((p) => {
      const clean = { ...p };
      // 处理 defaults：优先使用原始文本解析
      if ('__defaults_raw' in clean) {
        const raw = clean.__defaults_raw;
        delete clean.__defaults_raw;
        try {
          const parsed = raw.trim() === '' ? {} : JSON.parse(raw);
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('defaults 必须是 JSON 对象');
          }
          clean.defaults = parsed;
        } catch (e) {
          throw new Error('profile "' + (clean.model_name || '?') + '" 的 defaults 不是合法 JSON 对象：' + e.message);
        }
      }
      // 移除空字符串的可选字段
      if (clean.max_output_tokens === '' || clean.max_output_tokens == null) delete clean.max_output_tokens;
      if (clean.max_context_tokens === '' || clean.max_context_tokens == null) delete clean.max_context_tokens;
      if (clean.thinking_level === '' || clean.thinking_level == null) delete clean.thinking_level;
      return clean;
    });
    return { profiles };
  }

  function switchTab(name) {
    document.querySelectorAll('header button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('section.tab').forEach((s) => {
      s.classList.toggle('active', s.id === 'tab-' + name);
    });
    if (name === 'app') refreshDefaultModelOptions();
  }

  async function reload() {
    setMsg('加载中...', '');
    try {
      const data = await api.load();
      state.app = data.app;
      state.modelApi = data.modelApi;
      selectedIndex = state.modelApi.profiles.length > 0 ? 0 : -1;
      renderAppTab();
      renderProfileList();
      renderProfileDetail();
      setMsg('已加载', 'ok');
    } catch (e) {
      setMsg('加载失败：' + (e && e.message ? e.message : String(e)), 'error');
    }
  }

  async function save() {
    try {
      const app = collectApp();
      const modelApi = collectModelApi();
      $('btn-save').disabled = true;
      setMsg('保存中并重启服务...', '');
      const result = await api.save({ app, modelApi });
      if (result && result.ok) {
        setMsg('保存成功，服务已重启', 'ok');
      } else {
        setMsg('保存失败：' + (result && result.error ? result.error : '未知错误'), 'error');
      }
    } catch (e) {
      setMsg('保存失败：' + (e && e.message ? e.message : String(e)), 'error');
    } finally {
      $('btn-save').disabled = false;
    }
  }

  function addProfile() {
    commitProfileForm();
    const p = {
      model_name: 'new-profile-' + Date.now(),
      model_id: '',
      enabled: true,
      type: 'openai_compatible',
      base_url: 'https://example.com',
      api_key: '',
      defaults: {},
    };
    state.modelApi.profiles.push(p);
    selectedIndex = state.modelApi.profiles.length - 1;
    renderProfileList();
    renderProfileDetail();
  }

  function duplicateProfile() {
    commitProfileForm();
    const profiles = state.modelApi.profiles;
    if (selectedIndex < 0 || selectedIndex >= profiles.length) return;
    const src = profiles[selectedIndex];
    const copy = JSON.parse(JSON.stringify(src));
    copy.model_name = src.model_name + '-copy';
    profiles.splice(selectedIndex + 1, 0, copy);
    selectedIndex = selectedIndex + 1;
    renderProfileList();
    renderProfileDetail();
  }

  function deleteProfile() {
    const profiles = state.modelApi.profiles;
    if (selectedIndex < 0 || selectedIndex >= profiles.length) return;
    const target = profiles[selectedIndex];
    const ok = window.confirm('确认删除 profile：' + target.model_name + ' ？此操作在点击"保存并重启"后才写入磁盘。');
    if (!ok) return;
    profiles.splice(selectedIndex, 1);
    if (selectedIndex >= profiles.length) selectedIndex = profiles.length - 1;
    renderProfileList();
    renderProfileDetail();
    refreshDefaultModelOptions();
  }

  document.querySelectorAll('header button').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  $('btn-reload').addEventListener('click', reload);
  $('btn-save').addEventListener('click', save);
  $('btn-add').addEventListener('click', addProfile);
  $('btn-duplicate').addEventListener('click', duplicateProfile);
  $('btn-delete').addEventListener('click', deleteProfile);

  // 切到应用配置 tab 时，同步下拉框（读取当前 profile 表单缓冲）
  $('tab-btn-app').addEventListener('click', () => { commitProfileForm(); });

  reload();
})();
</script>
</body>
</html>
`;

const PRELOAD_CONTENT = `/*
 * 设置窗口 preload 脚本（CommonJS）。
 * 通过 contextBridge 暴露最小 API 给渲染层。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fasSettings', {
  load: () => ipcRenderer.invoke('fas:settings:load'),
  save: (payload) => ipcRenderer.invoke('fas:settings:save', payload),
});
`;

export interface SettingsAssetPaths {
  htmlPath: string;
  preloadPath: string;
}

/**
 * 把 HTML 与 preload 写入 userData/settings-ui/。
 * 多次调用会覆盖写入，保证与当前源代码版本一致。
 *
 * 写入前把 HTML 中的占位符替换为主进程侧的实际数据：
 *   - __THINKING_LEVELS__ → JSON 化的 THINKING_LEVELS，保证 UI 下拉框与后端枚举同源。
 */
export async function materializeSettingsAssets(): Promise<SettingsAssetPaths> {
  const dir = join(app.getPath('userData'), 'settings-ui');
  await mkdir(dir, { recursive: true });
  const htmlPath = join(dir, 'settings.html');
  const preloadPath = join(dir, 'preload.cjs');
  const html = HTML_CONTENT.replace(
    /__THINKING_LEVELS__/g,
    JSON.stringify(THINKING_LEVELS),
  );
  await writeFile(htmlPath, html, 'utf-8');
  await writeFile(preloadPath, PRELOAD_CONTENT, 'utf-8');
  return { htmlPath, preloadPath };
}
