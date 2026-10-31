// UI strings. English is the primary copy; key operational labels carry a
// zh-CN twin because the desk's operators work in both. The connection hints
// are one sentence per (runtime x credentials) state — never a fixed
// "connected" string, which would eventually be shown where it is false.
export const messages = {
  loading: "Loading the desk...",
  approvals: "Awaiting your approval",
  approvalsZh: "待审批",
  approvalsEmpty: "Nothing is waiting. Drafts your agent proposes will appear here.",
  today: "Today's triage",
  todayZh: "今日分诊",
  newMessages: "New messages today",
  awaitingTriage: "Awaiting triage",
  intentMix: "By intent",
  stalled: "Needs a nudge",
  stalledZh: "停滞提醒",
  stalledEmpty: "No open thread has been quiet for over seven days.",
  experience: "Candidate experience",
  experienceZh: "经验候选",
  experienceEmpty: "No candidate lessons waiting for the weekly review.",
  report: "Daily report",
  reportZh: "日报",
  copyReport: "Copy report",
  copied: "Copied",
  overdue: "overdue",
  dueToday: "due today",
  waiting: "waiting",
  sourceMessage: "Source message",
  draft: "Draft",
  contact: "Contact",
  urgency: "Urgency",
  readOnlyNote:
    "Read-only console — approvals happen in agent chat, and changes reach these tables through Change Requests.",
  showingFirstPage: "Showing the first page of records; counts above are exact totals.",
  hintHosted:
    "Busabase is hosting this app, so the signed-in viewer's session should authorize it. Ask a Space admin whether your account can read these Bases.",
  hintDevProxy:
    "This app was started with BUSABASE_BASE_URL set, so Busabase itself rejected the request. Check that origin, the API key, and the Space id it was started with.",
  hintStandalone:
    "This app is running standalone with no Busabase connection. Use the Connect Busabase setup to sign in, or append ?demo=1 to browse sample data instead.",
  hintUnknown:
    "This app could not determine its runtime, so it cannot tell whether a connection is expected. Reload the page; if this persists the app is being served by something other than its own server.",
  setupRequired:
    "The desk's resources were not found in this Space. They are created when the Busa LinkedIn Desk template is installed; this console does not create them itself.",
};
