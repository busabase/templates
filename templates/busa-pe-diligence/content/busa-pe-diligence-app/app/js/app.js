import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { appConfig } from "./config.js";
import { LABELS, buildCockpit } from "./cockpit-model.js";
import { messages } from "./messages.js";
import { getProvider } from "./providers/index.js";
import { connectionHintKey, getRuntime, shouldUseLocalGateway } from "./runtime.js";

// The cockpit renders records; it never edits them. Every value that came
// from a record is inserted with textContent, so a finding or a claim can
// contain anything without becoming markup. Hash routes keep the four
// screens addressable: #/ overview, #/targets, #/target/<id>, #/findings.

const byId = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const t = () => messages.en;
const state = { runtime: null, provider: null, payload: null };
const isDemo = () => new URLSearchParams(window.location.search).get("demo") === "1";

// The gate owns the standalone connect flow. Provisioning is deliberately
// refused: the desk's resources are created by installing the template, and
// a read-only cockpit must not grow write powers by being opened.
const gate = createAirAppConnectGate({
  appName: appConfig.appName,
  demoHref: "?demo=1",
  shouldGate: () => !isDemo() && shouldUseLocalGateway(state.runtime),
  onProvision: () => {
    throw new Error(
      "This cockpit does not create the desk's resources; they are installed with the Busa PE Diligence template.",
    );
  },
});

const PAGES = ["overviewPage", "targetsPage", "detailPage", "findingsPage"];
const showPage = (id) => {
  for (const page of PAGES) byId(page).hidden = page !== id;
  for (const link of document.querySelectorAll(".nav-link")) {
    link.classList.toggle("active", link.dataset.page === id);
  }
  window.scrollTo(0, 0);
};

const pill = (text, kind) => el("span", `pill ${kind ?? ""}`, text);

function renderMetrics(cockpit) {
  const metrics = [
    [String(cockpit.inDiligence.length), t().metricInDiligence, cockpit.inDiligence.length > 0],
    [String(cockpit.openFindings.filter((f) => f.severity === "critical" || f.severity === "high").length), t().metricOpenFindings, cockpit.openFindings.some((f) => f.severity === "critical")],
    [String(cockpit.overdue.length), t().metricOverdue, cockpit.overdue.length > 0],
  ];
  byId("metrics").replaceChildren(
    ...metrics.map(([value, label, alert]) => {
      const card = el("div", `metric${alert ? " alert" : ""}`);
      card.append(el("strong", null, value), el("span", null, label));
      return card;
    }),
  );
}

function progressRow(target, progress) {
  const wrap = el("div", "progress-row");
  const head = el("div", "progress-head");
  const link = el("a", "target-link", target.name);
  link.href = `#/target/${encodeURIComponent(target.id)}`;
  head.append(link, el("span", "meta", `${progress.reviewed}/${progress.total} reviewed`));
  wrap.append(head);
  for (const stream of progress.streams) {
    const row = el("div", "stream-row");
    row.append(el("span", "stream-label", stream.label));
    const bar = el("div", "bar");
    const fill = el("div", "bar-fill");
    fill.style.width = `${stream.pct}%`;
    bar.append(fill);
    row.append(bar, el("span", "meta", `${stream.reviewed}/${stream.total}`));
    wrap.append(row);
  }
  return wrap;
}

function findingCard(finding, { withTarget = true } = {}) {
  const card = el("article", `finding sev-${finding.severity ?? "low"}`);
  const head = el("div", "finding-head");
  head.append(
    pill(LABELS.severity[finding.severity] ?? finding.severity ?? "", `sev-${finding.severity ?? "low"}`),
    pill(LABELS.findingStatus[finding.status] ?? finding.status ?? "", "status"),
  );
  if (withTarget && finding.targetName) head.append(el("span", "meta", finding.targetName));
  card.append(head, el("h3", null, finding.title));
  if (finding.claim) card.append(el("p", null, `Claim: ${finding.claim}`));
  if (finding.whatEvidenceShows) card.append(el("p", null, `Evidence: ${finding.whatEvidenceShows}`));
  if (finding.impact) card.append(el("p", "impact", `Impact: ${finding.impact}`));
  if (finding.evidenceTitles.length) {
    card.append(el("p", "meta", `Evidence: ${finding.evidenceTitles.join("; ")}`));
  }
  return card;
}

function renderOverview(cockpit) {
  renderMetrics(cockpit);
  const progress = byId("progressList");
  byId("progressEmpty").hidden = cockpit.inDiligence.length > 0;
  byId("progressEmpty").textContent = t().progressEmpty;
  progress.replaceChildren(...cockpit.inDiligence.map(({ target, progress: p }) => progressRow(target, p)));

  byId("overdueEmpty").hidden = cockpit.overdue.length > 0;
  byId("overdueEmpty").textContent = t().overdueEmpty;
  byId("overdueList").replaceChildren(
    ...cockpit.overdue.map((request) => {
      const row = el("div", "row-item");
      const main = el("div", "queue-main");
      main.append(el("span", null, request.title));
      main.append(
        el("span", "when overdue",
          `${LABELS.workstream[request.workstream] ?? request.workstream ?? ""} · ${t().overdueWord} · ${t().dueWord} ${request.dueDate}`),
      );
      row.append(main);
      return row;
    }),
  );

  const top = cockpit.openFindings.slice(0, 3);
  byId("topFindingsEmpty").hidden = top.length > 0;
  byId("topFindingsEmpty").textContent = t().findingsEmpty;
  byId("topFindingsList").replaceChildren(...top.map((f) => findingCard(f)));
}

function loadMoreButton(baseKey) {
  const info = state.payload.pageInfo?.[baseKey];
  if (!info?.nextCursor) return null;
  const button = el("button", "load-more", t().loadMore);
  button.type = "button";
  button.addEventListener("click", async () => {
    button.disabled = true;
    const page = await state.provider.loadMore(baseKey, info.nextCursor);
    state.payload.records.push(...page.records);
    state.payload.pageInfo[baseKey] = { nextCursor: page.nextCursor, limit: page.limit };
    render();
  });
  return button;
}

function renderTargets(cockpit) {
  const list = byId("targetsList");
  byId("targetsEmpty").hidden = cockpit.targets.length > 0;
  byId("targetsEmpty").textContent = t().targetEmpty;
  list.replaceChildren(
    ...cockpit.targets.map((target) => {
      const row = el("div", "row-item");
      const main = el("div", "queue-main");
      const link = el("a", "target-link", target.name);
      link.href = `#/target/${encodeURIComponent(target.id)}`;
      main.append(link);
      const meta = [
        LABELS.stage[target.stage] ?? target.stage,
        LABELS.dealType[target.dealType] ?? target.dealType,
        target.icDate ? `IC ${target.icDate}` : null,
      ].filter(Boolean);
      main.append(el("span", "meta", meta.join(" · ")));
      row.append(main);
      return row;
    }),
  );
  const more = loadMoreButton("targets");
  byId("targetsMore").replaceChildren(...(more ? [more] : []));
}

function renderDetail(cockpit, targetId) {
  const target = cockpit.targets.find((item) => item.id === targetId);
  if (!target) {
    showPage("targetsPage");
    return;
  }
  byId("detailName").textContent = target.name;
  const meta = [
    target.ticker, target.sector, target.geography,
    LABELS.stage[target.stage] ?? target.stage,
    target.enterpriseValue != null ? `EV $${Number(target.enterpriseValue).toLocaleString("en-US")}m` : null,
    target.stake != null ? `stake ${target.stake}%` : null,
  ].filter(Boolean);
  byId("detailMeta").textContent = meta.join(" · ");
  byId("detailSnapshot").textContent = target.snapshot || t().noneRecorded;

  const progress = cockpit.progressFor(target.id);
  byId("detailStreams").replaceChildren(
    ...(progress.streams.length
      ? [progressRow(target, progress)].slice(0, 1).flatMap((row) => [...row.querySelectorAll(".stream-row")])
      : [el("p", "empty", t().noneRecorded)]),
  );

  const actions = cockpit.outstandingFor(target.id);
  byId("detailActions").replaceChildren(
    ...(actions.length
      ? actions.map((request) => {
          const row = el("div", "row-item");
          const main = el("div", "queue-main");
          main.append(el("span", null, request.title));
          main.append(el("span", "meta",
            `${LABELS.workstream[request.workstream] ?? request.workstream ?? ""} · ${LABELS.requestStatus[request.status] ?? request.status ?? ""}${request.dueDate ? ` · ${t().dueWord} ${request.dueDate}` : ""}`));
          row.append(main);
          return row;
        })
      : [el("p", "empty", t().noneRecorded)]),
  );
  if (target.nextAction) {
    const note = el("p", "next-action", target.nextAction);
    byId("detailActions").prepend(note);
  }

  const findings = cockpit.findingsFor(target.id);
  byId("detailFindings").replaceChildren(
    ...(findings.length ? findings.map((f) => findingCard(f, { withTarget: false })) : [el("p", "empty", t().noneRecorded)]),
  );
  showPage("detailPage");
}

function renderFindings(cockpit) {
  byId("findingsList").replaceChildren(...cockpit.findings.map((f) => findingCard(f)));
  const more = loadMoreButton("findings");
  byId("findingsMore").replaceChildren(...(more ? [more] : []));
}

function render() {
  const cockpit = buildCockpit(state.payload.records, new Date());
  const hasMore = Object.values(state.payload.pageInfo || {}).some((p) => p?.nextCursor);
  byId("pageNote").hidden = !hasMore;
  byId("pageNote").textContent = hasMore ? t().showingFirstPage : "";
  const route = window.location.hash.replace(/^#\/?/, "");
  if (route.startsWith("target/")) {
    renderTargets(cockpit);
    renderDetail(cockpit, decodeURIComponent(route.slice("target/".length)));
  } else if (route === "targets") {
    renderTargets(cockpit);
    showPage("targetsPage");
  } else if (route === "findings") {
    renderFindings(cockpit);
    showPage("findingsPage");
  } else {
    renderOverview(cockpit);
    showPage("overviewPage");
  }
}

function applyStaticText() {
  const copy = t();
  byId("brandSub").textContent = copy.brandSub;
  byId("readOnlyBadge").textContent = copy.readOnlyBadge;
  byId("progressTitle").textContent = copy.progressTitle;
  byId("overdueTitle").textContent = copy.overdueTitle;
  byId("topFindingsTitle").textContent = copy.topFindingsTitle;
  byId("targetsTitle").textContent = copy.targetsTitle;
  byId("findingsTitle").textContent = copy.findingsTitle;
  byId("snapshotTitle").textContent = copy.snapshotTitle;
  byId("streamsTitle").textContent = copy.workstreamsTitle;
  byId("actionsTitle").textContent = copy.nextActionsTitle;
  byId("detailFindingsTitle").textContent = copy.targetFindingsTitle;
  byId("backLink").textContent = copy.detailBack;
  byId("readOnlyNote").textContent = copy.readOnlyNote;
  byId("demoDisclaimer").textContent = isDemo() ? copy.demoDisclaimer : "";
  for (const link of document.querySelectorAll(".nav-link")) {
    link.textContent = copy[link.dataset.label];
  }
}

async function load() {
  applyStaticText();
  byId("loadingState").textContent = t().loading;
  byId("errorState").hidden = true;
  // Where this app runs decides what to TELL the user, never what to attempt:
  // the probe is read before the first data call so a failure can be
  // explained in those terms.
  state.runtime = await getRuntime();
  try {
    const ready = await gate.pass({ onReady: load });
    if (!ready) {
      byId("loadingState").textContent = "";
      return;
    }
    state.provider = await getProvider();
    state.payload = await state.provider.getState();
    byId("loadingState").textContent = "";
    render();
  } catch (error) {
    byId("loadingState").textContent = "";
    byId("errorState").hidden = false;
    const reason = error instanceof Error ? error.message : String(error);
    byId("errorState").textContent = reason.startsWith("SETUP_REQUIRED")
      ? t().setupRequired
      : `${reason} ${t()[connectionHintKey(state.runtime)]}`;
  }
}

window.addEventListener("hashchange", () => {
  if (state.payload) render();
});

document.title = appConfig.appName;
load();
