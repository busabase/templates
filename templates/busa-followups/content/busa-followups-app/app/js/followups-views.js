import {
  DETAIL_MODES,
  detailUrl,
  els,
  escapeHtml,
  followups,
  formatDateTime,
  formatDue,
  isPartial,
  listUrl,
  loadState,
  lockBanner,
  recordById,
  recordUrl,
  render,
  replaceRoute,
  state,
  t,
  viewRows,
} from "../app.js";

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const plus = () => (isPartial() ? "+" : "");
const todayIso = () => state.snapshot?.today_iso || "";

// One line: the date, tinted when it needs action. Never the raw value alone
// when it is a date — "Sep 1" reads faster than "2026-09-01".
function dueLabel(item) {
  if (!item.due) return item.status === "done" ? `<span class="muted">—</span>` : `<span class="muted">${t("noDue")}</span>`;
  const text = escapeHtml(formatDue(item.due));
  if (item.status === "done") return `<span class="muted">${text}</span>`;
  if (item.due < todayIso()) return `<span class="badge danger" title="${t("overdue")}">${text}</span>`;
  if (item.due === todayIso()) return `<span class="badge warning">${t("dueToday")}</span>`;
  return text;
}

const statusBadge = (item) =>
  item.status === "done"
    ? `<span class="badge positive">${t("done")}</span>`
    : `<span class="badge">${t("pending")}</span>`;

const doneButton = (item, className = "") =>
  item.status === "pending"
    ? `<button type="button" class="button ${className}" data-done="${escapeHtml(item.record_id)}" ${state.settings?.lock ? "disabled" : ""}>${t("markDone")}</button>`
    : "";

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers neither the sidebar (which shows "due today") nor any toolbar
// shows. Done is an exact records.count; overdue/upcoming need a date compare
// the count filters cannot express, so they come from the loaded rows and
// carry a "+" while more rows exist.
function metricsBand() {
  const counts = state.snapshot?.counts || {};
  const done = state.snapshot?.totals?.done;
  return [
    [t("overdue"), `${counts.overdue ?? 0}${plus()}`],
    [t("upcoming"), `${counts.upcoming ?? 0}${plus()}`],
    [t("doneTotal"), done ?? "—"],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

export function renderOverview() {
  const rows = followups();
  const total = state.snapshot?.totals?.total;
  const meetings = new Set(rows.map((row) => row.meeting).filter(Boolean));
  document.getElementById("overviewSummary").textContent = t("overviewSummary")
    .replace("{total}", total ?? `${rows.length}${plus()}`)
    .replace("{meetings}", `${meetings.size}${plus()}`);
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const upcoming = (state.snapshot?.upcoming || []).slice(0, 6);
  const byMeeting = [...meetings]
    .map((meeting) => {
      const items = rows.filter((row) => row.meeting === meeting);
      return { meeting, open: items.filter((row) => row.status === "pending").length, all: items.length };
    })
    .sort((a, b) => b.open - a.open || b.all - a.all)
    .slice(0, 6);
  const scope = isPartial() ? `<p class="muted">${t("loadedScope").replace("{n}", rows.length)}</p>` : "";
  document.getElementById("overviewBody").innerHTML = `
    ${lockBanner()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("comingUp")}</h2>
        ${
          upcoming
            .map(
              (item) => `
            <a class="due-row" href="${recordUrl(item.record_id, "all")}">
              <span><strong>${escapeHtml(item.person)}</strong><small>${escapeHtml(item.action)}</small></span>
              <span class="due-meta">${escapeHtml(formatDue(item.due))}</span>
            </a>`,
            )
            .join("") || `<div class="empty-inline">${t("nothingUpcoming")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("byMeeting")}</h2>
        ${
          byMeeting
            .map(
              (entry) => `
            <div class="meeting-row">
              <span>${escapeHtml(entry.meeting)}</span>
              <span class="muted">${t("openOfAll").replace("{open}", entry.open).replace("{all}", entry.all)}</span>
            </div>`,
            )
            .join("") || `<div class="empty-inline">${t("noFollowups")}</div>`
        }
        ${scope}
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { today: "todayHint", all: "allHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

const rowOpen = (item) => {
  const classes = [item.record_id === state.route.selectedId ? "ws-selected" : "", item.status === "done" ? "is-done" : ""]
    .filter(Boolean)
    .join(" ");
  return `<tr data-id="${escapeHtml(item.record_id)}"${classes ? ` class="${classes}"` : ""}>`;
};

// Today: who, what, when, from which meeting. Due stays visible in the narrow
// split queue (ws-split-keep); the Mark done button lives in the record there.
function todayTable(items) {
  return `
    <table class="ws-table fu-table today-table">
      ${tableHead([[t("person")], [t("what")], [t("due"), "ws-split-keep fu-col-due"], [t("meeting"), "fu-col-meeting"], ["", "fu-col-action"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item)}
              ${cell(`<span class="strong">${escapeHtml(item.person)}</span>`, item.person)}
              ${cell(escapeHtml(item.action), item.action)}
              ${cell(dueLabel(item), item.due, "ws-split-keep")}
              ${cell(escapeHtml(item.meeting), item.meeting)}
              ${cell(doneButton(item, "row-action"), "", "fu-col-action")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function allTable(items) {
  return `
    <table class="ws-table fu-table all-table">
      ${tableHead([[t("person")], [t("what")], [t("due"), "ws-split-keep fu-col-due"], [t("status"), "fu-col-status"], [t("meeting"), "fu-col-meeting"], ["", "fu-col-action"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item)}
              ${cell(`<span class="strong">${escapeHtml(item.person)}</span>`, item.person)}
              ${cell(escapeHtml(item.action), item.action)}
              ${cell(dueLabel(item), item.due, "ws-split-keep")}
              ${cell(statusBadge(item))}
              ${cell(escapeHtml(item.meeting), item.meeting)}
              ${cell(doneButton(item, "row-action"), "", "fu-col-action")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Load more: one page per click, appended. Only while records.list says more exist.
function loadMoreControl() {
  if (!isPartial()) return "";
  return `
    <div class="load-more">
      <button type="button" class="button" data-load-more ${state.loadingMore ? "disabled" : ""}>${state.loadingMore ? t("loading") : t("loadMore")}</button>
      <span class="muted">${t("loadedScope").replace("{n}", followups().length)}</span>
    </div>
  `;
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = view === "today" ? t("todayTitle") : t("allTitle");
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = viewRows(view);
  els.viewCount.textContent = `${items.length}${plus()}`;
  const banners = `${lockBanner()}${state.notice ? `<div class="notice-banner">${escapeHtml(state.notice)}</div>` : ""}`;
  els.viewNotice.hidden = !banners;
  els.viewNotice.innerHTML = banners;

  const empty = state.route.query
    ? emptyState(t("noMatches"))
    : view === "today"
      ? emptyState(t("nothingToday"), t("nothingTodayDetail"))
      : emptyState(t("noFollowups"), t("noFollowupsDetail"));
  const table = view === "today" ? todayTable(items) : allTable(items);
  els.listPanel.innerHTML = `${items.length ? table : empty}${loadMoreControl()}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${t("selectFollowup")}</div>` : "";
    return;
  }
  const item = recordById(selectedId);
  if (!item) {
    const pending = state.extra.has(selectedId) && state.extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = followupDetail(item);
}

function followupDetail(item) {
  const created = item.created_at ? new Date(item.created_at) : null;
  return `
    <article class="fu-detail">
      <header class="detail-head">
        <h2>${escapeHtml(item.person)}</h2>
        ${statusBadge(item)}
      </header>
      <p class="fu-action">${escapeHtml(item.action)}</p>
      <dl class="detail-fields">
        <dt>${t("due")}</dt><dd>${dueLabel(item)}${item.status === "pending" && item.due && item.due < todayIso() ? ` <span class="muted">${t("overdue")}</span>` : ""}</dd>
        <dt>${t("meeting")}</dt><dd>${item.meeting ? escapeHtml(item.meeting) : `<span class="muted">—</span>`}</dd>
        <dt>${t("created")}</dt><dd>${created && !Number.isNaN(created.getTime()) ? escapeHtml(formatDateTime(created)) : `<span class="muted">—</span>`}</dd>
      </dl>
      ${item.status === "pending" ? `<div class="detail-actions">${doneButton(item, "primary")}</div>` : ""}
    </article>
  `;
}

// One write per click (a ChangeRequest outside a standalone run). In Today's
// split queue the next item opens once this one leaves the queue, so the list
// is worked top to bottom without reaching for the mouse.
export async function markDone(recordId) {
  const { view, selectedId } = state.route;
  const queue = viewRows(view);
  const index = queue.findIndex((item) => item.record_id === recordId);
  const advance = view === "today" && selectedId === recordId;
  try {
    await state.provider.applyDecision({ action: "done", record_id: recordId });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    render();
    return;
  }
  await loadState();
  state.notice = t("markedDone");
  if (advance) {
    const next = viewRows(view).find((item, position) => position >= index) || viewRows(view).at(-1);
    replaceRoute(next ? recordUrl(next.record_id, view) : listUrl());
  } else {
    render();
  }
}
