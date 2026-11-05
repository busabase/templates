// Every visible string, in one place. The package is English-only, so there
// is exactly one locale block; a second locale is one more block here, never
// copy hard-coded in a module. The connection hints are one sentence per
// (runtime x credentials) state — never a fixed "connected" string, which
// would eventually be shown where it is false.
export const messages = {
  en: {
    brandSub: "Diligence cockpit — read-only",
    readOnlyBadge: "Read-only",
    navOverview: "Overview",
    navTargets: "Targets",
    navFindings: "Findings wall",
    loading: "Loading the diligence desk...",
    metricInDiligence: "Targets in diligence",
    metricOpenFindings: "Open critical / high findings",
    metricOverdue: "Overdue requests",
    progressTitle: "Diligence progress by target",
    progressEmpty: "No target is in diligence yet. Targets your team opens will appear here.",
    overdueTitle: "Overdue requests",
    overdueEmpty: "Nothing is overdue. Outstanding requests will appear here when they slip.",
    topFindingsTitle: "Top findings",
    findingsEmpty: "No findings yet. Cross-checked claims will appear here.",
    targetsTitle: "Targets",
    targetEmpty: "No targets loaded.",
    findingsTitle: "Findings wall — worst first",
    detailBack: "← All targets",
    snapshotTitle: "Financial snapshot",
    nextActionsTitle: "Next actions",
    workstreamsTitle: "Workstream progress",
    targetFindingsTitle: "Findings on this target",
    noneRecorded: "None recorded.",
    loadMore: "Load more",
    showingFirstPage: "Showing the first page of a Base; use Load more where offered — headline counts are exact totals.",
    readOnlyNote:
      "Read-only cockpit — the desk's conclusions are proposed by agents in chat and land through Change Requests. This console never writes.",
    demoDisclaimer:
      "Demo data: the NVIDIA example is built from public sources (Form 10-K FY2026) for demonstration only — not a live deal, not investment advice. The other two targets are fictional examples.",
    overdueWord: "overdue",
    dueWord: "due",
    openWord: "open",
    hintHosted:
      "Busabase is hosting this app, so the signed-in viewer's session should authorize it. Ask a Space admin whether your account can read these Bases.",
    hintDevProxy:
      "This app was started with BUSABASE_BASE_URL set, so Busabase itself rejected the request. Check that origin, the API key, and the Space id it was started with.",
    hintStandalone:
      "This app is running standalone with no Busabase connection. Use the Connect Busabase setup to sign in, or append ?demo=1 to browse sample data instead.",
    hintUnknown:
      "This app could not determine its runtime, so it cannot tell whether a connection is expected. Reload the page; if this persists the app is being served by something other than its own server.",
    setupRequired:
      "The desk's resources were not found in this Space. They are created when the Busa PE Diligence template is installed; this cockpit does not create them itself.",
  },
};
