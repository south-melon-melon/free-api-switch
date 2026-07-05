# Free API Switch (fas)

一个运行在本机的轻量级大模型 API 代理服务：把统一的 `http://<host>:<port>`（默认 `127.0.0.1:8787`）转发到你配置的多个上游 API（OpenAI / Anthropic 兼容），工具侧只需一份固定的本地 token，切换模型不用改工具配置。

---

## 目录

- [第一章 快速上手（推荐：托盘 exe）](#第一章-快速上手推荐托盘-exe)
- [第二章 从源码运行](#第二章-从源码运行)
- [第三章 主要功能](#第三章-主要功能)
- [附录 A · 配置字段](#附录-a配置字段)
- [附录 B · 错误码](#附录-b错误码)
- [附录 C · 日志](#附录-c日志)

---

## 第一章 快速上手（推荐：托盘 exe）

### 1.1 部署

把 `release/` 目录整体拷贝到任意位置（例如 `D:\FAS\`），保持同级结构：

```
D:\FAS\
├─ Free API Switch <version>.exe
└─ cfgs\
    ├─ app.json
    └─ model_api.json
```

> exe 与 `cfgs/` 必须同级放置。exe 通过自身路径定位 `cfgs/`，与当前工作目录、快捷方式、开机自启无关。

### 1.2 首次运行前：填写 model_api.json

出于安全考虑，`cfgs/model_api.json` **不随仓库或安装包直接提供真实 key**。首次运行前需要生成一份并填入你自己的上游 API Key。

**方式 A（推荐，托盘 exe 用户）**：`release/cfgs/model_api.json` 是打包脚本从 `cfgs/model_api.example.json` 自动拷贝的**示例文件**（`api_key` 是 `sk-your-...` 占位符），直接用编辑器打开填入真实值即可，字段说明见 [附录 A](#附录-a配置字段)。

**方式 B（从源码运行）**：仓库 `.gitignore` 忽略 `cfgs/model_api.json`；首次拉代码后需要手动复制一份：

```powershell
Copy-Item cfgs/model_api.example.json cfgs/model_api.json
```

（Linux/macOS：`cp cfgs/model_api.example.json cfgs/model_api.json`）然后编辑其中的 `api_key` / `base_url` / `model_id` 等字段。

**方式 C（不动 JSON，从托盘 UI 生成）**：如果你已经能启动一次（例如 `model_api.json` 现在只是占位），从托盘右键 **"配置管理..."** 打开设置窗口，在里面添加/编辑 profile 并保存，程序会做完整校验并原子写盘，等价于手动编辑 JSON。

> 校验规则：`api_key` 必填非空、`base_url` 不能含 `/v1`、`default_openai_model` 与 `default_anthropic_model` 必须命中对应类型的 `enabled` profile。校验失败启动会被拒绝或保存会被拒绝并显示错误。

### 1.3 启动

双击 exe：

- 右下角托盘图标出现；
- HTTP 代理已在 `http://<host>:<port>` 上监听（默认 `127.0.0.1:8787`）；
- 日志写到 exe 同级 `logs/`。

配置错误、端口占用等启动失败会以 Windows 通知反馈。托盘为单实例，重复启动直接退出。

### 1.4 在编程工具中配置（TRAE 等）

```
Base URL: http://127.0.0.1:8787/v1
API Key:  <cfgs/app.json 的 local_key>
Model:    anything  （客户端填任意值，会被 profile.model_id 覆盖）
```

**协议路由**（不做协议翻译，路径决定家族）：

| 客户端请求路径              | 使用的默认字段            | 匹配 profile.type     |
| --------------------------- | ------------------------- | --------------------- |
| `POST /v1/chat/completions` | `default_openai_model`    | `openai_compatible`    |
| `POST /v1/messages`         | `default_anthropic_model` | `anthropic_compatible` |

### 1.4 托盘右键菜单

- **切换默认模型**：菜单按 OpenAI / Anthropic 家族列出所有 `enabled` profile，点击即热切换，写回 `cfgs/app.json` 并立即生效，无需重启。
- **配置管理...**：打开可视化设置窗口，编辑 `app.json` 与 `model_api.json` 的全部字段，支持 profile 新增/复制/删除、启用/禁用、`thinking_level` 抽象等级下拉、`defaults` JSON 编辑。**保存前会做完整校验；保存成功后自动关闭并重启内部服务，让新配置立即生效**（含 `host` / `port` 变更）。
- **退出**：优雅关闭服务并释放端口。

### 1.6 抽象推理强度（thinking_level）

profile 上的 `thinking_level` 是本项目的抽象等级，代理转发时按 profile 类型自动翻译为上游真实字段，你**不用**去查各家 API 的 reasoning 字段：

| 抽象等级 | openai_compatible → `reasoning_effort` | anthropic_compatible → `thinking` |
| -------- | -------------------------------------- | --------------------------------- |
| `off`    | `minimal`                              | `{ type: "disabled" }`            |
| `low`    | `low`                                  | `{ type: "enabled", budget_tokens: 1024 }`  |
| `medium` | `medium`                               | `{ type: "enabled", budget_tokens: 4096 }`  |
| `high`   | `high`                                 | `{ type: "enabled", budget_tokens: 12000 }` |
| `xhigh`  | `high`                                 | `{ type: "enabled", budget_tokens: 24000 }` |

生效优先级：
1. 客户端已传上游真实字段（`reasoning_effort` / `reasoning` / `thinking`）→ 完全透传。
2. 客户端 body 传 `thinking_level: "high"` → 以客户端为准。
3. 都没有 → 用 profile 上的 `thinking_level`。
4. 无论走哪条路径，`body.thinking_level` 都会被剥离，避免上游收到未知字段。

---

## 第二章 从源码运行

### 2.1 环境

- Node.js ≥ 20，Windows / Ubuntu。

### 2.2 安装 & 编译

```bash
git clone <repo-url>
cd free-api-switch
npm install
npm run build     # 编译 TypeScript 到 dist/
npm run check     # 仅类型检查
npm test          # 全部单元测试
npm run dev       # watch 模式
```

### 2.3 准备配置

`cfgs/model_api.json` 在 `.gitignore` 中被忽略，克隆仓库后需要手动生成一份：

```powershell
Copy-Item cfgs/app.example.json cfgs/app.json            # 若不存在
Copy-Item cfgs/model_api.example.json cfgs/model_api.json
```

（Linux/macOS 把 `Copy-Item` 换成 `cp`。）然后用编辑器把 `api_key` / `base_url` / `model_id` 等改成你自己的真实值。字段说明见 [附录 A](#附录-a配置字段)。

也可以先复制占位版启动一次（托盘或 CLI），再从托盘 **"配置管理..."** UI 里编辑保存，效果等价。

### 2.4 三种运行方式

```bash
# 1) 纯 CLI
npx fas check           # 校验配置
npx fas list            # 列出 profile（脱敏）
npx fas start           # 启动 HTTP 服务

# 2) 托盘开发态（Electron 主进程 + HTTP 服务）
npm run tray:dev

# 3) 打包便携 exe
npm run tray:dist
```

`tray:dist` 会：编译 TS → `electron-builder --win portable` 生成单文件 exe → 脚本把 `cfgs/*.example.json` 复制到 `release/cfgs/`（已存在则跳过）。

> **打包配置**（`electron-builder.json` + `package.json`，已内置）：`electronDist` 指向本地 `node_modules/electron/dist` 跳过下载；`config.electron_builder_binaries_mirror` 用 npmmirror 国内镜像下载 NSIS / 7zip 打包工具。若打包在 `downloading file=nsis-*.7z` 处失败重试即可。

### 2.5 源码结构

```
src/
├── cli/       CLI 入口与命令分发
├── tray/      Electron 主进程 + 配置管理窗口
├── config/    配置加载与 zod 校验
├── core/      类型、错误、鉴权、profile 解析、参数补全（含 thinking 翻译）
├── proxy/     URL 拼接、Header 重写、上游转发
├── server/    HTTP 服务、请求流水线、共享 startRuntime / restartRuntime
├── logging/   日志（控制台 + 文件）、脱敏
└── paths.ts   跨平台路径解析
```

---

## 第三章 主要功能

- **本机入口** — 默认 `127.0.0.1:8787`；`host` / `port` 均可在 `app.json` 中修改。
- **统一 local_key 鉴权** — 客户端 API Key 字段填 `local_key` 即可。
- **按协议家族选默认模型** — `default_openai_model` 处理 `/v1/chat/completions`，`default_anthropic_model` 处理 `/v1/messages`。
- **`model_name` / `model_id` 分离** — 前者是本地标识（默认字段匹配用），后者是真正下发到上游的模型名。
- **抽象推理强度** — 统一 `off / low / medium / high / xhigh`，代理层自动翻译成 `reasoning_effort` 或 `thinking.budget_tokens`。
- **缺省参数补全** — 生成类端点自动补 `model` / `max_tokens` / `max_context_tokens` 与 `defaults` 中的其他字段。
- **流式透传** — SSE 原样转发，不缓存。
- **托盘可视化管理** — 右键菜单切换默认模型 + "配置管理..."窗口全字段编辑，保存后自动重启服务立即生效。
- **消息日志与运行日志分离** — 运行日志按天写 `logs/fas-YYYY-MM-DD.log`（JSON-line）；每次生成类调用的 messages 独立落到 `logs/messages/<ts>.json`。
- **严格校验** — 启动前 + 配置窗口保存前都做 schema + 业务级校验。
- **安全脱敏** — 日志不含 API Key、local_key 明文。

---

## 附录 A · 配置字段

### app.json

| 字段                      | 类型                                     | 说明                                                                  |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `host`                    | `string`                                 | 监听地址（`127.0.0.1` / `0.0.0.0` / 局域网 IP 均可）                  |
| `port`                    | `number`                                 | 监听端口                                                              |
| `log_level`               | `"debug" \| "info" \| "warn" \| "error"` | 日志级别                                                              |
| `request_timeout_ms`      | `number`                                 | 上游请求超时（毫秒）                                                  |
| `local_key`               | `string`                                 | 全局统一的本地鉴权令牌                                                |
| `default_openai_model`    | `string`                                 | `/v1/chat/completions` 默认使用的 `profile.model_name`                |
| `default_anthropic_model` | `string`                                 | `/v1/messages` 默认使用的 `profile.model_name`                        |

### model_api.json（profile 项）

| 字段                 | 类型                                                | 说明                                              |
| -------------------- | --------------------------------------------------- | ------------------------------------------------- |
| `model_name`         | `string`                                            | 本地标识，需唯一，用于 `app.default_*_model` 匹配 |
| `model_id`           | `string`                                            | 真正下发到上游 API 的模型名                       |
| `enabled`            | `boolean`                                           | 是否启用                                          |
| `type`               | `"openai_compatible" \| "anthropic_compatible"`     | 上游协议类型                                      |
| `base_url`           | `string`                                            | 上游 API 根地址，不含 `/v1`                       |
| `api_key`            | `string`                                            | 真实上游 API Key                                  |
| `max_output_tokens`  | `number`（可选）                                    | 请求缺 `max_tokens` 时补全                        |
| `max_context_tokens` | `number`（可选）                                    | 请求缺 `max_context_tokens` 时补全                |
| `thinking_level`     | `"off"\|"low"\|"medium"\|"high"\|"xhigh"`（可选）   | 抽象推理强度，转发时按 type 翻译为上游字段        |
| `defaults`           | `object`                                            | 生成类端点的默认参数，只补 body 中缺失字段        |

### 配置文件位置

| 运行形态                         | cfgs 路径          | logs 路径          |
| -------------------------------- | ------------------ | ------------------ |
| CLI（`fas start`）               | `<cwd>/cfgs/`      | `<cwd>/logs/`      |
| 开发态托盘（`npm run tray:dev`） | `<cwd>/cfgs/`      | `<cwd>/logs/`      |
| 打包 exe                          | `<exe 同级>/cfgs/` | `<exe 同级>/logs/` |

---

## 附录 B · 错误码

| 场景             | HTTP |
| ---------------- | ---- |
| 缺少 local_key   | 401  |
| local_key 不匹配 | 401  |
| 未知生成类端点   | 404  |
| 请求体非法 JSON  | 400  |
| 请求体超过 10MB  | 413  |
| 上游连接失败     | 502  |
| 上游超时         | 504  |
| 内部错误         | 500  |

上游 HTTP 错误（4xx/5xx）原样透传。

---

## 附录 C · 日志

- **运行日志**：`logs/fas-YYYY-MM-DD.log`，JSON-line。
- **消息日志**：每次生成类调用的 `request_messages` 与 `response_message`（含 SSE 聚合结果）独立落到 `logs/messages/<ts>.json`。
- **控制台**：跟随 `log_level`。
- **脱敏**：API Key / local_key / 鉴权 Header 全部脱敏，不进日志。
