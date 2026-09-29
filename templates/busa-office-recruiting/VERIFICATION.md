# Recruiting template verification / 招聘模板验收记录

## English

Date: 2026-09-29

Method: A real Hono process ran locally on port 18131. Playwright opened the overview, applicants and attention views at 1440×900, 1280×820 and 390×844, checking English/Chinese navigation, search, status filters, details, mobile drawer and return navigation. Empty, partial, error, permission and stale preview states and dark appearance were checked.

Result: No browser errors, horizontal overflow or visible resource IDs. The desktop metrics strip was 49px tall and at least three applicant rows appeared in the first viewport. Toolbar/workspace overlap was fixed. Real screenshots are in `assets/screenshots/`; the cover was generated from screenshots using the repository tool after capture.

Static checks: `npm run check` (8 domain and isolation tests), AirApp `npm run typecheck` (SDK-typed provider, client, resource ownership and domain functions; excluding UI and generated vendor), `node --check server.js`, `busabase-cli check .` and cover checks passed. Dependency audit reported 0 findings. OCR and source scans found no upstream author's name, original workspace branding or private IDs.

Scope and limitations: This record covers the local interface and algorithms. Consult the repository report for test workspace installation, native views and the deployed Busabase session bridge. Search and metric subsets cover loaded rows only; multiple copies of the same template in one space report an explicit conflict. Sample material is fictional; people and formal business procedures handle notifications, hiring approval and delivery.

Localization update: The complete English/Chinese manual, native resource/field/view names and descriptions, specific catalog/node prompts and example narratives are bilingual. UI tooltips and accessible labels switch with the language. Machine values, business codes, currencies, dates and fictional personal names are unchanged. Regeneration parity, the 8 existing tests, scoped typecheck and strict CLI validation passed. Refreshed browser and media evidence for this change belongs in the repository report.

## 简体中文

日期：2026-09-29

方法：真实 Hono 进程运行于本机端口 18131；Playwright 在 1440×900、1280×820 和 390×844 下打开总览、候选人和关注事项，检查中英导航、搜索、状态筛选、详情、移动抽屉和返回。检查空、部分、错误、权限和过期预览状态以及深色界面。

结果：无浏览器异常、无横向溢出、无可见资源 ID。桌面指标带高 49px，首屏可见至少三条候选人记录。修复了筛选工具栏与工作区重叠。真实截图见 `assets/screenshots/`，封面在截图之后由仓库标准工具生成。

静态检查：`npm run check`（8 项领域及资源隔离测试），AirApp 内 `npm run typecheck`（SDK 类型约束的 provider、client、资源归属及领域函数；不含 UI 与生成 vendor），`node --check server.js`，`busabase-cli check .`，封面结构检查全部通过；依赖审计为 0 问题。OCR 和源码检查未发现原作者姓名、原工作区品牌或私有编号。

已知限制：这份记录证明本地界面与算法。测试空间安装、原生视图配置及部署后的 Busabase 会话桥需要仓库总验收报告补充。搜索和指标子集只覆盖已加载记录；同一空间内多个同模板安装实例会明确报冲突。示例资料为虚构；通知、录用审批和发送由人工及正式业务流程处理。

双语补齐：完整中英业务手册、原生资源/字段/视图名称与描述、具体模板卡片/节点提示词及示例叙述均已双语。界面按钮提示及无障碍标签随语言切换。机器值、业务编号、币种、日期及虚构人物姓名保持不变。生成内容一致性、既有 8 项测试、限定范围类型检查及严格 CLI 检查均通过。本次变更更新后的浏览器及媒体证据由仓库总验收报告提供。
