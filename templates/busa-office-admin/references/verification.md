# Verification Record / 验证记录

Date / 日期: 2026-09-29

## English

### Method And Result

- `busabase-cli check . --strict --output json`: package, Skill, template and AirApp layers passed; 0 errors, 0 warnings.
- `node scripts/sync-content.mjs --check`: 12 generated files match the canonical specification; 16 sample records.
- AirApp `pnpm check`: 9 tests passed, 0 failures. Tests exercise expiry boundaries, preservation of conflicting source dates, complete record text, renamed nested installation ownership, ambiguity rejection before record access, one bounded initial page per Base, explicit continuation, partial permission failure and page normalization/deduplication.
- `npm run typecheck`: TypeScript `allowJs/checkJs` on pure domain and runtime resource-binding modules passed. DOM wiring is covered by browser acceptance and `node --check app/js/app.js`; this command does not claim whole-project strict TypeScript coverage.
- `node --check server.js`: passed. `npm audit --omit=dev`: 0 vulnerabilities.
- Playwright opened the actual Hono app in deterministic Demo mode at 1440x900, 1280x820 and 390x844. English and Simplified Chinese navigation, detail, loaded-row search/clear, status filtering, guide Escape, mobile drawer and back passed. Empty, partial, stale, error and permission recovery states rendered. No browser page errors or horizontal page overflow.
- Six desktop WebP gallery screenshots show overview, certificates and attention in both locales. Mobile and dark screenshots are additional evidence. Images contain no rendered resource IDs.
- The standard cover renderer ran after screenshot capture; its check passed: first gallery asset, 1440x900 WebP, actual overview screenshot source. OCR across both templates' 14 gallery images found no upstream workspace or author branding.

### Limits

Local Demo screenshots prove the interface and deterministic data path. They do not prove the Busabase viewer's ambient session or hosted engine. The integration owner performs isolated scratch installation, canonical record readback and deployed Run verification separately. No real identity document, workspace ID, credential or original source material is distributed.

## 简体中文

### 方法与结果

- `busabase-cli check . --strict --output json`：模板包、Skill、模板目录资格及 APP 检查均通过，0 错误、0 警告。
- `node scripts/sync-content.mjs --check`：12 个生成文件与规范源一致，含 16 条示例记录。
- APP 的 `pnpm check`：9 项测试通过，无失败。覆盖到期边界、冲突原件日期保留、完整记录文字、改名且嵌套的安装归属、读取记录前拒绝归属歧义、每张台账首次有上限分页、明确续读、部分权限失败，以及记录归一化与去重。
- `npm run typecheck`：纯业务模块与运行时资源绑定模块的 TypeScript `allowJs/checkJs` 检查通过。DOM 事件接线由浏览器验收及 `node --check app/js/app.js` 覆盖；该命令不代表整个项目的严格 TypeScript 检查。
- `node --check server.js` 通过。`npm audit --omit=dev` 无漏洞。
- Playwright 在 1440x900、1280x820 和 390x844 尺寸打开实际 Hono APP 的确定性演示模式。英语与简体中文导航、详情、已加载记录搜索及清除、状态筛选、流程说明 Escape 关闭、手机抽屉和返回均通过。空、部分读取、过期、错误及权限恢复状态均正常呈现，无页面异常和横向页面溢出。
- 六张桌面 WebP 图库截图覆盖两种语言的总览、证照台账和需要复核页面。手机与深色截图作为补充证据；图片不呈现资源 ID。
- 标准封面在截取截图后生成，检查通过：图库首项、1440x900 WebP、源自实际总览截图。两个模板的 14 张图库图片经 OCR 检查，无上游工作区或作者品牌。

### 范围限制

本地演示截图验证界面与确定性数据路径，不证明 Busabase 查看者的环境会话或托管引擎。集成负责人另行进行独立测试安装、规范记录读回和已部署 APP 的 Run 验证。不分发真实身份证明文件、工作区 ID、凭据或原件材料。
