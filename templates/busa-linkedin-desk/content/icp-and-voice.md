---
name: ICP 与话术口径
description: 人的标准：目标客户、可说与不可说、价格与承诺红线、升级规则。Agent 每次起草前必读；与经验冲突时以本文为准。
position: 6
agentPrompts:
  - key: check-draft-against-voice
    label:
      en: "Check a draft against the ICP and voice rules"
      zh-CN: "按口径检查一份草稿"
    intent: read-only
    body:
      en: "Read the `busa-linkedin-desk` skill in this folder, then check the draft I name against this doc: wrong audience, anything unsayable, any price, promise or date the red lines reserve for a human. List each problem with the line it breaks. Do not edit the draft."
      zh-CN: "先阅读本文件夹的 `busa-linkedin-desk` skill，然后按本文检查我点名的草稿：对象不对、说了不可说的、碰了价格、承诺或日期这些红线逐条列出，并注明违反的是哪一行。不要修改草稿。"
  - key: update-voice
    label:
      en: "Record a new standard in this doc"
      zh-CN: "把新标准写进口径"
    body:
      en: "Read the `busa-linkedin-desk` skill in this folder and follow its workflow, then fold the standard I describe into the right section of this doc, keeping the rest unchanged, and show me the change before proposing it."
      zh-CN: "先阅读本文件夹的 `busa-linkedin-desk` skill 并遵循其工作流程，然后把我描述的标准写进本文合适的章节，其余内容保持不变，提交变更前先给我看改动。"
---

# ICP 与话术口径

这是人的标准，不是 Agent 的方法。Agent 每次起草回复前必读本文；经验表里的条目与本文冲突时，以本文为准，冲突本身要在周复盘时提出。带「（待填）」的条目请在正式启用外联台前填完——空着的口径等于没有口径。

## 1. 目标客户（ICP）

- 行业：（待填，如物流、跨境电商、专业服务）
- 公司规模：（待填）
- 对话角色：（待填，如运营负责人、IT 经理、创始人）
- 买入信号：（待填，如主动询问部署/集成/迁移、团队扩张、现有工具到期）
- 明确排除：（待填，如同行调研、求职、在校学生、无关推销）

## 2. 可说与不可说

可说：

- 产品已公开的能力与部署方式（以官网与正式文档为准）
- 部署与实施的一般周期区间
- （待填）

不可说：

- 未发布的功能与路线图时间点
- 客户名称与案例细节（未经对方许可）
- 竞品的贬损性评价
- （待填）

## 3. 红线：永远升级给人，Agent 不办

- **价格**：不报价、不给折扣暗示；对方追问时只答「需要按场景评估」，并在处理表建「升级人工」。
- **承诺**：不承诺功能交付、效果数字、合同条款。
- **时间**：不承诺上线日期与交付日期；可以说一般周期区间（见第 2 节）。

## 4. 升级规则

出现以下任一情况，停止起草，在处理表建「升级人工」并说明原因：

- 对方提出价格、合同、法律、安全审查类问题
- 对方是现有客户且涉及故障、投诉、续约
- 意图判断拿不准，或对话出现情绪化表达
- 对方身份无法核验（联系人表标为未核验且无更多线索）

## 5. 话术骨架（只给结构，不给成品）

- **破冰**：一句对方业务相关的观察 → 一句我们能解决的具体问题 → 一个低门槛问题。
- **跟进**：先接上文（引用对方说过的话）→ 给新信息或新材料 → 一个明确的小请求（电话/资料/转介绍）。
- **异议**：先确认对方的顾虑成立的部分 → 给事实或区间 → 把决定留给对方，不催促。

## 6. 语气

- 像同行之间的工作沟通：具体、克制、不夸张。
- 一次只推进一件事；不用感叹号堆砌热情；不用「赋能」「抓手」一类空词。
