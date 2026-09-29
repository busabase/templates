# Cashier Desk / 出纳管理

## English

Bank checks, payment evidence, cash movements and reconciliation exceptions without moving money.

Standalone template with 4 Bases, fictional seed records, a workflow Skill and bilingual node prompts. The app is read-only. Search and filters apply to loaded records; monetary subtotals are labelled loaded-only and grouped by currency. No bank, invoice or tax integration is installed.

Install: `busabase-cli install . --into-folder <your-test-folder>`.

Local verification: `cd content/busa-office-cashier-app && pnpm install && pnpm check && PORT=18122 pnpm dev`; open `http://127.0.0.1:18122/?demo=1`. Demo and installed seeds share the same sample source. Local demo does not prove the hosted session bridge; installation acceptance is performed separately.

Schemas and samples: `app/js/config.js` and `app/js/samples.js` are canonical. Run `node scripts/sync-content.mjs` after edits; check parity with `--check`.

Language coverage: the app interface, catalog prompts, node prompts, complete operating manual and package metadata support English and Simplified Chinese. Native tables, fields, views and select labels use bilingual strings; narrative seed titles and notes carry both languages. Proper names, reference codes, currency codes, statuses and relations retain stable values. English and Chinese recordings are under `assets/recordings/`.

## 简体中文

管理银行走查、付款依据、收付流水和对账异常，不执行资金转账。

本模板可独立安装，包含 4 张数据表、虚构示例记录、业务 Skill 及中英双语节点提示词。应用为只读工作台。搜索和筛选只作用于已加载记录；金额小计明确标注统计范围，并按币种分组。未安装银行、开票或税务申报集成。

安装：`busabase-cli install . --into-folder <your-test-folder>`。

本地检查：`cd content/busa-office-cashier-app && pnpm install && pnpm check && PORT=18122 pnpm dev`；打开 `http://127.0.0.1:18122/?demo=1`。演示模式与安装数据使用同一份示例源。本地演示不能证明托管会话桥接有效；安装后的验收单独执行。

数据结构与示例以 `app/js/config.js` 和 `app/js/samples.js` 为准。编辑后运行 `node scripts/sync-content.mjs`，使用 `--check` 检查生成文件是否一致。

语言覆盖：界面、模板卡片提示词、节点提示词、完整操作手册和模板元数据支持英语与简体中文。原生表、字段、视图及选择项标签采用中英并列文本；示例标题和叙述备注包含两种语言。专有名称、引用编号、币种代码、状态和关联值保持稳定。中英文录屏位于 `assets/recordings/`。
