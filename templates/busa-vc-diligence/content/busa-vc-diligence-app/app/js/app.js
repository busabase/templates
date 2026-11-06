import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { appConfig } from "./config.js";
import { buildDiligenceView, buildReportText, labelsFor } from "./diligence-model.js";
import { messages } from "./messages.js";
import { getProvider } from "./providers/index.js";
import { connectionHintKey, getRuntime, shouldUseLocalGateway } from "./runtime.js";

// The cockpit renders records; it never edits them, and it never contacts
// a target company or anyone else. Every value that came from a record is
// inserted with textContent, so a claim or a note can contain anything
// without becoming markup.

const byId = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const state = { runtime: null, provider: null, payload: null, detailId: null };
const t = () => messages.en;
const labels = () => labelsFor("en");

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
      "This cockpit does not create the desk's resources; they are installed with the Busa VC Diligence template.",
    );
  },
});

function applyStaticText() {
  const copy = t();
  byId("brandSub").textContent = copy.brandSub;
  byId("readOnlyBadge").textContent = copy.readOnlyBadge;
  byId("targetsTitle").textContent = copy.targetsTitle;
  byId("wallTitle").textContent = copy.wallTitle;
  byId("stuckTitle").textContent = copy.stuckTitle;
  byId("reportTitle").textContent = copy.reportTitle;
  byId("copyReport").textContent = copy.copyReport;
  byId("backButton").textContent = copy.detailBack;
  byId("thesisTitle").textContent = copy.thesis;
  byId("workstreamsTitle").textContent = copy.workstreams;
  byId("findingsTitle").textContent = copy.topFindings;
  byId("claimsTitle").textContent = copy.claims;
  byId("interviewsTitle").textContent = copy.interviews;
  byId("actionsTitle").textContent = copy.nextActions;
}

function renderMetrics(view) {
  // The band stays at three numbers — everything else lives in its section.
  const metrics = [
    [String(view.metrics.inDiligence), t().inDiligence, view.metrics.inDiligence > 0],
    [String(view.metrics.openCritical), t().openCritical, view.metrics.openCritical > 0],
    [String(view.metrics.overdue), t().overdueRequests, view.metrics.overdue > 0],
  ];
  const band = byId("metrics");
  band.replaceChildren(
    ...metrics.map(([value, label, alert]) => {
      const card = el("div", `metric${alert ? " alert" : ""}`);
      card.append(el("strong", null, value), el("span", null, label));
      return card;
    }),
  );
}

function renderTargets(view) {
  byId("targetsEmpty").hidden = view.targets.length > 0;
  byId("targetsEmpty").textContent = t().targetsEmpty;
  const list = byId("targetsList");
  list.replaceChildren(
    ...view.targets.map((tv) => {
      const row = el("button", "target-row");
      row.type = "button";
      const main = el("span", "queue-main");
      main.append(el("span", "target-name", tv.name));
      const bits = [
        labels().stage[tv.stage] ?? tv.stage,
        tv.round || null,
        tv.progressPct == null ? null : `${tv.progressPct}% ${t().progress}`,
        `${tv.openFindings.length} ${t().openFindings}`,
        `${tv.unverifiedCount} ${t().unverified}`,
      ].filter(Boolean);
      main.append(el("span", "meta", bits.join(" · ")));
      row.append(main);
      const sev = el("span", "sev-chips");
      for (const [id, n] of Object.entries(tv.severityCounts)) {
        sev.append(el("span", `pill ${id}`, `${labels().severity[id] ?? id} ${n}`));
      }
      row.append(sev);
      row.addEventListener("click", () => openDetail(tv.id));
      return row;
    }),
  );
}

function renderWall(view) {
  byId("wallCount").textContent = view.findingsWall.length ? `${view.findingsWall.length}` : "";
  byId("wallEmpty").hidden = view.findingsWall.length > 0;
  byId("wallEmpty").textContent = t().wallEmpty;
  const list = byId("wallList");
  list.replaceChildren(
    ...view.findingsWall.map((f) => {
      const row = el("div", "row-item");
      const main = el("div", "queue-main");
      main.append(el("span", null, f.title));
      const bits = [
        f.targetName || null,
        f.evidenceTitle ? `${t().evidenceLink}: ${f.evidenceTitle}` : null,
        f.resolveBy ? `${t().resolveBy} ${f.resolveBy}` : null,
      ].filter(Boolean);
      main.append(el("span", "meta", bits.join(" · ")));
      row.append(main, el("span", `pill ${f.severity}`, labels().severity[f.severity] ?? f.severity));
      return row;
    }),
  );
}

function renderStuck(view) {
  const rows = [
    ...view.overdueRequests.map((r) => ({
      title: r.title,
      meta: `${r.targetName} · ${labels().workstream[r.workstream] ?? r.workstream} · ${t().overdueRequests.toLowerCase()} ${r.overdueDays}d`,
    })),
    ...view.blockedRequests.map((r) => ({
      title: r.title,
      meta: `${r.targetName} · ${labels().workstream[r.workstream] ?? r.workstream} · ${t().blockedWord}`,
    })),
  ];
  byId("stuckCount").textContent = rows.length ? `${rows.length}` : "";
  byId("stuckEmpty").hidden = rows.length > 0;
  byId("stuckEmpty").textContent = t().stuckEmpty;
  const list = byId("stuckList");
  list.replaceChildren(
    ...rows.map((r) => {
      const row = el("div", "row-item");
      const main = el("div", "queue-main");
      main.append(el("span", null, r.title), el("span", "meta", r.meta));
      row.append(main);
      return row;
    }),
  );
}

function renderLoadMore() {
  const bar = byId("loadMoreBar");
  const entries = Object.entries(state.payload.pageInfo || {}).filter(([, p]) => p?.nextCursor);
  bar.hidden = entries.length === 0;
  bar.replaceChildren(
    ...entries.map(([key, page]) => {
      const button = el("button", "copy-button", `${t().loadMore} — ${key}`);
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        const next = await state.provider.loadMore(key, page.nextCursor);
        state.payload.records = [...state.payload.records, ...next.records];
        state.payload.pageInfo[key] = { nextCursor: next.nextCursor, limit: page.limit };
        render();
      });
      return button;
    }),
  );
}

function openDetail(id) {
  state.detailId = id;
  render();
}

function renderDetail(view) {
  const tv = view.targets.find((item) => item.id === state.detailId);
  byId("viewPage").hidden = !tv;
  byId("overviewPage").hidden = Boolean(tv);
  if (!tv) return;
  byId("detailName").textContent = tv.name;
  const stage = byId("detailStage");
  stage.textContent = labels().stage[tv.stage] ?? tv.stage;
  byId("detailMeta").textContent = [tv.sector, tv.round].filter(Boolean).join(" · ");
  byId("detailThesis").textContent = tv.thesis || "—";

  const ws = byId("detailWorkstreams");
  ws.replaceChildren(
    ...(tv.byWorkstream.length
      ? tv.byWorkstream.map((w) => {
          const row = el("div", "ws-row");
          row.append(el("span", "ws-label", labels().workstream[w.id] ?? w.id));
          const bar = el("span", "ws-bar");
          const fill = el("span", "ws-fill");
          fill.style.width = `${w.pct ?? 0}%`;
          bar.append(fill);
          row.append(bar);
          row.append(
            el(
              "span",
              "meta",
              `${w.answered}/${w.total} ${t().answered} · ${w.reviewed} ${t().reviewed}${w.blocked ? ` · ${w.blocked} ${t().blockedWord}` : ""}`,
            ),
          );
          return row;
        })
      : [el("p", "empty", "—")]),
  );

  const findings = byId("detailFindings");
  findings.replaceChildren(
    ...(tv.openFindings.length
      ? tv.openFindings.map((f) => {
          const row = el("div", "row-item");
          const main = el("div", "queue-main");
          main.append(el("span", null, f.fields?.title ?? ""));
          if (f.fields?.["what-we-know"]) main.append(el("span", "meta", f.fields["what-we-know"]));
          row.append(
            main,
            el("span", `pill ${f.fields?.severity}`, labels().severity[f.fields?.severity] ?? ""),
          );
          return row;
        })
      : [el("p", "empty", "—")]),
  );

  const claims = byId("detailClaims");
  claims.replaceChildren(
    ...(tv.evidence.length
      ? tv.evidence.map((e) => {
          const row = el("div", "row-item");
          const main = el("div", "queue-main");
          main.append(el("span", null, e.fields?.title ?? ""));
          main.append(
            el("span", "meta", [e.fields?.source, e.fields?.["document-date"]].filter(Boolean).join(" · ")),
          );
          row.append(
            main,
            el("span", `pill ${e.fields?.verification}`, labels().verification[e.fields?.verification] ?? ""),
          );
          return row;
        })
      : [el("p", "empty", "—")]),
  );

  const interviews = byId("detailInterviews");
  interviews.replaceChildren(
    ...(tv.interviews.length
      ? tv.interviews.map((r) => {
          const row = el("div", "row-item");
          const main = el("div", "queue-main");
          main.append(el("span", null, r.fields?.title ?? ""));
          main.append(
            el(
              "span",
              "meta",
              `${labels().interviewType[r.fields?.type] ?? ""} · ${labels().consistency[r.fields?.consistency] ?? ""}`,
            ),
          );
          row.append(main);
          return row;
        })
      : [el("p", "empty", "—")]),
  );

  const actions = byId("detailActions");
  actions.replaceChildren(
    ...(tv.nextActions.length
      ? tv.nextActions.map((a) => {
          const row = el("div", "row-item");
          const main = el("div", "queue-main");
          main.append(el("span", null, a.title));
          main.append(el("span", "meta", [a.kind, a.due].filter(Boolean).join(" · ")));
          row.append(main);
          return row;
        })
      : [el("p", "empty", t().noActions)]),
  );
}

function render() {
  const view = buildDiligenceView(state.payload.records, new Date());
  if (!state.detailId) {
    byId("overviewPage").hidden = false;
    byId("viewPage").hidden = true;
    renderMetrics(view);
    renderTargets(view);
    renderWall(view);
    renderStuck(view);
    byId("reportText").textContent = buildReportText(view, new Date(), t(), labels());
    renderLoadMore();
    const hasMore = Object.values(state.payload.pageInfo || {}).some((p) => p?.nextCursor);
    byId("pageNote").hidden = !hasMore;
    byId("pageNote").textContent = hasMore ? t().showingFirstPage : "";
    byId("readOnlyNote").textContent = t().readOnlyNote;
  } else {
    renderDetail(view);
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

byId("backButton").addEventListener("click", () => {
  state.detailId = null;
  render();
});

byId("copyReport").addEventListener("click", async () => {
  const button = byId("copyReport");
  try {
    await navigator.clipboard.writeText(byId("reportText").textContent);
    button.textContent = t().copied;
    setTimeout(() => {
      button.textContent = t().copyReport;
    }, 1600);
  } catch {
    button.textContent = t().copyReport;
  }
});

document.title = appConfig.appName;
load();
