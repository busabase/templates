# From A Reviewed Idea To A Busabase App

## English

Ideas prepares requirements. The public `busabase-app-creator` skill turns them
into a Busabase Cloud/Desktop workspace app through its own approved blueprint.
It is an Agent workflow, not a build button or an automatic PRD-to-app command.
Other product targets need a builder chosen with the user.

### Install And Ask

In the external Agent's project, install the public skills:

```bash
npx skills add busabase/skills --skill busabase --skill busabase-app-creator
```

Read the installed `busabase` and `busabase-app-creator` manuals. Their public
source is [busabase/skills](https://github.com/busabase/skills), under
`skills/busabase` and `skills/busabase-app-creator`. No private creator is required.
Report installation failures; they do not authorize substituting an unknown
private skill or bypassing the creator.

Copy this, replacing the two bracketed links:

> Read the `busa-ideas` skill for [my Ideas Space link] and [this Idea link].
> Check its reviewed PRD and remaining questions, then show me which version and
> scope you would hand off. If anything blocks building, explain it first. After
> I confirm that handoff, use the public `busabase-app-creator` skill to propose
> an app plan; wait for my approval before creating resources. Keep the Ideas
> data intact. If we already started, check the recorded app or review request
> and continue it instead of creating another app.

### Prepare The Handoff

1. Resolve the exact source origin/Space and installed Ideas Folder/Bases using
   `busabase`. Resolve one Idea, related Questions and BRD/MRD/PRD by exact ids;
   titles alone are not identity. Apply
   [document-readiness.md](document-readiness.md) and the professional review
   protocol. Missing answers, blocking `gaps`, duplicate PRDs or incomplete
   relevant reads stop the handoff. Non-blocking assumptions may remain only
   when identified with their validation plan; never turn `unknown` into fact.
2. Show a compact handoff packet with:
   - source origin/Space and exact Idea record id, plus its domain `record-id`;
   - exact BRD/PRD record ids, document `version` and canonical commit ids when
     exposed by the API; copy actual record links returned by Busabase;
   - reviewed canonical PRD body, BRD problem/user/value, user stories, main
     workflow, testable acceptance criteria, explicit non-goals and remaining
     non-blocking unknowns/dependencies; include MRD when it affects scope;
   - relevant pending ChangeRequest ids/links and status, separately labeled
     as proposals; approved-but-unmerged content is still not canonical;
   - prior handoff results from this Idea's `notes`/`agent-next-action`.
   If a commit id is unavailable, retain record id, document version and read
   time; do not fabricate one. Do not export credentials.
3. Ask the operator to confirm **this packet**. Reuse an explicit confirmation
   already given for the same packet. Re-read canonical heads before starting
   the build; if requirements changed, show the difference and reconfirm the
   changed scope. A general “continue” or the UI's ready label does not approve
   a newly changed PRD.

### Let The Public Creator Build

Pass the packet as requirements, not as an already approved blueprint. Let
`busabase-app-creator` resolve only undecided choices: create/maintain,
Cloud/Desktop and exact target, source ownership, validation mode and build
route. Confirm the **build target** separately from the **Ideas source**; they
may be the same Space or different selected environments. Preserve choices the
user already supplied. A new app gets its own source project root; never use
the installed Ideas AirApp source as the new product's project.

The creator owns modeling, permission-aware ChangeRequests and verification;
follow its manual rather than copying its deployment steps into Ideas. A new
app gets a separate Folder and new workflow resources; do not repurpose Ideas'
four Bases. For maintenance, require the existing app's exact Space/AirApp
identity and authorized scope. The operator must approve the creator's
blueprint or maintenance plan before writes; confirming handoff does not
approve it. If a request remains pending, report its review link and wait for
authorized review without self-approving it. Building never authorizes external
sending, publishing or charging.

### Record And Resume

Append a result to this Idea's existing `notes` or `agent-next-action` through
a ChangeRequest: source document ids/versions, confirmed scope, actual target
origin/Space/Folder/AirApp ids and links (if created), local source location,
pending CR ids/links, verification result and next action. Preserve existing
notes and read back the merged field or report that this note itself is pending.
There is no `app-skill-name` column. Do not invent a handoff Base or app URL.

Before a repeated request, inspect these known artifacts and their canonical
state. Resume the same source/target/pending request. If results are ambiguous
or unrecorded, ask which existing artifact to use before creating another; do
not scan and repurpose similarly named apps.

### Existing Installations (Template 0.2.3)

Update the Agent-local Ideas skill and this reference. For a hosted Skill node,
update its manual/references and the existing AirApp `handoff-to-build` scenario
prompt through permission-aware changes, preserving other prompts and
customizations. Check pending updates first. Do not reinstall samples, recreate
Bases or overwrite app code for this instruction-only fix. AirApp runtime
**0.2.2** and schemaVersion **2** stay unchanged; these instructions need no
runtime restart. Earlier runtime fixes still require their documented upgrade.

## 中文

Ideas 负责把需求问清楚；后续可交给公开的 `busabase-app-creator`，按它的流程创建
Busabase Cloud/Desktop 工作空间应用。它不是自动生成应用的按钮；其他产品类型需
和用户另选构建工具。

### 安装与复制提示词

在外部 Agent 的项目中运行上面的公开安装命令，阅读安装后的两份技能。公开来源是
[busabase/skills](https://github.com/busabase/skills)，不需要私有创建器。安装失败先说明
真实报错，不要改用未知私有技能或绕过流程。

把下文两处括号换成实际链接，再交给 Agent：

> 请阅读[我的 Ideas 空间链接]里[这条灵感链接]对应的 `busa-ideas` 技能，核对已审阅的
> PRD 和剩余问题，先告诉我准备交接哪个版本、做什么范围。有阻断问题先讲清楚。
> 我确认交接后，请用公开的 `busabase-app-creator` 提出应用方案，等我批准方案再创建
> 资源。保留 Ideas 的数据；如果之前已经开始，先核对记录里的应用和待审请求，继续
> 原来的工作，不要再建一个应用。

### Agent 应如何交接

1. 锁定准确的源服务地址、空间、Ideas 文件夹和数据表。用确切记录 ID 查这条灵感、
   问题及 BRD/MRD/PRD，不凭标题判断。按[审阅标准](document-readiness.md)检查；
   必答项、阻断缺口、多份 PRD 或相关记录未读完整时先补齐。非阻断未知项可保留，
   但要写明假设和验证方法。
2. 展示交接材料：源空间、灵感记录 ID（并列业务 `record-id`）、BRD/PRD 实际记录
   ID、文档版本及 API 可取得的正式提交 ID、真实记录链接、正式 PRD 全文、BRD 的
   问题/用户/价值、用户故事/主流程/可验证验收标准、不做什么、尚存疑问和依赖；
   影响范围时带上 MRD。待审修改单列真实请求 ID、链接、状态，已批准未合并仍是
   提案。读不到提交 ID 就保留记录 ID、版本和读取时间，不编造，也不得带出凭据。
3. 请用户确认这一份材料；同一份材料已明确确认就复用。构建前再读正式版本，若已
   变化，展示差异并确认变化后的范围，不能凭旧确认构建新内容。
4. 交给公开创建技能，由它处理尚未决定的新建/维护、Cloud/Desktop、准确目标、源码
   归属、验证方式和应用方案。**Ideas 源空间与构建目标须分别确认**，可以相同，也
   可以不同；已作出的选择不再重问。新产品用自己的源码目录，不能改造 Ideas 应用
   目录。用户还要批准构建方案或维护计划，**确认交接不等于批准方案**。新应用用
   独立文件夹及业务资源，不能把 Ideas 四张表当新应用业务库。维护已有应用须指明
   准确空间、AirApp 与授权修改范围。
5. 构建、写入和验证遵循创建技能。权限不足产生待审请求时报告真实链接，等待有权限
   的人处理，不能自批；构建也不授权发信、外部发布或收费。
6. 通过变更请求，在原灵感已有 `notes` 或 `agent-next-action` 中追加文档 ID/版本、
   确认范围、实际目标空间与应用/文件夹 ID 和链接、源码目录、待审请求、验收结果
   及下一步，保留旧备注并读回结果；备注本身待审也要说明。没有 `app-skill-name`
   字段，不另建交接表。重试时核对这些已知目标并继续原工作；记录不清就问用户
   指哪个应用，不按相似名称挪用别的应用，也不重复创建。

### 已有安装如何更新

模板 **0.2.3** 只更新手册、参考文件和 AirApp 的“交给 Agent 构建应用”场景提示词。
外部 Agent 更新本地 Ideas 技能；托管 Skill 节点通过变更请求更新手册/参考文件及已有
`handoff-to-build` 提示词，先检查待审更新，保留其他提示词和自定义内容。
不重装样例、不重建数据表、不覆盖应用代码。AirApp 运行代码仍为 **0.2.2**，
schemaVersion 仍为 **2**，手册更新无需重启；此前运行代码修复仍需按各自说明更新
并重启，不能用更新手册代替。
