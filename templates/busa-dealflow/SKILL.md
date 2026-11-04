---
name: busa-dealflow
description: Shared deal-flow desk for an investment team — one record per company, every meeting, filed document and post-investment update linked to it, follow-ups with owners, a weekly leadership digest, and a leadership-only IC table. Use when the user hands over a meeting transcript or notes about a company, asks where a project stands or what the team saw this week, adds or moves a project, closes a follow-up, or asks for the weekly digest; read this first, then dealflow-meeting-notes or dealflow-weekly-digest for those jobs. 投资团队的 Deal Flow 共享空间：整理会议纪要、查项目进展、本周团队看了哪些项目、写管理层周报时先读本手册。
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:deal-flow
    - industry:venture-capital
    - risk:gated-write
  busabase:
    template: true
    folderSlug: busa-dealflow
    resources:
      - deals
      - meetings
      - followups
      - digests
      - ic-notes
    risk: gated-write
---

# 投资 Deal Flow 团队手册

这个文件夹是投资团队共用的「项目—会议—待跟进」空间。每个人继续用自己习惯的智能体（Codex、WorkBuddy、Claude
Code……），智能体以**本人的账号和权限**读写这里。团队要的只有一个闭环：

```txt
开完会 ──► 转写交给自己的智能体 ──► 找到项目（绝不重复建） ──► 写纪要 + 关键发现 + 待跟进 ──► 更新项目
   ▲                                                                                      │
   └──── 负责人关闭跟进 ◄── 管理层看「本周总览」/ 周报 ◄── 同事用各自的智能体查询同一份信息 ◄──┘
```

整理会议的具体步骤在 `dealflow-meeting-notes`，写周报在 `dealflow-weekly-digest`。本文件规定所有人都要守的数据约定。

## 表和字段

**空间**：用户的账号可能属于多个空间。用 `--space-id <团队空间 ID>` 指定（接入提示词里写了 ID），不要用 `space use` 改用户的默认空间。

表按安装时的 `resourceKey` 识别（文件夹里看到的名字可能被管理员改成中文，slug 可能带前缀）。找表的方法：
`npx --yes busabase-cli@latest bases list --output json`，取本文件夹下 slug 以 `-deals`、`-meetings`、
`-followups`、`-digests`、`-ic-notes` 结尾的那几张。

### `deals` 项目（一家公司一条，所有东西都挂在它下面）

| 字段 | 含义 | 规则 |
| --- | --- | --- |
| `name` 项目 | 团队日常叫法，如「云杉智造」 | 必填；就是显示名 |
| `company` 公司全称 | 工商全称 | 必填；**查重的主键** |
| `aliases` 别名与常见叫法 | 简称、英文名、转写里常见的误写 | 逗号分隔；每次在转写里遇到新叫法就补上 |
| `stage` 阶段 | `sourcing` 线索 · `first-meeting` 初步接触 · `diligence` 立项尽调 · `ic` 投决 · `portfolio` 已投·投后 · `on-hold` 暂缓 · `passed` 已放弃 | 必填；只在有会议或决定支持时改 |
| `sector` 赛道 | `ai-infra` / `enterprise` / `robotics` / `healthcare` / `consumer` / `other` | |
| `round` 轮次 | 文字，如「A 轮」 | |
| `owner` 项目负责人 | 人名 | 必填 |
| `team` 小组 | `tech` / `healthcare` / `consumer` | |
| `one-liner` 一句话介绍 | 做什么、卖给谁 | |
| `latest-finding` 最新关键发现 | 最近一次会议最重要的一条发现 | 每次写会议后更新 |
| `next-step` / `next-step-due` 下一步 / 日期 | 团队要做的下一件事 | 每次写会议后更新 |
| `last-meeting-on` 最近会议 | 日期 | 每次写会议后更新 |
| `source` 来源 | 谁推荐、哪个活动 | |

### `meetings` 会议与资料（每条只关联一个项目）

会议、电话、尽调访谈、投决会、投后例会、归档资料都是这一张表，用 `kind` 区分：`intro` 首次会议 · `follow-up`
跟进会议 · `diligence` 尽调访谈 · `ic` 投决会 · `board` 投后例会 · `document` 资料归档。`phase` 是 `pre` 投前 /
`during` 投中 / `post` 投后。

- `title` 固定格式：`YYYY-MM-DD · 项目名 · 类型`，例如 `2026-11-05 · 云杉智造 · 尽调访谈`。
- `deal` 必填，关联到唯一一个项目。一次会议聊了两家公司，就写两条。
- `summary` 纪要（Markdown 列表，事实）、`highlights` 关键发现（每行一条，管理层会逐条看）、`questions` 疑问与风险。
- `recorded-by` 记录人、`attendees` 参会人（我方在前，分号后写对方）、`logged-via` 用哪个智能体整理的（Codex / WorkBuddy / Claude Code / 手动）。
- `transcript` 放转写原文（太长就放摘录，原件用 `files` 附件）。

### `followups` 待跟进

`title` 写成一件能完成的事；`deal` 必填；`meeting` 写来源会议；`owner` 必填；`due-on` 截止日期；
`status`：`open` 待办 · `in-progress` 进行中 · `done` 已完成 · `dropped` 已取消；完成时填 `done-on` 并在 `notes` 写结果。

### `digests` 管理层周报

每周一条，规则见 `dealflow-weekly-digest`。

### `ic-notes` 投决会意见（仅管理层）

投决结论和合伙人意见。**安装后管理员要把这张表设为仅管理层可见**（表的「权限」里把可见范围改为私有，再授权给管理层）。
看不到这张表的人，他们的智能体也看不到——在列表、搜索、grep 里都不存在。会议表里的投决会记录只写「已召开，结论见管理层表」。

## 必须遵守

1. **一家公司只有一条项目记录。** 写任何东西之前先查重：按 `name`、`company`、`aliases` 三个字段查，再用
   `grep` 在项目表里搜简称。找到了就用它；拿不准是不是同一家，**先问人**，不要新建。
2. **所有写入都走变更请求**（busabase-cli 的 `*-change-request` 命令），写清楚 `--message`（动词 + 什么 + 为什么），
   并带上 `--playbook skill:<本技能节点 id>`。不要传 `autoMerge`，看返回的 `status`：merged 就是已生效，in_review 就告诉用户在等谁审。
3. **你以使用者本人的权限工作。** 查不到某张表，就是这个人没有权限：如实说「这张表没有共享给你」，不要绕过，
   不要向用户索要别人的密钥，不要把管理层表的内容抄到共享表里。
4. **不写敏感财务数据。** 基金回报、被投企业的收入利润估值等数字不进共享表；原件放附件，正文只写「材料已归档」。
5. **阶段只在有依据时改**，并在项目的 `latest-finding` 或会议纪要里写明依据。
6. **每次写完把链接发给用户**：`https://<Busabase 地址>/dashboard/<空间 id>/base/<表 slug>/<记录 id>`。

## 常用查询（只读）

- 某个项目的全貌：先按名字找到项目，再查 `meetings` 和 `followups` 里 `deal` 指向它的记录，按日期排序，分投前/投中/投后讲。
- 本周团队看了哪些项目：`meetings` 里 `held-on` 在本周一到今天的记录，按 `deal` 归并，列出参会人和关键发现。
- 我还欠哪些跟进：`followups` 里 `owner` 是我、`status` 不是 `done`/`dropped` 的，逾期的排前面。

```bash
# 最近 50 条会议，按日期倒序；再在本地按 held-on 过滤出本周
npx --yes busabase-cli@latest records query --base-id <meetings 表 id> --limit 50 \
  --sort-json '{"fieldSlug":"held-on","fieldType":"date","direction":"desc"}' --slim --output json
# 按项目名精确找项目；找不到再用 grep 搜简称和别名
npx --yes busabase-cli@latest records by-field-text --base-id <deals 表 id> --field-slug name --value-text 云杉智造 --output json
npx --yes busabase-cli@latest grep --pattern "云杉" --base-ids <deals 表 id> --output json
```

## 这个应用不做什么

- 文件夹里的 Deal Flow 应用只读：它展示本周总览、项目时间线、待跟进和接入提示词，不写任何数据。
- 不发邮件、不对外联系、不自动同步旧系统。旧系统的数据要导入，另行商定导入方案后再做。
- 不替人做投资判断；关键发现和阶段变化都要能对应到某次会议。
