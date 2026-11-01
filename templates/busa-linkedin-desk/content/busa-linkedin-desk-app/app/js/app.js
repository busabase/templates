import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { appConfig } from "./config.js";
import { buildDeskView, buildReportText, formatWait, labelsFor } from "./desk-model.js";
import { messages } from "./messages.js";
import { getProvider } from "./providers/index.js";
import { connectionHintKey, getRuntime, shouldUseLocalGateway } from "./runtime.js";

// The console renders records; it never edits them. Every value that came
// from a record is inserted with textContent, so a message body can contain
// anything without becoming markup.
//
// Locale comes from `?lang=` (zh-CN, else en) — the same switch the desk's
// other surfaces use — and the header select writes it back and re-renders,
// so one install serves both of the desk's working languages.

const byId = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const localeFromUrl = () =>
  new URLSearchParams(window.location.search).get("lang") === "zh-CN" ? "zh-CN" : "en";

const state = { runtime: null, provider: null, payload: null, locale: localeFromUrl() };
const t = () => messages[state.locale];
const labels = () => labelsFor(state.locale);

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

// The switcher names each language in its own script, and rebuilds its
// options per locale so neither rendering carries the other language.
const LOCALE_OPTIONS = { en: ["English", "Simplified Chinese"], "zh-CN": ["英文", "简体中文"] };

function applyStaticText() {
  const copy = t();
  document.documentElement.lang = state.locale;
  byId("brandSub").textContent = copy.brandSub;
  byId("readOnlyBadge").textContent = copy.readOnlyBadge;
  byId("approvalsTitle").textContent = copy.approvalsTitle;
  byId("todayTitle").textContent = copy.todayTitle;
  byId("reportTitle").textContent = copy.reportTitle;
  byId("copyReport").textContent = copy.copyReport;
  byId("dueTitle").textContent = copy.dueTitle;
  byId("actionsSubhead").textContent = copy.actionsSubhead;
  byId("stalledSubhead").textContent = copy.stalledSubhead;
  byId("expTitle").textContent = copy.expTitle;
  const select = byId("localeSelect");
  select.setAttribute("aria-label", copy.language);
  select.replaceChildren(
    ...["en", "zh-CN"].map((value, i) => {
      const option = el("option", null, LOCALE_OPTIONS[state.locale][i]);
      option.value = value;
      return option;
    }),
  );
  select.value = state.locale;
}

function renderMetrics(view) {
  // The band stays at three numbers — everything else lives in its section.
  const attention =
    view.dueActions.filter((d) => d.overdue).length + view.stalled.length;
  const metrics = [
    [String(view.approvals.length), t().approvalsTitle, view.approvals.length > 0],
    [String(view.today.newInbound), t().newMessages, false],
    [String(attention), t().stalled, attention > 0],
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
  byId("approvalsEmpty").textContent = t().approvalsEmpty;
  const list = byId("approvalsList");
  list.replaceChildren(
    ...view.approvals.map((item) => {
      const wrap = el("div", "queue-item");
      const main = el("div", "queue-main");
      const title = el("button", "queue-title", item.title || t().untitledDraft);
      title.type = "button";
      main.append(title);
      if (item.urgency) {
        main.append(el("span", `pill ${item.urgency}`, t().urgencyLabels[item.urgency] ?? item.urgency));
      }
      const meta = [
        item.contactName ? `${t().contact}${t().labelSep}${item.contactName}` : null,
        `${t().waiting} ${formatWait(item.waitingMs)}`,
      ].filter(Boolean);
      main.append(el("span", "meta", meta.join(" · ")));
      wrap.append(main);

      const detail = el("div", "detail");
      detail.hidden = true;
      detail.append(el("h4", null, t().draft), el("p", null, item.draft || "—"));
      if (item.message) {
        detail.append(
          el("h4", null, t().sourceMessage),
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
    mk(view.today.newInbound, t().newMessages),
    mk(view.today.awaitingTriage, t().awaitingTriage),
  );
  const mix = byId("intentMix");
  const entries = Object.entries(view.today.intentCounts);
  mix.replaceChildren(
    ...(entries.length
      ? entries.map(([intent, n]) => el("span", "chip", `${labels().intent[intent] ?? intent} ${n}`))
      : [el("span", "meta", "—")]),
  );
  byId("reportText").textContent = buildReportText(view, new Date(), t(), labels());
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
              `${labels().actionType[d.type] ?? d.type} · ${d.overdue ? t().overdue : t().dueToday}`,
            ),
          );
          row.append(main);
          return row;
        })
      : [el("p", "empty", "—")]),
  );
  byId("stalledEmpty").hidden = view.stalled.length > 0;
  byId("stalledEmpty").textContent = t().stalledEmpty;
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
          `${s.contactName ? `${s.contactName} · ` : ""}${t().quietDays(s.quietDays)} · ${s.direction === "out" ? t().awaitingReply : t().unanswered}`,
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
  byId("expEmpty").textContent = t().experienceEmpty;
  const list = byId("expList");
  list.replaceChildren(
    ...view.candidates.map((c) => {
      const row = el("div", "row-item");
      const main = el("div", "queue-main");
      main.append(el("span", null, c.title));
      main.append(el("span", "pill", labels().experienceType[c.type] ?? c.type));
      row.append(main);
      if (c.sourceTitle) row.append(el("div", "meta", `${t().fromPrefix}${c.sourceTitle}`));
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
  byId("pageNote").textContent = hasMore ? t().showingFirstPage : "";
  byId("readOnlyNote").textContent = t().readOnlyNote;
  byId("overviewPage").hidden = false;
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

byId("localeSelect").addEventListener("change", (event) => {
  state.locale = event.target.value === "zh-CN" ? "zh-CN" : "en";
  const url = new URL(window.location.href);
  url.searchParams.set("lang", state.locale);
  history.replaceState(history.state, "", url);
  applyStaticText();
  if (state.payload) render();
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
