# Prompt Pack / 提示词包

Four adaptable prompts that run the desk. They are instructions to your
agent in chat — keep the approval boundary in the wording: a chat
instruction is guidance, and actual sending permission still belongs to
your setup and the verdicts you give per draft.

四个可改用的提示词，对应建台、每日分诊、批准后执行、周复盘。审批边界要写进
措辞里：聊天指令是引导，真正的发送许可来自你的配置和你对每份草稿的裁决。

## P0 — Build the desk / 建台

> Create a folder "LinkedIn Sales Desk". Reuse Companies and Deals from
> the Busa CRM template. Create Contacts, Messages, Replies, Actions and
> Experience with the fields from my design, plus a Doc "ICP and voice"
> and a Skill "LinkedIn outreach operations". Show me the structure
> first; add no sample customers.

> 新建文件夹「LinkedIn 销售台」。公司与商机复用 Busa CRM 模板的
> Companies / Deals。按我的设计建联系人、消息、回复、处理、经验五张表，
> 再加 Doc「ICP 与话术口径」和 Skill「LinkedIn 外联作业」。先给我看结构，
> 不要填入任何示例客户。

(Installing this template does P0 for you; the prompt is for building the
same desk by hand in an existing Space. 模板安装即完成 P0；这条提示词用于
在已有 Space 里手工搭同样的台。)

## P1 — Daily triage / 每日分诊

> Read today's new LinkedIn conversations from [the export I gave you /
> the connected messaging channel]. Match senders to Contacts by profile
> URL; unmatched senders become candidate contacts marked "unverified".
> Log every message in Messages, deduplicated by Message ID, and classify
> by intent. Draft replies for "interested" and "question" only, save
> them in Replies as "awaiting approval", and show me the drafts here.
> **Do not send anything.** Finish with today's report: new
> conversations, drafts waiting on me, threads stalled over seven days.

> 读取今天新的 LinkedIn 对话，来源是[我给你的导出文件 / 已接通的消息
> 通道]。按主页 URL 把发信人匹配到联系人表；匹配不上的建为候选联系人
> 并标「未核验」。每条消息按消息 ID 去重落入消息表，并按意图分类。只为
> 「有意向」和「咨询」两类起草回复，存入回复表标为「待审批」，并把草稿
> 带回聊天给我看。**不要发送任何内容。** 最后给我日报：新对话数、等我
> 审批的草稿数、超过七天没有动静的线程。

## P2 — Execute after approval / 批准后执行

> Send the replies in the versions I approved. Write the sent body, time
> and message ID back to each Replies row, and add the sent messages to
> Messages. Create the follow-up Actions we agreed, with due dates. If a
> send fails, stop and report it — do not rephrase and retry on your own.

> 按我批准的版本发送回复。把发送正文、时间和发送消息 ID 写回每条回复
> 记录，并把已发消息落入消息表。按我们说好的建处理表事项，带到期日。
> 发送失败就停下来报告——不要自行改写重试。

## P3 — Weekly review / 周复盘

> Summarise this week's Replies and Actions. List candidate Experience
> rows with their evidence — message, my approval note, outcome. For
> those you recommend adopting, draft the exact change to the "LinkedIn
> outreach operations" Skill as a diff. Promote nothing until I confirm.

> 汇总本周的回复表与处理表。列出候选经验及其证据——消息、我的审批意见、
> 后续结果。对你建议采纳的，给出写入「LinkedIn 外联作业」Skill 的确切
> 改动 diff。在我确认前不要晋升任何一条。
