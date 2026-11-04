# Investment Deal Flow · 投资 Deal Flow

A shared space for an investment team whose people already use their own agents (Codex, WorkBuddy,
Claude Code…). Everyone keeps their agent; the agents share one Busabase folder.

- **Projects** — one record per company: the single entry every meeting, filed document, follow-up and post-investment update links to.
- **Meetings & files** — each meeting, diligence interview, IC meeting, board meeting or filed document, linked to exactly one project, tagged pre / in-process / post-investment.
- **Follow-ups** — what someone promised, with an owner and a date.
- **Weekly digests** — what the team saw this week, what it found, what needs chasing.
- **IC notes (leadership only)** — restrict this table after install; members and their agents then cannot see it at all.
- **Deal Flow app** (read-only) — this week's overview for leadership, one timeline per project, a follow-up board, and a *Connect your agent* page with a ready-to-paste prompt that names this space.
- **Playbooks** — `busa-dealflow` (data rules: one company, one record), `dealflow-meeting-notes` (transcript → minutes, findings, follow-ups; ships an invented sample transcript), `dealflow-weekly-digest`.

All sample data is invented (合成演示数据); no fund returns or portfolio financials.

## After installing

1. Restrict **IC notes** to leadership (table → permissions → private → grant partners).
2. Adjust the `busa-dealflow` playbook to your stages, sectors and required fields.
3. Share the prompt on the app's *Connect your agent* page with the team.

Permissions are per folder / table. There are no row- or field-level permissions: keep sensitive
material in its own table. App files and playbooks are readable by everyone who can see them, so
never put sensitive content there — this template keeps the IC sample row only in the IC table's
own `records.ndjson` for that reason.

## Developing

```bash
cd content/busa-dealflow-app && npm install && npm run check   # static contract + unit tests
PORT=3000 npm run dev    # open http://localhost:3000/?demo=1   (&as=member previews a member)
cd ../.. && node scripts/sync-content.mjs --check              # content/ matches the app config
```
