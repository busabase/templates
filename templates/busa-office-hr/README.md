# People & Payroll Desk / 人事薪酬工作台

## English

An independent HR workspace for employee records, labor contract renewals, salary proposals and monthly payroll review.

### Install

```bash
busabase-cli install ./templates/busa-office-hr --into-folder people-payroll-desk
```

Four Bases, two native Views per Base, a read-only AirApp and a folder Skill. Four synthetic records per Base give a ready-to-review month with missing inputs, unsigned and expiring contracts, a proposed raise and an approved future change. No finance or cashier template is needed.

### Daily Work

Start with the authoritative employee roster. Review expiring labor contracts and compare salary proposals with confirmed salary inputs. Check payroll by month and employee business code; missing inputs stay missing. Approved payroll is distinct from paid payroll. The Skill uses ChangeRequests for requested proposals; no payment, payslip sending or tax formula is included.

### Develop

```bash
cd templates/busa-office-hr
node scripts/sync-content.mjs --check
cd content/busa-office-hr-app
npm ci
npm run check
npm run typecheck
npm run dev
```

Open `http://127.0.0.1:3000/?demo=1`; add `lang=zh-CN` for Chinese. Screens are `#overview`, `#payroll`, `#attention`, plus each Base. `state=empty`, `partial`, `stale`, `error` and `permission` exercise user-visible recovery states.

Edit `references/workflow.json`, then regenerate using `node scripts/sync-content.mjs`. The demo and installed seed rows come from the same specification. `npm run build:sdk` produces the vendored SDK; production starts only the Hono server.

Every Base read is capped at 50 rows and continues only on Load more. Search and net pay are explicitly loaded-row views, and net pay includes only approved or paid rows with confirmed finite inputs in the selected month. Employee headcount is never inferred from contract or payroll counts. The application resolves resource ownership metadata and refuses ambiguous installations; the viewing user's workspace permissions govern access.

All names, salaries and payment evidence are fictional. Restrict real employee and payroll nodes with workspace permissions. Verify real install-and-open separately from deterministic local gallery screenshots.

## 简体中文

独立的人事管理工作区，用于员工档案、劳动合同续签、薪酬提案和月度工资复核。

### 安装

```bash
busabase-cli install ./templates/busa-office-hr --into-folder people-payroll-desk
```

包含四张台账、每张两个原生视图、一个只读 APP 和文件夹 Skill。每张台账四条虚构记录，提供可立即复核的月份示例，涵盖缺失输入、未签及临近到期的合同、调薪提案和已批未来变动。不依赖财务或出纳模板。

### 日常工作

从权威员工花名册开始，检查即将到期的劳动合同，将薪酬提案与已确认工资输入比较。按月份和员工业务编号核对工资；缺失输入保持缺失。已批准工资与已付款工资不同。Skill 用变更申请处理用户要求的提案；模板不包含付款、发送工资条或税务公式。

### 开发

```bash
cd templates/busa-office-hr
node scripts/sync-content.mjs --check
cd content/busa-office-hr-app
npm ci
npm run check
npm run typecheck
npm run dev
```

打开 `http://127.0.0.1:3000/?demo=1`，添加 `lang=zh-CN` 切换为中文。页面包括 `#overview`（总览）、`#payroll`（月度工资）、`#attention`（需要复核）和各台账。`state=empty`、`partial`、`stale`、`error` 与 `permission` 用于验证空状态、部分读取、过期、错误及权限恢复状态。

编辑 `references/workflow.json` 后，用 `node scripts/sync-content.mjs` 重新生成。演示与安装示例记录来自同一规范。`npm run build:sdk` 生成本地 SDK，生产环境仅启动 Hono 服务。

每张台账读取最多 50 行，仅在“加载更多”时续读。搜索和实发工资明确限定于已加载记录；实发工资仅统计所选月份已批准或已付款且输入为明确有限数值的项目。不能从合同或工资数量推断员工人数。APP 按资源归属元数据定位资源，归属歧义时停止；查看者的工作区权限决定访问范围。

所有姓名、工资和付款证据均为虚构。用工作区权限限制真实员工和工资节点。真实安装后打开 APP 的验收，与本地确定性图库截图应分别进行。
