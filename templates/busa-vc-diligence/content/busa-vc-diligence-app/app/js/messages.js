// Every visible string in one place. app.js looks keys up here; no module
// hard-codes copy, so a second locale is one more block. The connection
// hints are one sentence per (runtime x credentials) state — never a fixed
// "connected" string, which would eventually be shown where it is false.
export const messages = {
  en: {
    language: "Language",
    brandSub: "Diligence cockpit",
    readOnlyBadge: "Read-only",
    targetsTitle: "Targets",
    wallTitle: "Findings wall",
    stuckTitle: "Overdue & blocked requests",
    reportTitle: "Desk summary",
    detailBack: "All targets",
    loading: "Loading the desk...",
    targetsEmpty: "No targets yet. Targets your team opens will appear here.",
    wallEmpty: "No open findings. Mismatches and unverified load-bearing figures will appear here.",
    stuckEmpty: "No request is overdue or blocked.",
    copyReport: "Copy summary",
    copied: "Copied",
    inDiligence: "Targets in diligence",
    openCritical: "Open Critical findings",
    overdueRequests: "Overdue requests",
    progress: "requests answered",
    openFindings: "open findings",
    unverified: "evidence items not verified",
    thesis: "Thesis",
    workstreams: "Workstream progress",
    topFindings: "Top findings",
    claims: "Claims & evidence snapshot",
    interviews: "Interviews & references",
    nextActions: "Next actions",
    noActions: "Nothing blocked or overdue for this target.",
    answered: "answered",
    reviewed: "reviewed",
    blockedWord: "blocked",
    resolveBy: "resolve by",
    evidenceLink: "evidence",
    loadMore: "Load more",
    readOnlyNote:
      "Read-only cockpit — diligence work happens in agent chat, and changes reach these tables through Change Requests. Reported figures stay labelled reported; nothing here is investment advice.",
    showingFirstPage: "Showing the first page of some tables; counts above are exact totals.",
    reportHeading: "diligence summary",
    reportPipeline: (n, critical, high) =>
      `Targets in diligence: ${n} · open Critical findings: ${critical} · open High findings: ${high}`,
    reportStuck: (overdue, blocked) => `Overdue requests: ${overdue} · blocked requests: ${blocked}`,
    reportProgress: (pct, open, unverified) =>
      `${pct == null ? "no requests yet" : `${pct}% answered`} · ${open} open findings · ${unverified} evidence items not verified`,
    reportWall: (count) => `Open findings across the desk: ${count}`,
    hintHosted:
      "Busabase is hosting this app, so the signed-in viewer's session should authorize it. Ask a Space admin whether your account can read these Bases.",
    hintDevProxy:
      "This app was started with a Busabase origin configured, so Busabase itself rejected the request. Check that origin and the credentials it was started with.",
    hintStandalone:
      "This app is running standalone with no Busabase connection. Use the Connect Busabase setup to sign in, or append ?demo=1 to browse sample data instead.",
    hintUnknown:
      "This app could not determine its runtime, so it cannot tell whether a connection is expected. Reload the page; if this persists the app is being served by something other than its own server.",
    setupRequired:
      "The desk's resources were not found in this Space. They are created when the Busa VC Diligence template is installed; this cockpit does not create them itself.",
  },
};
