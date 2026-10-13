import {
  accountName,
  accounts,
  awaitingConversations,
  conversationById,
  conversationPreview,
  conversations,
  conversationTitle,
  DETAIL_MODES,
  dateTime,
  detailUrl,
  shortDate,
  els,
  enumLabel,
  escapeHtml,
  filteredAccounts,
  filteredConversations,
  filteredReplies,
  flashNotice,
  isPartial,
  loadState,
  outboxReplies,
  outboxStates,
  pendingRepliesFor,
  platformBadge,
  platformDot,
  recordById,
  recordUrl,
  render,
  state,
  statusChip,
  t,
  waitingLabel,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

function loadMoreControl(key) {
  if (!state.pagination[key]) return "";
  return `<div class="load-more"><button type="button" class="button" data-load-more="${escapeHtml(key)}" ${state.loadingMore[key] ? "disabled" : ""}>${state.loadingMore[key] ? t("loadingMore") : t("loadMore")}</button>${state.loadMoreError[key] ? `<span role="alert">${t("loadMoreFailed")}</span>` : ""}</div>`;
}

function warningsHtml(filter = () => true) {
  const items = (state.snapshot?.warnings || []).filter(filter);
  if (!items.length) return "";
  return `<div class="warnings">${items
    .map(
      (item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

// An account needs a human when the connector reports a problem or a token
// it needs is not configured.
function accountHasIssue(account) {
  const config = (state.settings?.config_summary?.accounts || []).find(
    (item) => item.account_id === account.account_id,
  );
  const warned = (state.snapshot?.warnings || []).some((item) => item.account_id === account.account_id);
  return warned || Boolean(config && config.secret_envs?.length && !config.secrets_ready);
}

function oldestWaiting() {
  return (
    awaitingConversations()
      .filter((item) => item.last_incoming_at)
      .sort((a, b) => String(a.last_incoming_at).localeCompare(String(b.last_incoming_at)))[0] || null
  );
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries needs-reply,
// ready-to-send and blocked). Unread is an exact records.count; the other two
// are read from the loaded page and say so when more rows exist.
function metricsBand() {
  const unread = state.workflowCount.unread ?? conversations().filter((item) => item.unread).length;
  const oldest = oldestWaiting();
  const loadedSuffix = (key) => (isPartial(key) ? ` · ${t("loadedOnly")}` : "");
  const issues = accounts().filter(accountHasIssue).length;
  const cells = [
    `<a href="#/inbox"><span>${escapeHtml(t("unreadConversations"))}</span><strong>${unread}</strong></a>`,
    `<a href="${oldest ? recordUrl(oldest.conversation_id, "inbox") : "#/inbox"}"${oldest ? ` title="${escapeHtml(oldest.title)}"` : ""}><span>${escapeHtml(t("oldestWaiting") + loadedSuffix("conversations"))}</span><strong class="${oldest ? "warn" : ""}">${oldest ? waitingLabel(oldest.last_incoming_at) : "—"}</strong></a>`,
    `<a href="#/accounts"><span>${escapeHtml(t("accountsWithIssues") + loadedSuffix("accounts"))}</span><strong class="${issues ? "warn" : ""}">${issues}</strong></a>`,
  ];
  return cells.join("");
}

export function renderOverview() {
  const total = state.totalCount.conversations ?? `${conversations().length}${isPartial("conversations") ? "+" : ""}`;
  const accountTotal = state.totalCount.accounts ?? accounts().length;
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  document.getElementById("overviewSummary").textContent = [
    `${total} ${t("conversationCount")}`,
    `${accountTotal} ${t("accountCount")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const recent = conversations()
    .flatMap((item) => (item.messages || []).map((message) => ({ ...message, conversation: item })))
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
    .slice(0, 8);
  document.getElementById("overviewBody").innerHTML = `
    ${state.settings?.demo ? `<div class="demo-note">${t("demoNotice")}</div>` : ""}
    ${warningsHtml()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("platforms")}</h2>
        ${
          accounts()
            .map(
              (account) => `
          <a class="platform-row" href="${recordUrl(account.account_id, "accounts")}">
            <span class="platform-row-head">
              ${platformBadge(account.platform)}
              <strong>${escapeHtml(account.display_name)}</strong>
              <small>${escapeHtml(enumLabel(account.connector, "connector"))}</small>
            </span>
            <span class="platform-row-stats">
              <span><strong>${account.unread_count ?? 0}</strong> ${t("unread")}</span>
              <span><strong>${account.conversation_count ?? 0}</strong> ${t("conversationCount")}</span>
              <small>${t("lastSync")} ${account.last_sync_at ? dateTime(account.last_sync_at) : "—"}</small>
            </span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("recentActivity")}</h2>
        ${
          recent
            .map(
              (message) => `
          <a class="activity-row" href="${recordUrl(message.conversation.conversation_id, "inbox")}">
            <span class="activity-copy">
              <strong>${escapeHtml(message.sender)}</strong>
              <span>${escapeHtml(message.text)}</span>
            </span>
            <span class="activity-meta">
              ${platformBadge(message.conversation.platform)}
              <small>${dateTime(message.sent_at)}</small>
            </span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { inbox: "inboxHint", outbox: "outboxHint", accounts: "accountsHint" };
const VIEW_KEY = { inbox: "conversations", outbox: "replies", accounts: "accounts" };

function inboxTable(items) {
  return `
    <table class="ws-table messenger-table inbox-table">
      ${tableHead([[t("conversation")], [t("waiting"), "ws-col-num"]])}
      <tbody>
        ${items
          .map((conversation) => {
            const preview = conversationPreview(conversation);
            return `${rowOpen(conversation.conversation_id)}
              ${cell(
                `<span class="row-line">${platformDot(conversation.platform)}<span class="${conversation.unread ? "strong" : "row-name"}">${escapeHtml(conversation.title)}</span>${conversation.unread ? '<span class="unread-dot" aria-label="unread"></span>' : ""}<span class="row-preview">${escapeHtml(preview)}</span></span>`,
                `${conversation.title} — ${preview}`,
              )}
              ${cell(
                conversation.awaiting_reply
                  ? `<span class="wait-chip">${waitingLabel(conversation.last_incoming_at)}</span>`
                  : `<span class="muted">${shortDate(conversation.last_message_at)}</span>`,
                conversation.awaiting_reply
                  ? `${t("waited")} ${waitingLabel(conversation.last_incoming_at)}`
                  : dateTime(conversation.last_message_at),
                "ws-col-num",
              )}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function outboxTable(items) {
  return `
    <table class="ws-table messenger-table outbox-table">
      ${tableHead([[t("reply")], [t("status")]])}
      <tbody>
        ${items
          .map((reply) => {
            const title = conversationTitle(reply);
            return `${rowOpen(reply.reply_id)}
              ${cell(
                `<span class="row-line">${platformDot(reply.platform)}<span class="strong">#${reply.ref}</span><span class="row-name">${escapeHtml(title)}</span><span class="row-preview">${escapeHtml(reply.text)}</span></span>`,
                `#${reply.ref} ${title} — ${reply.text}`,
              )}
              ${cell(statusChip(reply.status))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function accountRows() {
  const configAccounts = state.settings?.config_summary?.accounts || [];
  if (accounts().length) return filteredAccounts();
  // Before the first sync the Base is empty; show what the settings declare.
  return configAccounts.map((account) => ({ ...account, unread_count: 0, conversation_count: 0, last_sync_at: "" }));
}

function readiness(account) {
  const config = (state.settings?.config_summary?.accounts || []).find(
    (item) => item.account_id === account.account_id,
  );
  if (!config || !config.secret_envs?.length) return "";
  return `<span class="env-ready ${config.secrets_ready ? "ok" : "missing"}">${config.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>`;
}

function accountsTable(items) {
  return `
    <table class="ws-table messenger-table accounts-table">
      ${tableHead([
        [t("account")],
        [t("platform")],
        [t("workspace")],
        [t("connector")],
        [t("conversations"), "ws-col-num"],
        [t("unreadHeader"), "ws-col-num"],
        [t("lastSync")],
        [t("secrets")],
      ])}
      <tbody>
        ${items
          .map(
            (account) => `${rowOpen(account.account_id)}
              ${cell(`<span class="strong">${escapeHtml(account.display_name)}</span>${accountHasIssue(account) ? ` <span class="issue-dot" title="${escapeHtml(t("needsAttention"))}"></span>` : ""}`, account.display_name)}
              ${cell(platformBadge(account.platform))}
              ${cell(escapeHtml(account.workspace || ""), account.workspace)}
              ${cell(escapeHtml(enumLabel(account.connector, "connector")))}
              ${cell(String(account.conversation_count ?? 0), "", "ws-col-num")}
              ${cell(String(account.unread_count ?? 0), "", "ws-col-num")}
              ${cell(account.last_sync_at ? dateTime(account.last_sync_at) : `<span class="muted">—</span>`)}
              ${cell(readiness(account) || `<span class="muted">—</span>`)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "inbox" ? filteredConversations() : view === "outbox" ? filteredReplies() : accountRows();
  els.viewCount.textContent = `${items.length}${isPartial(VIEW_KEY[view]) ? "+" : ""}`;
  els.statusSelect.hidden = view !== "outbox";
  if (view === "outbox") {
    els.statusSelect.innerHTML = outboxStates()
      .map((value) => {
        const count =
          value === "all"
            ? outboxReplies().length
            : (state.workflowCount[value] ?? outboxReplies().filter((reply) => reply.status === value).length);
        const label = value === "all" ? t("allReplies") : enumLabel(value);
        return `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(label)} (${count}${value === "all" && isPartial("replies") ? "+" : ""})</option>`;
      })
      .join("");
  }
  const table = view === "inbox" ? inboxTable(items) : view === "outbox" ? outboxTable(items) : accountsTable(items);
  const empty = state.route.query
    ? emptyState(t("noMatches"))
    : view === "inbox"
      ? emptyState(t("empty"))
      : view === "outbox"
        ? emptyState(t("noOutbox"))
        : emptyState(t("setupNeeded"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${loadMoreControl(VIEW_KEY[view])}`;
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
      DETAIL_MODES[view] === "split" ? emptyState(t(view === "inbox" ? "noConversation" : "selectReply")) : "";
    return;
  }
  const record = recordById(view, selectedId);
  if (!record) {
    els.detailBody.innerHTML = emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML =
    view === "inbox" ? conversationDetail(record) : view === "outbox" ? replyDetail(record) : accountDetail(record);
}

function conversationDetail(conversation) {
  const pending = pendingRepliesFor(conversation.conversation_id);
  const draft = state.drafts[conversation.conversation_id];
  const prefill =
    draft !== undefined ? draft : !pending.length && conversation.suggested_reply ? conversation.suggested_reply : "";
  const showSuggestedNote = draft === undefined && !pending.length && Boolean(conversation.suggested_reply);
  const id = escapeHtml(conversation.conversation_id);
  return `
    <div class="detail-head">
      <h2>${escapeHtml(conversation.title)}</h2>
      <div class="detail-chips">
        ${platformBadge(conversation.platform)}
        ${conversation.kind ? `<span class="badge">${escapeHtml(enumLabel(conversation.kind, "kind"))}</span>` : ""}
        ${conversation.channel ? `<span class="badge">${escapeHtml(conversation.channel)}</span>` : ""}
        ${conversation.workspace ? `<span class="muted">${escapeHtml(conversation.workspace)}</span>` : ""}
      </div>
      <div class="muted">${t("participants")}: ${escapeHtml((conversation.participants || []).join(", "))}</div>
    </div>
    <div class="transcript">
      ${(conversation.messages || [])
        .map(
          (message) => `
        <div class="bubble-row ${message.direction === "outgoing" ? "out" : "in"}">
          <div class="bubble">
            <div class="bubble-meta"><strong>${escapeHtml(message.sender)}</strong><span>${dateTime(message.sent_at)}</span></div>
            <div class="bubble-text">${escapeHtml(message.text)}</div>
            ${message.attachment ? `<div class="bubble-attachment">${escapeHtml(message.attachment)}</div>` : ""}
          </div>
        </div>
      `,
        )
        .join("")}
      ${loadMoreControl("messages")}
      ${pending
        .map(
          (reply) => `
        <div class="bubble-row out">
          <a class="bubble queued-bubble" href="${recordUrl(reply.reply_id, "outbox")}">
            <div class="bubble-meta">
              <strong>${t("reply")} #${reply.ref}</strong>
              <span class="status-chip ${escapeHtml(reply.status)}">${t("queued")} · ${escapeHtml(enumLabel(reply.status))}</span>
            </div>
            <div class="bubble-text">${escapeHtml(reply.text)}</div>
          </a>
        </div>
      `,
        )
        .join("")}
    </div>
    <div class="composer">
      ${showSuggestedNote ? `<div class="composer-hint">${t("agentSuggestedPrefill")}</div>` : ""}
      <textarea id="composer-text" data-conversation="${id}" rows="4" placeholder="${escapeHtml(t("replyPlaceholder"))}">${escapeHtml(prefill)}</textarea>
      <input id="composer-note" data-conversation="${id}" type="text" placeholder="${escapeHtml(t("notePlaceholder"))}" value="${escapeHtml(state.notes[conversation.conversation_id] || "")}">
      <div class="composer-actions">
        <button type="button" class="button primary" data-action="queue-reply" data-conversation="${id}">${t("queueReply")}</button>
      </div>
    </div>
  `;
}

function replyDetail(reply) {
  const editable = reply.status !== "done";
  const value = state.edits[reply.reply_id] !== undefined ? state.edits[reply.reply_id] : reply.text;
  const id = escapeHtml(reply.reply_id);
  return `
    <article class="reply-detail" data-reply-card="${id}">
      <div class="detail-head">
        <h2>${t("reply")} #${reply.ref}</h2>
        <div class="detail-chips">
          ${statusChip(reply.status)}
          ${platformBadge(reply.platform)}
          <a class="detail-link" href="${recordUrl(reply.conversation_id, "inbox")}">${escapeHtml(conversationTitle(reply))}</a>
          <small class="muted">${dateTime(reply.created_at)}</small>
        </div>
      </div>
      ${reply.reason ? `<div class="outbox-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(reply.reason)}</div>` : ""}
      ${reply.note ? `<div class="outbox-reason"><span class="muted">${t("note")}:</span> ${escapeHtml(reply.note)}</div>` : ""}
      ${
        editable
          ? `<textarea class="outbox-text" data-reply-text rows="6">${escapeHtml(value)}</textarea>`
          : `<div class="outbox-sent-text">${escapeHtml(reply.text)}</div>`
      }
      ${reply.decision?.comment ? `<div class="outbox-reason"><span class="muted">${t("comment")}:</span> ${escapeHtml(reply.decision.comment)} <small class="muted">(${t("decidedAt")} ${dateTime(reply.decision.decided_at)})</small></div>` : ""}
      ${reply.status === "approved" ? `<div class="outbox-waiting">${t("waitingForSend")}</div>` : ""}
      ${reply.execution ? `<div class="outbox-execution">${t("sentVia")} ${escapeHtml(enumLabel(reply.execution.connector, "connector"))} · ${t("target")} ${escapeHtml(reply.execution.target || "")} · ${escapeHtml(enumLabel(reply.execution.status))} ${reply.execution.executed_at ? `· ${dateTime(reply.execution.executed_at)}` : ""}</div>` : ""}
      ${
        editable
          ? `
        <div class="outbox-actions">
          <input type="text" data-reply-comment placeholder="${escapeHtml(t("commentPlaceholder"))}">
          <div class="outbox-buttons">
            <button type="button" class="button primary" data-action="decide" data-reply="${id}" data-decision="approve">${t("approve")}</button>
            <button type="button" class="button" data-action="decide" data-reply="${id}" data-decision="request_changes">${t("requestChanges")}</button>
            <button type="button" class="button" data-action="decide" data-reply="${id}" data-decision="revise">${t("saveEdit")}</button>
            <button type="button" class="button danger" data-action="decide" data-reply="${id}" data-decision="block">${t("block")}</button>
          </div>
        </div>
      `
          : ""
      }
    </article>
  `;
}

function accountDetail(account) {
  const owned = conversations()
    .filter((item) => item.account_id === account.account_id)
    .slice(0, 8);
  const syncs = (state.snapshot?.sync_log || [])
    .filter((entry) => entry.account_id === account.account_id)
    .slice(-5)
    .reverse();
  return `
    <div class="detail-head">
      <h2>${escapeHtml(account.display_name)}</h2>
      <div class="detail-chips">
        ${platformBadge(account.platform)}
        ${readiness(account)}
        ${account.workspace ? `<span class="muted">${escapeHtml(account.workspace)}</span>` : ""}
      </div>
    </div>
    ${warningsHtml((item) => item.account_id === account.account_id)}
    <dl class="detail-fields">
      <dt>${t("connector")}</dt><dd>${escapeHtml(enumLabel(account.connector, "connector")) || "—"}</dd>
      <dt>${t("conversations")}</dt><dd class="num-inline">${account.conversation_count ?? 0}</dd>
      <dt>${t("unreadHeader")}</dt><dd class="num-inline">${account.unread_count ?? 0}</dd>
      <dt>${t("lastSync")}</dt><dd>${account.last_sync_at ? dateTime(account.last_sync_at) : "—"}</dd>
    </dl>
    <h3>${t("conversations")}</h3>
    ${
      owned
        .map(
          (item) => `
      <a class="detail-row" href="${recordUrl(item.conversation_id, "inbox")}">
        <strong>${escapeHtml(item.title)}</strong>
        <small class="muted">${dateTime(item.last_message_at)}</small>
      </a>
    `,
        )
        .join("") || `<div class="empty-inline">—</div>`
    }
    <h3>${t("syncLog")}</h3>
    ${
      syncs
        .map(
          (entry) => `
      <div class="detail-row">
        <span>${escapeHtml(entry.message || enumLabel(entry.status))}</span>
        <small class="muted">${escapeHtml(enumLabel(entry.method, "connector"))} · ${dateTime(entry.at)}</small>
      </div>
    `,
        )
        .join("") || `<div class="empty-inline">—</div>`
    }
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const syncLog = state.snapshot?.sync_log || [];
  const report = state.settings?.execution_report;
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          ${summary.config_path ? `<dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path)}</dd>` : ""}
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          ${summary.reply_style ? `<dt>${t("replyStyle")}</dt><dd>${escapeHtml(summary.reply_style.tone || "")}</dd>` : ""}
          ${summary.sync?.cadence_minutes ? `<dt>${t("syncCadence")}</dt><dd>${escapeHtml(String(summary.sync.cadence_minutes))} ${t("minutes")}</dd>` : ""}
        </dl>
      </section>
      <section class="card">
        <h2>${t("accounts")}</h2>
        ${
          (summary.accounts || [])
            .map(
              (account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.platform, "platform"))} · ${escapeHtml(enumLabel(account.connector, "connector"))}</span>
            <span>${account.secret_envs.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("syncLog")}</h2>
        ${
          syncLog.length
            ? syncLog
                .slice(-8)
                .reverse()
                .map(
                  (entry) => `
          <div class="settings-account">
            <strong>${escapeHtml(accountName(entry.account_id))}</strong>
            <span>${escapeHtml(enumLabel(entry.method, "connector"))} · ${dateTime(entry.at)}</span>
            <span>${escapeHtml(entry.message || "")}</span>
          </div>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
        ${loadMoreControl("sync-log")}
      </section>
      ${
        report
          ? `
        <section class="card">
          <h2>${t("executionReport")}</h2>
          ${(report.results || [])
            .map(
              (result) => `
            <div class="settings-account">
              <strong>${t("reply")} #${result.ref}</strong>
              <span>${escapeHtml(enumLabel(result.status))} · ${escapeHtml(enumLabel(result.connector, "connector"))}</span>
              <span>${escapeHtml(result.detail || result.target || "")}</span>
            </div>
          `,
            )
            .join("")}
        </section>
      `
          : ""
      }
    </div>
  `;
}

// ── Writes ─────────────────────────────────────────────────────────────────
export async function queueReplyAction(conversationId) {
  const text = String(
    state.drafts[conversationId] !== undefined
      ? state.drafts[conversationId]
      : els.detailBody.querySelector("#composer-text")?.value || "",
  ).trim();
  const note = String(state.notes[conversationId] || "").trim();
  if (!text) return;
  if (state.settings?.demo) {
    const conversation = conversationById(conversationId);
    state.demoRef += 1;
    state.outbox.replies.push({
      reply_id: `reply-demo-local-${state.demoRef}`,
      ref: outboxReplies().reduce((max, reply) => Math.max(max, reply.ref || 0), 0) + 1,
      conversation_id: conversationId,
      account_id: conversation?.account_id || "",
      platform: conversation?.platform || "",
      conversation_title: conversation?.title || "",
      text,
      note,
      reason: "Queued from the inbox composer.",
      suggested_by: "human",
      status: "needs_review",
      decision: null,
      execution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    delete state.drafts[conversationId];
    delete state.notes[conversationId];
    flashNotice(`${t("queuedNotice")} ${t("demoNotice")}`);
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.queueReply({ conversation_id: conversationId, text, note, suggested_by: "human" });
  } catch (error) {
    flashNotice(error.message || "Queue failed", "error");
    return;
  }
  delete state.drafts[conversationId];
  delete state.notes[conversationId];
  flashNotice(t("queuedNotice"));
  await loadState();
}

export async function decideAction(replyId, action, card) {
  const comment = String(card?.querySelector("[data-reply-comment]")?.value || "").trim();
  const text = state.edits[replyId];
  if (state.settings?.demo) {
    const reply = outboxReplies().find((item) => item.reply_id === replyId);
    if (!reply) return;
    if (typeof text === "string" && text.trim()) reply.text = text.trim();
    if (action === "approve") reply.status = "approved";
    else if (action === "request_changes") reply.status = "changes_requested";
    else if (action === "block") reply.status = "blocked";
    reply.decision = { action, comment, decided_at: new Date().toISOString() };
    delete state.edits[replyId];
    flashNotice(t("demoNotice"));
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.decideReply({ reply_id: replyId, action, comment, text });
  } catch (error) {
    flashNotice(error.message || "Decision failed", "error");
    return;
  }
  delete state.edits[replyId];
  await loadState();
}

