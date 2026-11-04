---
name: dealflow-weekly-digest
description: Write the weekly leadership digest for the Deal Flow desk — which projects the team saw this week, the key findings, stage changes, and the follow-ups that are overdue or due next week — as one record in Weekly digests, every line traceable to a meeting or follow-up. Use when asked for 周报, 管理层周报, weekly digest, 本周团队看了哪些项目 written up, or a one-minute leadership version. Read busa-dealflow first.
metadata:
  category: operations
  tags:
    - surface:busabase
    - workflow:deal-flow
---

# 管理层周报

先读同文件夹的 `busa-dealflow`。周报回答管理层的三个问题：**本周团队看了哪些项目、有什么关键发现、哪些需要跟进。**

## 步骤

1. **确定周期。** 默认本周一到周日（ISO 周，标题用 `YYYY-Www`，如 `2026-W45`）；用户说「上周」就往前推一周。
2. **读数据**（只读，每张表一页 50 条以内，按日期排序）：
   - `meetings`：`held-on` 在周期内的全部记录。
   - `followups`：未完成（`open` / `in-progress`）且 `due-on` 在周期结束后 7 天内或已逾期的；以及本周 `done-on` 的。
   - `deals`：上面涉及到的项目（看 `stage`、`owner`）。
   - 上一份周报（`digests` 里 `period-end` 最近的一条），用来对比阶段变化。
3. **写正文 `body`（Markdown）**，四节，每一行都要能对应到一条记录：
   - `## 本周看了哪些项目`：每个项目一行——**项目名**（阶段，负责人）：本周开了什么会、谁参加。
   - `## 关键发现`：从会议的 `highlights` 里挑最重要的，按项目分组，每条注明日期。
   - `## 阶段变化`：和上周比，哪些项目换了阶段（没有就写「无」）。
   - `## 需要跟进`：逾期的排前面，写负责人和截止日期；本周完成的另起一行「已完成」。
4. **写 `for-leadership` 需要管理层关注**：最多 3 条，需要合伙人拍板或出面的事。
5. **写入** `digests`：`title` = `2026-W45 投资团队周报`，`period-start`/`period-end`、`projects-seen`（看过的项目数）、
   `meetings-held`（会议与资料条数），`status: draft`。同一周已有草稿就更新它，不要再建一条。由人确认后改成 `final`。
6. **回报用户**：一段五行以内的摘要 + 周报链接。

## 边界

- 只汇总已有记录，不推测、不补充会上没说的结论。
- 如果你能看到「投决会意见（仅管理层）」，**不要**把其中内容写进周报——周报全员可见。只能写「澜舟医疗：投决会已召开，结论见管理层表」。
- 不写财务数字。
