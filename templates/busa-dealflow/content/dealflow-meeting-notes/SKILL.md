---
name: dealflow-meeting-notes
description: Turn a meeting transcript, call notes or a filed document into one structured meeting record in the Deal Flow desk — minutes, key findings, open questions and follow-ups — linked to the right existing project without creating a duplicate, then update the project's latest finding, next step and last-meeting date. Use when someone hands over a recording transcript, 会议转写, 会议纪要, 访谈记录, BP or board pack and says 整理 / 归档 / log this meeting. Read busa-dealflow first.
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:deal-flow
---

# 会议转写 → 纪要 → 待跟进

先读同文件夹的 `busa-dealflow`（表、字段和必须遵守的规则）。这里只讲整理一次会议的步骤。

## 输入

- 一份会议转写或笔记（可能有识别错误、口头简称、粤语或中英混杂）。
- 或一份资料（BP、董事会材料、尽调报告）——这时 `kind` 用 `document`。
- 用户可能顺口说了「这是今天和云杉的会」，以用户说的为准。

`examples/sample-transcript-yunshan.md` 是一份虚构的示例转写，可以用来试跑整个流程。

## 步骤

1. **认出是哪家公司。** 从转写里找公司名、简称、创始人名字。在 `deals` 里按 `name`、`company`、`aliases`
   查，再用 `grep` 搜简称。
   - 找到唯一一家 → 用它。
   - 找到多家或拿不准 → 停下来问用户是哪一家。
   - 一家都没有 → 告诉用户「项目表里没有这家公司」，确认后再按 `busa-dealflow` 的字段新建（`stage` 一般是
     `first-meeting`），**不要**未经确认就建。
2. **判断类型和阶段。** `kind`：第一次见 → `intro`；之后的会 → `follow-up`；访谈客户/专家/管理层核实信息 →
   `diligence`；投委会 → `ic`；已投项目的例会 → `board`；只是收到资料 → `document`。`phase` 跟着项目阶段走：
   线索/初步接触/尽调 → `pre`，投决 → `during`，已投 → `post`。
3. **写会议记录**（一次会议一条，`bases create-change-request` 写进 `meetings`）：
   - `title`：`YYYY-MM-DD · 项目名 · 类型中文`。
   - `summary` 纪要：4–8 条事实，谁说了什么、数字是对方口述还是已核实，写清楚。
   - `highlights` 关键发现：2–4 条，**每条一行、能单独读懂**，管理层在本周总览里逐条看。写「新」信息——和上次会议比，哪些疑问解决了、哪些变化了。
   - `questions` 疑问与风险：还没核实的、对方提到的风险。
   - `recorded-by` 写交转写的人；`logged-via` 写你自己是哪个智能体；`attendees` 我方在前、分号后写对方。
   - `transcript`：放原文（超过约 2 万字就放摘录，并提醒用户把原件作为附件上传）。
   - 不写金额、估值、收入利润等财务数字——即使转写里有。写成「对方介绍了经营情况，材料已归档」。
4. **拆待跟进**（`bases create-bulk-change-request` 一次写进 `followups`）：只收**有人答应要做**的事。每条要有
   `owner`（对方答应的事，`owner` 写我方跟进人，并在标题里写清楚，如「催云杉提供两家客户联系人」）、`due-on`
   （按会上说的日期换算成 YYYY-MM-DD；没说日期就不填）、`deal`、`meeting`（第 3 步那条记录的 id）、`status: open`。
   先看同一项目下有没有内容相同、还没完成的跟进，有就更新它而不是重复建。
5. **更新项目**（`records change-request --operation update`）：`latest-finding` 换成本次最重要的一条发现，
   `next-step` / `next-step-due` 换成最近的一条跟进，`last-meeting-on` 写会议日期；转写里出现了新的简称就补进
   `aliases`。**阶段只有会上明确做了决定才改**（例如合伙人会上同意进入尽调），并在纪要里写明。
6. **回报用户**：一句话说清写了什么（1 条会议、N 条待跟进、项目更新了哪些字段），附上会议记录和项目的链接；如果任何一步返回 `in_review`，说明在等谁审。

## 写入示例

```bash
npx --yes busabase-cli@latest bases create-change-request --base-id <meetings 表 id> \
  --fields-json @meeting.json --message "记录云杉智造 11-05 尽调访谈：交付周期与算法团队核实" \
  --playbook skill:<本技能节点 id> --output json
# meeting.json 里关联字段写成数组： "deal": ["<项目记录 id>"]
npx --yes busabase-cli@latest bases create-bulk-change-request --base-id <followups 表 id> \
  --records-json @followups.json --message "云杉智造 11-05 访谈产生的 3 条待跟进" \
  --playbook skill:<本技能节点 id> --output json
npx --yes busabase-cli@latest records change-request --record-id <项目记录 id> --operation update \
  --fields-json @deal-update.json --message "云杉智造：更新最新发现、下一步和最近会议日期" \
  --playbook skill:<本技能节点 id> --output json
```

## 检查清单（交付前自查）

- [ ] 没有新建重复项目；会议的 `deal` 指向正确的公司。
- [ ] 标题格式正确，`kind`/`phase` 合理。
- [ ] 关键发现每条一行，且是本次会议的新信息。
- [ ] 每条待跟进都有负责人；有日期的换算对了。
- [ ] 没有写入财务数字；没有碰「投决会意见」表（除非用户是管理层且明确要求）。
- [ ] 给用户的回复里有链接。
