# Verification Record / 验证记录

Date / 日期: 2026-09-29

## English

### Method And Result

- `busabase-cli check . --strict --output json`: package, Skill, template and AirApp layers passed; 0 errors, 0 warnings.
- `node scripts/sync-content.mjs --check`: 12 generated files match the canonical specification; 16 sample records.
- AirApp `pnpm check`: 9 tests passed, 0 failures. The payroll test confirms that only approved/paid, finite explicit inputs in the selected month are included; drafts, missing deductions and other months are excluded. The fixture confirms proposed raises never change confirmed salary and missing salary remains undefined. Complete record text, ownership, pagination, partial failure and normalization paths are also exercised.
- `npm run typecheck`: TypeScript `allowJs/checkJs` on the pure domain and resource-binding modules passed. DOM wiring is exercised by browser acceptance and syntax checks, not presented as whole-project strict TypeScript coverage.
- `node --check server.js` and `node --check app/js/app.js`: passed. `npm audit --omit=dev`: 0 vulnerabilities.
- Playwright opened the actual Hono app in Demo mode at 1440x900, 1280x820 and 390x844. English and Chinese routes, details, search/clear, status filter, guide Escape, mobile drawer and back passed. Empty, partial, stale, error and permission states rendered. No browser page errors or horizontal page overflow. Review metrics were compressed so the working list remains visible on mobile.
- Six desktop WebP gallery images show overview, monthly payroll and attention in both locales. Mobile and dark screenshots provide additional evidence. No resource IDs are rendered.
- Standard cover generation ran after screenshots and passed its structural check: first gallery asset, 1440x900 WebP, actual overview source. OCR across both templates' 14 gallery images found no upstream branding.

### Limits

Demo screenshots validate the interface, not the hosted viewer's session or engine. Real scratch installation, seed readback and deployed Run acceptance are handled by the integration owner. Salary examples, names and payment references are fictional. This package includes no payment integration, payslip sending or tax calculation.

## 简体中文

### 方法与结果

- `busabase-cli check . --strict --output json`：模板包、Skill、模板目录资格及 APP 检查均通过，0 错误、0 警告。
- `node scripts/sync-content.mjs --check`：12 个生成文件与规范源一致，含 16 条示例记录。
- APP 的 `pnpm check`：9 项测试通过，无失败。工资测试确认只统计所选月份已批准或已付款且明确为有限数值的输入，排除草稿、缺失扣款及其他月份。示例测试确认调薪提案不改变已确认工资，缺失工资保持未定义。另覆盖完整记录文字、归属、分页、部分失败和归一化路径。
- `npm run typecheck`：纯业务模块和资源绑定模块的 TypeScript `allowJs/checkJs` 检查通过。DOM 接线通过浏览器验收及语法检查验证，不宣称覆盖整个项目的严格 TypeScript 检查。
- `node --check server.js` 和 `node --check app/js/app.js` 通过。`npm audit --omit=dev` 无漏洞。
- Playwright 在 1440x900、1280x820 和 390x844 尺寸打开实际 Hono APP 的演示模式。中英页面、详情、搜索及清除、状态筛选、流程说明 Escape 关闭、手机抽屉和返回均通过。空、部分读取、过期、错误及权限状态正常呈现。无页面异常和横向页面溢出。复核指标经过紧凑处理，手机上仍能看到工作列表。
- 六张桌面 WebP 图库截图覆盖中英两种语言的总览、月度工资和需要复核页面。手机与深色截图提供补充证据，不呈现资源 ID。
- 标准封面在截图之后生成并通过结构检查：图库首项、1440x900 WebP、源自实际总览截图。两个模板的 14 张图库图片经 OCR 检查，无上游品牌。

### 范围限制

演示截图验证界面，不验证托管环境中查看者的会话或引擎。真实测试安装、初始记录读回和已部署 Run 验收由集成负责人完成。工资示例、姓名和付款编号均为虚构。本模板不包含付款集成、发送工资条或税务计算。
