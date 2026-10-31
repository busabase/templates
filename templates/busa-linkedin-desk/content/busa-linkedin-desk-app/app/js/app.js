import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { appConfig } from "./config.js";
import {
  ACTION_TYPE_LABELS,
  EXPERIENCE_TYPE_LABELS,
  INTENT_LABELS,
  buildDeskView,
  buildReportText,
  formatWait,
} from "./desk-model.js";
import { messages } from "./messages.js";
import { getProvider } from "./providers/index.js";
import { connectionHintKey, getRuntime, shouldUseLocalGateway } from "./runtime.js";

// The console renders records; it never edits them. Every value that came
// from a record is inserted with textContent, so a message body can contain
// anything without becoming markup.

const byId = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const state = { runtime: null, provider: null, payload: null };

const isDemo = () => new URLSearchParams(window.location.search).get("demo") === "1";

// The gate owns the standalone connect flow. Provisioning is deliberately
// refused: the desk's resources are created by installing the template, and
// a read-only console must not grow write powers by being opened.
const gate = createAirAppConnectGate({
  appName: appConfig.appName,
  demoHref: "?demo=1",
  shouldGate: () => !isDemo() && shouldUseLocalGateway(state.runtime),
  onProvision: () => {
    throw new Error(
      "This console does not create the desk's resources; they are installed with the Busa LinkedIn Desk template.",
    );
  },
});

function renderMetrics(view) {
  // The band stays at three numbers — everything else lives in its section.
  const attention =
    view.dueActions.filter((d) => d.overdue).length + view.stalled.length;
  const metrics = [
    [String(view.approvals.length), `${messages.approvals} ${messages.approvalsZh}`, view.approvals.length > 0],
    [String(view.today.newInbound), messages.newMessages, false],
    [String(attention), `${messages.stalled} ${messages.stalledZh}`, attention > 0],
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

function renderApprovals(view) {
  byId("approvalsCount").textContent = view.approvals.length ? `${view.approvals.length}` : "";
  byId("approvalsEmpty").hidden = view.approvals.length > 0;
  byId("approvalsEmpty").textContent = messages.approvalsEmpty;
  const list = byId("approvalsList");
  list.replaceChildren(
    ...view.approvals.map((item) => {
      const wrap = el("div", "queue-item");
      const main = el("div", "queue-main");
      const title = el("button", "queue-title", item.title || "(untitled draft)");
      title.type = "button";
      main.append(title);
      if (item.urgency) {
        main.append(el("span", `pill ${item.urgency}`, item.urgency));
      }
      const meta = [
        item.contactName ? `${messages.contact}: ${item.contactName}` : null,
        `${messages.waiting} ${formatWait(item.waitingMs)}`,
      ].filter(Boolean);
      main.append(el("span", "meta", meta.join(" · ")));
      wrap.append(main);

      const detail = el("div", "detail");
      detail.hidden = true;
      detail.append(el("h4", null, messages.draft), el("p", null, item.draft || "—"));
      if (item.message) {
        detail.append(
          el("h4", null, messages.sourceMessage),
          el("p", null, item.message.fields?.body || item.message.fields?.title || "—"),
        );
      }
      wrap.append(detail);
      title.addEventListener("click", () => {
        detail.hidden = !detail.hidden;
      });
      return wrap;
    }),
  );
}

function renderToday(view) {
  const stats = byId("todayStats");
  const mk = (value, label) => {
    const card = el("div", "metric");
    card.append(el("strong", null, String(value)), el("span", null, label));
    return card;
  };
  stats.replaceChildren(
    mk(view.today.newInbound, messages.newMessages),
    mk(view.today.awaitingTriage, messages.awaitingTriage),
  );
  const mix = byId("intentMix");
  const entries = Object.entries(view.today.intentCounts);
  mix.replaceChildren(
    ...(entries.length
      ? entries.map(([intent, n]) => el("span", "chip", `${INTENT_LABELS[intent] ?? intent} ${n}`))
      : [el("span", "meta", "—")]),
  );
  byId("reportText").textContent = buildReportText(view);
}

function renderDueAndStalled(view) {
  const due = byId("dueList");
  due.replaceChildren(
    ...(view.dueActions.length
      ? view.dueActions.map((d) => {
          const row = el("div", "row-item");
          const main = el("div", "queue-main");
          main.append(el("span", null, d.title));
          main.append(
            el(
              "span",
              `when${d.overdue ? " overdue" : ""}`,
              `${ACTION_TYPE_LABELS[d.type] ?? d.type} · ${d.overdue ? messages.overdue : messages.dueToday}`,
            ),
          );
          row.append(main);
          return row;
        })
      : [el("p", "empty", "—")]),
  );
  byId("stalledEmpty").hidden = view.stalled.length > 0;
  byId("stalledEmpty").textContent = messages.stalledEmpty;
  const stalled = byId("stalledList");
  stalled.replaceChildren(
    ...view.stalled.map((s) => {
      const row = el("div", "row-item");
      const main = el("div", "queue-main");
      main.append(el("span", null, s.title));
      main.append(
        el(
          "span",
          "when",
          `${s.contactName ? `${s.contactName} · ` : ""}quiet ${s.quietDays}d · ${s.direction === "out" ? "awaiting reply" : "unanswered"}`,
        ),
      );
      row.append(main);
      return row;
    }),
  );
}

function renderExperience(view) {
  byId("expCount").textContent = view.candidates.length ? `${view.candidates.length}` : "";
  byId("expEmpty").hidden = view.candidates.length > 0;
  byId("expEmpty").textContent = messages.experienceEmpty;
  const list = byId("expList");
  list.replaceChildren(
    ...view.candidates.map((c) => {
      const row = el("div", "row-item");
      const main = el("div", "queue-main");
      main.append(el("span", null, c.title));
      main.append(el("span", "pill", EXPERIENCE_TYPE_LABELS[c.type] ?? c.type));
      row.append(main);
      if (c.sourceTitle) row.append(el("div", "meta", `from: ${c.sourceTitle}`));
      if (c.quote) {
        const quote = el("blockquote", "quote", c.quote);
        row.append(quote);
      }
      return row;
    }),
  );
}

function render() {
  const view = buildDeskView(state.payload.records, new Date());
  renderMetrics(view);
  renderApprovals(view);
  renderToday(view);
  renderDueAndStalled(view);
  renderExperience(view);
  const hasMore = Object.values(state.payload.pageInfo || {}).some((p) => p?.nextCursor);
  byId("pageNote").hidden = !hasMore;
  byId("pageNote").textContent = hasMore ? messages.showingFirstPage : "";
  byId("readOnlyNote").textContent = messages.readOnlyNote;
  byId("overviewPage").hidden = false;
}

async function load() {
  byId("loadingState").textContent = messages.loading;
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
      ? messages.setupRequired
      : `${reason} ${messages[connectionHintKey(state.runtime)]}`;
  }
}

byId("copyReport").addEventListener("click", async () => {
  const button = byId("copyReport");
  try {
    await navigator.clipboard.writeText(byId("reportText").textContent);
    button.textContent = messages.copied;
    setTimeout(() => {
      button.textContent = messages.copyReport;
    }, 1600);
  } catch {
    button.textContent = messages.copyReport;
  }
});

document.title = appConfig.appName;
load();
