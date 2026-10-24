# PRD Stage, Document Review, And Handoff

## English

**PRD is a stage, not a finalization action.** Advancing to it does not create,
complete, approve, or hand off a document. Earlier rung progression is unchanged.

1. Open the Idea's **Overview**. At PRD, the app lists unmet conditions. Open
   **PRD** to read the body and blocking `gaps`; answer questions from
   **Questions**. Ask the Agent to reconcile missing Idea information,
   duplicate PRDs, or a missing document. The app does not invent answers.
2. In Documents, the Agent/operator maintains the existing `status`, `body`,
   and `gaps` through ChangeRequests. Follow the full
   [professional document review](professional-documents.md) before proposing
   `status: 已完善`; keep blocking omissions in `gaps` and retain draft status
   while they remain. Changing a label alone never resolves a missing answer.
3. A document meets saved conditions only when its canonical body is nonempty,
   status is `已完善`, and `gaps` has no nonblank entries. List/detail badges and
   document metrics share this check. An inconsistent complete status with an
   empty body or remaining gaps displays as draft without rewriting the record.
4. Handoff also requires PRD stage, exactly one PRD, all four required Idea
   fields (`one-liner`, `who`, `problem`, `why-now`), and no open consultant
   questions for that Idea. Parked Ideas are never ready. Partial reads cannot
   prove readiness; the app does not silently scan the workspace or assume an
   unloaded record is complete. Lists and counts cover loaded records.
   Click **Recheck this Idea** to load exactly one page (at most 50 documents
   and 50 questions) filtered by this Idea's `idea-id`, plus one exact Idea
   lookup and at most 20 active, 20 rejected Question reviews, and 20 active
   Idea ChangeRequests. No cursor-following scan runs. This allows a small
   Idea in a large workspace to be verified independently. If its own related
   records or review history still exceed the page budget, ask the Agent to
   inspect them; the UI continues to state that readiness is unconfirmed.
   The same button is available after merges; failures can be retried, and
   navigating away prevents a late response from replacing the new selection.
5. Pending, approved-but-unmerged, or changes-requested proposals do not make
   a draft complete. Review and merge each relevant document, Idea, and
   Question change in the Workspace Inbox, then refresh. Independently reviewed
   records can still leave blockers when only one side has merged.
6. Passing the recorded conditions means **Confirm handoff**. Read the rendered
   document, validate its evidence and assumptions using the professional
   review protocol, then explicitly tell the Agent whether to hand it to an
   app creator. Nothing builds automatically.

The app checks saved metadata and missing content, not the meaning, quality,
correctness, or evidence of arbitrary prose. A body and an empty gaps list do
not substitute for professional review. No human signoff field, new workflow
state, or automatic status mutation is added.

### Upgrade an existing installation (0.2.2)

Give the Agent the exact Space and existing Ideas AirApp. Ask it to read the
latest `busa-ideas` skill, compare 0.2.2 with installed code, check pending
AirApp proposals, and propose the relevant app/manual updates. Preserve the
Folder, Bases, fields, ids, answers, document bodies, existing node prompts and
customizations; do not reinstall samples or create a second app. No schema
migration is required. After the app-code change merges, restart and verify a
PRD draft with gaps, an inconsistent completed label, and a reviewed document
after its changes merge. Public template updates do not replace old workspace
code or approve existing content.

## 中文

**PRD 是层级，不是定稿操作。** 推进到 PRD 不会自动创建、完善、批准或交接文档，
此前各层的推进规则保持不变。

1. 打开灵感的 **概览**，查看缺少的条件；进入 **PRD** 查看正文与缺口，进入
   **咨询师追问** 回答问题。缺少灵感信息、存在多份 PRD 或尚无文档时，请让 Agent
   核对并补齐，不要仅修改状态文字。
2. Agent 或操作者通过变更请求维护文档表里原有的 `status`、`body`、`gaps`。
   提议 `已完善` 前按[专业文档审阅标准](professional-documents.md)检查真实内容；
   仍影响决策的遗漏要保留在 `gaps`，文档维持草稿。
3. 正式正文非空、正式状态为 `已完善`、缺口没有非空条目时，文档才计入
   「满足已保存条件的文档」。列表和详情使用同一规则。状态已完善但正文为空或仍
   有缺口时，界面按草稿展示并说明不一致；不会悄悄改写文档记录。
4. 交接还要求灵感位于 PRD、有唯一一份 PRD、四项必填信息齐全，且该灵感没有未
   回答问题。已搁置灵感不能交接。不完整的读取不能证明已完成；界面不会把未读
   内容当成已经完成，也不会暗中扫描全空间。列表和统计只覆盖已加载的记录。
   点击 **重新核对此灵感**，只读取与它的 `idea-id` 精确匹配的一页文档和一页问题，
   各最多 50 条，加上单条灵感及各最多 20 条相关审核记录，不会自动翻页扫描。
   因而空间里其他记录超过一页时，仍能核对这一条灵感。如果它自身的记录或需核对的
   审核历史仍超出范围，请让 Agent 检查，界面会保留未核对完整的提示。审核合并后也
   可使用此按钮；读取失败可重试，离开当前灵感后不会被迟到结果覆盖。
5. **待审、已批准但未合并、要求修改，都不等于正式内容已经完善。** 到空间收件箱
   审阅并合并相关文档、灵感和问题修改，再刷新应用。几条请求各自独立，只合并
   其中一条可能仍有条件没有满足。
6. 条件满足后显示 **待你确认交接**。请阅读渲染后的全文，核对证据、假设和验收
   标准，再明确告诉 Agent 是否交给应用创建 Agent；应用不会自动开始构建。

应用只核对已保存字段和缺失内容，不自动判断任意正文的质量、真实性或证据是否充分。
这次没有新增人工签字字段、业务流程状态或自动定稿操作。

### 更新已有安装（0.2.2）

把准确的空间和已有 Ideas AirApp 链接交给 Agent，让它阅读最新技能、对比 0.2.2 与
已安装代码、检查待审应用修改，再通过变更请求更新相关应用文件和操作说明。
保留原文件夹、数据表、字段、记录 ID、已有回答、文档正文、节点提示词及自定义内容；
不要重新灌入示例或创建第二个应用，无需迁移数据。应用修改合并后重启，再验证有缺口
的 PRD 草稿、不一致的已完善状态，以及相关审核合并后的文档。公开模板更新不会自动
覆盖旧代码，也不会自动批准已有内容。
