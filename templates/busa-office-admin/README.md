# Administration Desk / 行政管理工作台

## English

An independent administration workspace with certificates, supplier agreements, document provenance and owner-assigned verification tasks.

### Install

```bash
busabase-cli install ./templates/busa-office-admin --into-folder administration-desk
```

Four Bases, two native Views per Base, one read-only AirApp and a folder Skill with bilingual scenario prompts. Each Base seeds four fictional records. No other office template, external integration or credential is required.

### Daily Work

Review upcoming expiry dates, open certificates or contracts, inspect the original evidence, and ask an agent to draft follow-ups. Conflicting source dates remain unresolved until an owner checks the original. Changes use Busabase ChangeRequests and native review.

### Develop

```bash
cd templates/busa-office-admin
node scripts/sync-content.mjs --check
cd content/busa-office-admin-app
npm ci
npm run check
npm run typecheck
npm run dev
```

Open `http://127.0.0.1:3000/?demo=1`. Use `lang=zh-CN` for Chinese. Gallery scenes are `#overview`, `#certificates`, `#attention`. Demo fixtures also support `state=empty`, `partial`, `stale`, `error` and `permission` for state review.

`references/workflow.json` is the canonical declaration. Run `node scripts/sync-content.mjs` when changing schemas, samples or prompts. Demo and installed samples are generated together. `npm run build:sdk` refreshes the vendored exact-pinned SDK after dependency changes; deployment only runs `node server.js`.

The app reads one 50-row page per Base; Load more reads one page. Search and review subtotals cover loaded records. Runtime resolves an owned installation by metadata, including a renamed folder nested under a test folder, and refuses duplicate or missing ownership. The application allowlist is a code invariant; workspace permissions remain the platform security boundary.

No real original files are included. The sample archive records demonstrate provenance only. Screenshots must be recaptured from the running app before generating the catalog cover.

## 简体中文

独立的行政管理工作区，涵盖证照、供应商合同、原件来源以及分派给负责人的核验待办。

### 安装

```bash
busabase-cli install ./templates/busa-office-admin --into-folder administration-desk
```

包含四张台账、每张台账两个原生视图、一个只读 APP，以及带中英双语场景提示词的文件夹 Skill。每张台账初始化四条虚构记录。无需其他办公模板、外部集成或凭据。

### 日常工作

检查即将到期的日期，打开证照或合同，核对原件证据，并让 Agent 拟定跟进事项。原件日期冲突时，在负责人核对原件前保持未解决。修改通过 Busabase 变更申请和原生审核进行。

### 开发

```bash
cd templates/busa-office-admin
node scripts/sync-content.mjs --check
cd content/busa-office-admin-app
npm ci
npm run check
npm run typecheck
npm run dev
```

打开 `http://127.0.0.1:3000/?demo=1`，使用 `lang=zh-CN` 切换为中文。图库场景为 `#overview`（总览）、`#certificates`（证照台账）、`#attention`（需要复核）。演示数据还支持 `state=empty`、`partial`、`stale`、`error` 与 `permission`，用于核对空状态、部分读取、过期、错误和权限状态。

`references/workflow.json` 是唯一规范源。修改结构、示例或提示词后运行 `node scripts/sync-content.mjs`，演示和安装示例同步生成。依赖变化后运行 `npm run build:sdk` 更新精确锁定版本的本地 SDK；部署时仅运行 `node server.js`。

APP 每张台账初次读取最多 50 行；“加载更多”续读一页。搜索与复核小计仅覆盖已加载记录。运行时通过归属元数据解析所属安装实例，支持测试文件夹下嵌套且改名的文件夹；归属重复或缺失时停止。APP 的过程允许列表是代码约束，工作区权限仍是平台安全边界。

模板不含真实原件，归档示例只演示来源追溯。生成目录封面前，必须从运行中的 APP 重新截取截图。
