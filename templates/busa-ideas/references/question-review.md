# Saving Answers And Finding Their Review

## English

1. Open an idea, choose **Questions**, and enter your answer. Click **Save
   answer** once. An optional follow-up also offers **Skip**; a required-field
   question cannot be skipped.
2. Busabase uses your actual permissions. With write access, the answer saves
   immediately. Otherwise the card says **Answer submitted for review** (or
   **Skip submitted for review**), keeps the submitted text visible, and
   replaces the editing controls with **Open review in Workspace Inbox**.
   If the runtime cannot resolve a dashboard URL, open the workspace's Inbox
   from the Busabase sidebar.
3. The question remains officially open until a reviewer approves **and
   merges** the request. A required-field answer creates two related changes,
   one for the Question and one for the Idea: both must merge before its gate
   clears. Refresh the app after review to read the saved answer.
4. Refreshing or retrying the same pending answer reuses its request. A
   different answer or skip already awaiting review is not overwritten. For a
   conflict, inspect the Inbox first. **Changes requested** is still an active
   review: open and revise the existing request in the Inbox; do not create a
   duplicate submission. Only a terminal **rejected** request permits a new
   submission. For that terminal rejection, the card retains the
   previous answer as a draft: read the reviewer's reason, revise it if needed,
   and submit again. Closing a request also allows a new submission.
5. If there are too many review requests to check within the bounded page,
   the app disables new answer submissions and directs you to the Inbox.
   Resolve the backlog before trying again. If the write succeeded but a
   refresh failed, the message distinguishes that from a failed submission.

### Upgrading an installation you already use

The answer-review fix is version **0.2.1** (schemaVersion stays 2). A repository fix updates the public template; it does not replace the AirApp
already installed in your workspace. Ask an Agent to read the `busa-ideas`
skill and compare the installed AirApp with the latest public template.
Name the exact workspace and existing AirApp, and have the Agent check pending
AirApp changes first. Update only the relevant app files and skill instructions
through ChangeRequests; preserve the existing Folder, Bases, fields, record ids,
data, node prompts, and unrelated customizations. Do not reinstall seed records
or create a second app. Once that code update is merged, restart the AirApp and
verify a pending ordinary answer and skip, refresh, review, and merge. Existing
duplicate requests must be reviewed individually; this fix does not close them
or approve them automatically.

## 中文

1. 打开一条灵感，进入 **问题**，填写后点击一次 **保存回答**。普通追问也可以选择
   **跳过**；必填项问题不能跳过。
2. 有写入权限时会立即保存。没有写入权限时，卡片明确显示「回答已提交审核」或
   「跳过操作已提交审核」，保留已提交的回答，并提供 **到空间收件箱查看审核**。
   如果当前运行环境无法确定收件箱链接，请从 Busabase 侧栏打开空间收件箱。
3. 审核人审核并合并后，正式问题才变成已回答或已跳过。必填项的回答同时涉及问题与
   灵感字段两条修改，两项都要合并，推进条件才会更新。审核后刷新应用查看正式结果。
4. 刷新或重试相同的待审回答会复用原请求。已有不同回答或跳过操作待审时，先去收件箱
   检查；发生冲突也先处理冲突。**要求修改（changes_requested）仍是进行中的审核**，
   请到收件箱修改现有请求，不要再建一条。只有**已拒绝（rejected，审核已结束）**
   才能新建提交；此时应用保留原回答草稿，请查看拒绝原因、修改后再提交。
   关闭旧请求（abandoned）后也可以重新提交。
5. 审核请求超过单次核对范围时，应用会暂停新的回答提交并提示先处理收件箱；不要因
   为看不到某条请求就再次提交。写入成功但刷新失败时，也会明确提示先确认审核状态。

### 更新已经安装的应用

回答审核修复版本为 **0.2.1**，schemaVersion 仍为 2，无需迁移数据。公开模板修复不会自动覆盖空间里已安装的应用。请把准确的空间和 AirApp 告诉 Agent，
让它先阅读 `busa-ideas` 技能，检查待审的应用修改，对比已安装代码与最新公开模板。
通过变更请求更新相关应用文件与操作说明，保留原文件夹、数据表、字段、记录 ID、
数据、节点提示词和其他自定义内容；不要重新灌入示例记录或创建第二个应用。
代码修改合并后，重启 AirApp，再验证普通回答、跳过、刷新以及审核合并后的状态。
已有重复请求仍需逐条检查；修复不会自动关闭或批准它们。
