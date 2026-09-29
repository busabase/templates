# Office Management Verification

Date: 2026-09-29

## 验证范围

| 模板 | Base | 示例记录 | 原生视图 |
| --- | ---: | ---: | ---: |
| Administration Desk | 4 | 16 | 8 |
| Office Finance | 4 | 13 | 8 |
| Cashier Desk | 4 | 13 | 8 |
| People & Payroll Desk | 4 | 16 | 8 |
| Recruiting Desk | 4 | 15 | 4 |
| Legal Case Desk | 5 | 16 | 5 |
| 合计 | 25 | 89 | 41 |

六个模板先安装在 Cloud Test Workspace 的专用验收目录中，再按用户指定，
安装到独立数据目录的本地 `npx busabase@latest`（0.90.2，PGLite）进行原生 Run 验收。
各自拥有 Folder、AirApp 和业务 Skill。
安装结果均为无阻塞、无冲突、无待审核申请、无警告。示例数据均为虚构，未复制原工作区的编号、人员或文件。

## 方法与结果

- 每个项目独立执行 `pnpm check` 和 `pnpm typecheck`，50 项领域与 provider 测试通过。
  类型检查覆盖领域函数和资源归属；财务、出纳、招聘及法务还覆盖 SDK 类型约束的 provider/client。
  UI 和生成 vendor 通过语法、运行契约和浏览器验证，不声称经过完整 TypeScript 检查。
- `node scripts/check-office-templates.mjs` 核对所有声明与安装 schema、示例字段及选项。
- `scripts/check-office-live.mjs` 对真实服务器逐一核对 25 个 Base 的主字段、类型与选项，
  89 条示例及出纳关联均指向预期的安装记录。
- 五个四表模板每次冷读取执行 11 个 GET：4 个记录页、4 个精确计数和 3 个资源元数据读取。
  法务为五表，执行 13 个 GET。每页上限 50，不自动翻页；浏览器读取不产生写入。
- 最终源码按文件哈希与安装实例比较，仅同步不同的文件，并使用原文件哈希检查并发冲突。
  安装后的根 Skill 手册也与本地源文件核对。
- Playwright 独立操作总览、业务列表、详情、逐字输入搜索、空筛选、关注事项、中英切换，
  并检查手机布局、帮助对话框和 Escape 关闭。未出现页面异常或可见资源编号。
- 浏览器使用本地 SDK gateway 读取测试工作区的真实安装数据。六个 APP 均显示原生记录与详情，
  浏览器请求不携带 Authorization 密钥。
- 六个模板分别具有两个语言、三个工作场景的 1440x900 真实截图；封面由标准工具在截图后生成。
  封面和包格式检查均通过，源码及图片 OCR 未发现原工作区或作者品牌残留。
- 本地原生 Run 使用 Busabase 自带的浏览器运行时加载已安装的源码及依赖。
  六个运行时均返回 `browser / hosted=true / devProxy=false`，无需独立 APP 的连接对话框。
  Playwright 在每个 APP 中操作所有业务入口、详情、逐字搜索、空结果及中英切换，
  并检查 390px 手机布局。六个 APP 无页面异常、无横向溢出；记录请求均为带 Base 范围的 GET，分页上限 50。
- 本地 SDK 校验通过：25 个 Base schema、89 条安装记录、精确计数和出纳真实关联均与包内定义一致。
- 新增 12 段中英录屏。完整解码和逐帧非空/运动/首尾循环检查通过；122 张操作帧 OCR 无作者品牌残留。
  Chromium 中全部播放至结束，无解码异常。录屏展示真实只读操作，不暗示付款或审批写入。

## 发布规范检查

| 项目 | 结果与依据 |
| --- | --- |
| 格式 | 六个 `busabase-cli check --strict` 均为 0 错误、0 警告；生成索引检查通过 |
| 封面 | 六张标准生成的 1440x900 WebP 均位于图库第一项，来源为真实截图 |
| 截图 | 每个模板中英各覆盖总览、主要工作表、人工关注，共 36 张 |
| 品牌 | 源码、示例及截图 OCR 检查通过；新增录屏操作帧 OCR 通过 |
| 初次打开 | 25 张表均有 schema 合法的虚构记录，每表不超过 50 条，真实安装后可读取 |
| 场景提示词 | 模板级及显式 Folder/Base/AirApp 节点均有具体业务提示词；自动手册节点的安装器限制见下文 |

## 录屏

所有视频均为无音轨 H.264、1440x900、yuv420p、TV 色域范围，使用 Git LFS。
英文主视频由 `template.video` 声明，图库顺序为封面、视频、截图。中文版本随包提供。
视频覆盖各业务入口、详情、搜索或状态筛选、语言切换，最后返回初始画面。

| 模板 | 英文 / 中文时长 | 文件目录 |
| --- | --- | --- |
| 行政 | 19.73 / 19.73 秒 | [录屏](../templates/busa-office-admin/assets/recordings/) |
| 财务 | 19.13 / 18.87 秒 | [录屏](../templates/busa-office-finance/assets/recordings/) |
| 出纳 | 19.23 / 18.90 秒 | [录屏](../templates/busa-office-cashier/assets/recordings/) |
| 人事薪酬 | 19.83 / 19.80 秒 | [录屏](../templates/busa-office-hr/assets/recordings/) |
| 招聘 | 20.00 / 19.37 秒 | [录屏](../templates/busa-office-recruiting/assets/recordings/) |
| 法务 | 22.03 / 21.70 秒 | [录屏](../templates/busa-office-legal/assets/recordings/) |

## 用户故事

办公室负责人安装六个模板后，先核对行政证照，再逐一检查其他业务是否能读取自己的资料。
下面是本地 Busabase 内置 Run 读取真实安装数据后的界面；图库另包含人工关注场景。

1. 从行政工作台总览进入，先查看续期及待核验情况。
   ![行政工作台原生入口](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/admin-native-shell.png)
2. 进入证照台账，核对负责人、到期日和证据状态。
   ![行政证照核验](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/admin-native-zh.png)
3. 打开证照详情，保留来源依据和待核验信息。
   ![证照原生详情](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/admin-native-detail.png)
4. 切换到人事工作台，进入员工档案，并可继续检查合同、调薪与工资复核。
   ![人事原生入口](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/hr-native-shell.png)
5. 进入财务报销表，区分待审、受阻和已支付事项。
   ![财务原生入口](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/finance-native-shell.png)
6. 进入出纳付款申请，核对银行账户和凭证，批准不被视为付款完成。
   ![出纳原生入口](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/cashier-native-shell.png)
7. 进入招聘职位表，再检查候选人、面试和录用进度。
   ![招聘原生入口](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/recruiting-native-shell.png)
8. 最后进入法务案件台账，再核对保全期限、进展及回款证据。
   ![法务原生入口](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/legal-native-shell.png)
9. 返回行政工作表，切换中文，并在手机尺寸继续查看。
   ![行政中文](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/admin-native-zh.png)
   ![行政手机](https://pub-5d59c786708441b3a80620d87e7dee2b.r2.dev/tmp/2026-09-29/office-templates/admin-native-phone.png)

## 验收等级与限制

验收等级：🟢 完整验收。按用户指定的本地 `npx busabase` 范围完成真实安装、原生 Run、API 与浏览器验收，附可访问的截图和录屏。

Cloud 登录会话及交互式 OAuth 不在本次用户指定的验收范围内，未声称通过。

本地 Busabase 0.90.2 服务端日志出现上游 `shiki / @shikijs/core` 模块缺失，
可能影响原生文档的语法高亮。六个 APP 的原生 Run 与 SDK 数据校验通过；本 PR 未修改 Busabase 的 npm 包。

- 同一空间中存在多个同模板的归属根节点时，当前接口明确报冲突，未提供实例选择器。
- 当前安装器自动生成的根手册 Skill 不传输自定义节点提示词；显式 Folder、Base 和 AirApp 都有业务提示词。
- 搜索、关注事项和金额子集只覆盖已加载记录；每张表的总数来自服务端精确计数。
- 支付、开票、申报、发 Offer 或法律承诺需要另行明确授权。只读工作台不会执行这些行为。
- 国家税法、工资扣款及法定诉讼期限不由模板猜测；缺失依据保持待核验。
