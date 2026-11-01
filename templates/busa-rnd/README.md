# R&D Projects

## English

A lightweight R&D desk for a team that lets its coding agents do the bookkeeping. People raise
needs and make decisions; agents turn needs into tasks, write back while they code, log every
merged change in one plain sentence, package finished work into deliveries a person accepts, and
write the weekly R&D report. The loop closes every Monday: what shipped, what is in progress, what
is still needed, and what needs a decision.

### Install

```bash
busabase-cli install ./templates/busa-rnd
```

Six Bases — Products, Projects, Tasks, Changelog, Deliveries, Reports — with table views, a
read-only AirApp, and four skills: `busa-rnd` (the shared data contract) plus three role skills,
`rnd-prd` (needs and acceptance), `rnd-coder` (the coding loop) and `rnd-pmo` (projects and the
weekly report). Every node carries its own agent prompts. Sample rows tell one fictional team's
fortnight: three products, a delivery that failed acceptance and produced a follow-up bug, and a
weekly report waiting to be finalised.

### Connect your coding agents

Ask an agent in any repository: *"Connect this code repository to the R&D desk."* It registers
the repository under its product and adds a short pointer block to the repository's `AGENTS.md`
or `CLAUDE.md`. From then on every coding agent working there — Claude Code, Codex, Cursor — reads
`rnd-coder` before it starts, moves its task through `in-progress` → `in-review` → `done`, and
writes the changelog row when it merges. The machine needs `busabase-cli` logged in.

### The weekly report

Busabase does not run agents on a schedule. Schedule *"Write last week's R&D weekly report"* in
your agent's own scheduler (a Claude Code routine, or cron calling `claude -p` / `codex exec`) for
Monday morning; a person reads the draft and finalises it. See `content/rnd-pmo/SKILL.md`.

### Develop

```bash
cd templates/busa-rnd
node scripts/sync-content.mjs --check
cd content/busa-rnd-app
npm ci
npm run check
PORT=3000 npm run dev
```

Open `http://127.0.0.1:3000/?demo=1`; add `&lang=zh-CN` for Chinese. Views are `#/overview`,
`#/attention`, `#/reports`, `#/deliveries`, `#/tasks`, `#/projects`, `#/changelog`, `#/products`.
`state=empty`, `partial`, `stale`, `error` and `permission` exercise the recovery states.

`content/busa-rnd-app/app/js/config.js` declares the Bases, fields, views and node prompts;
`app/js/demo-data.js` holds the sample rows. `node scripts/sync-content.mjs` regenerates every
`content/<base>/base.json`, `records.ndjson`, `content/_folder.json` and the AirApp's `_node.json`
from them, validating each sample row against the schema. Never edit the generated files.

Each screen reads one bounded page per source with server-side filters and a typed date sort —
open tasks, tasks finished in the last 28 days, the newest 50 changes — and continues only on
Load more. Search filters loaded rows. Package templates can ship table views only, so the task
board lives in the AirApp.

All names, products and links are fictional.

## 简体中文

一个轻量的研发管理台，让团队的 coding agent 来做记账的活。人负责提需求和拍板；Agent 把需求整理成任务，写代码时随手回写，每次合并用一句人话记一条变更，把做完的工作整理成交付交给人验收，并每周写研发周报。每周一闭环一次：上线了什么、进行中的工作、还有什么需求、什么需要拍板。

### 安装

```bash
busabase-cli install ./templates/busa-rnd
```

包含六张表（产品、项目、任务、变更记录、交付验收、周报与产出）及表格视图、一个只读 AirApp，以及四个 Skill：`busa-rnd`（共用的数据约定），外加三个角色 Skill：`rnd-prd`（需求与验收）、`rnd-coder`（研发执行）、`rnd-pmo`（项目与周报）。每个节点都配了自己的 Agent 快捷指令。示例数据是一个虚构团队两周的工作：三个产品、一项验收未通过并生成了跟进缺陷的交付、一份等待定稿的周报。

### 接入 coding agent

在任意代码仓库里对 Agent 说：「把这个代码仓库接到研发管理台」。它会把仓库登记到对应产品下，并在仓库的 `AGENTS.md` 或 `CLAUDE.md` 里写一小段指针。之后在这里干活的每个 coding agent（Claude Code、Codex、Cursor）开工前都会先读 `rnd-coder`，把任务从「进行中」推进到「评审中」再到「已完成」，合并时写一条变更记录。所在机器需要先登录 `busabase-cli`。

### 周报

Busabase 不会自己定时启动 Agent。请在 Agent 自带的定时能力里（Claude Code routine，或用 cron 调 `claude -p` / `codex exec`）设置每周一早上运行「生成上周研发周报」；由人阅读草稿并定稿。详见 `content/rnd-pmo/SKILL.md`。

### 开发

见上方英文部分的命令。`config.js` 声明表、字段、视图和节点提示词，`demo-data.js` 存放示例数据，`node scripts/sync-content.mjs` 由它们生成全部 `content/` 文件并逐行校验示例数据。不要手改生成的文件。模板包目前只能携带表格视图，所以任务看板放在 AirApp 里。

所有人名、产品和链接均为虚构。
