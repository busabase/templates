import {
  accountName,
  accounts,
  bindOps,
  bindPlatformChips,
  bindWorkflowChips,
  byWorkflow,
  calendar,
  channelBadges,
  crisis,
  date,
  dateTime,
  delta,
  drafts,
  els,
  engagement,
  enumLabel,
  escapeHtml,
  filteredPosts,
  gateBadge,
  gatePanel,
  mediaIndicator,
  methodBadge,
  num,
  openReview,
  paginationControl,
  pct,
  platformBadge,
  platformChips,
  posts,
  recordById,
  recordTotal,
  recordUrl,
  renderDetailChrome,
  reviewActions,
  reviewBadge,
  shorts,
  sparkline,
  state,
  syncLog,
  t,
  workflowChips,
} from "../app.js";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const rowOpen = (id) => `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

// ── Calendar (plain table, no record to open) ──────────────────────────────
export function renderCalendarView() {
  els.viewTitle.textContent = t("contentCalendar");
  els.viewTitle.title = "";
  const list = [...calendar()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  els.viewCount.textContent = `${recordTotal("calendar", list.length)}`;
  els.viewFilters.hidden = true;
  els.viewFilters.innerHTML = "";
  els.listPanel.innerHTML = list.length
    ? `
    <table class="ws-table calendar-table">
      ${tableHead([[t("date")], [t("channel")], [t("pillar")], [t("post")], [t("status")]])}
      <tbody>
        ${list
          .map(
            (entry) => `
          <tr>
            ${cell(`<strong>${date(entry.date)}</strong>${entry.scheduled_for ? `<div class="muted">${dateTime(entry.scheduled_for)}</div>` : ""}`)}
            ${cell(platformBadge(entry.channel))}
            ${cell(`<span class="badge pillar">${escapeHtml(entry.pillar)}</span>`)}
            ${cell(
              `${
                entry.draft_id
                  ? `<a class="post-link" href="${recordUrl(entry.draft_id, "compose")}">${escapeHtml(entry.title)}</a>`
                  : `<span class="strong">${escapeHtml(entry.title)}</span>`
              }${entry.notes ? `<div class="muted">${escapeHtml(entry.notes)}</div>` : ""}`,
              entry.title,
              "post-cell",
            )}
            ${cell(`<span class="status cal-${escapeHtml(entry.status)}">${escapeHtml(enumLabel(entry.status, "calstatus"))}</span>`)}
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
    ${paginationControl("calendar")}
  `
    : `<div class="empty">${t("noItems")}</div>`;
}

// ── Compose (drafts queue; split detail) ────────────────────────────────────
export function renderComposeView() {
  const all = drafts();
  const list = byWorkflow(all);
  els.viewTitle.textContent = t("composerQueue");
  els.viewTitle.title = t("composerQueue");
  els.viewCount.textContent = `${openReview(all).length} ${t("needsReviewCount")}`;
  els.viewFilters.hidden = false;
  els.viewFilters.innerHTML = workflowChips(all);
  els.listPanel.innerHTML = `
    ${
      list.length
        ? `<table class="ws-table queue-table">
      ${tableHead([[t("post")], [t("pillar")], [t("channel"), "ws-col-narrow"], [t("qualityGate"), "ws-col-narrow"], [t("status"), "ws-col-narrow"]])}
      <tbody>
        ${list
          .map(
            (draft) => `${rowOpen(draft.draft_id)}
          ${cell(`<span class="strong">${escapeHtml(draft.hook)}</span>`, draft.hook)}
          ${cell(`<span class="badge pillar">${escapeHtml(draft.pillar)}</span>`)}
          ${cell(channelBadges(draft.channels), "", "ws-split-keep")}
          ${cell(gateBadge(draft.gate))}
          ${cell(reviewBadge(draft.status))}
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    ${paginationControl("drafts")}`
        : `<div class="empty">${t("noItems")}</div>`
    }
  `;
  bindWorkflowChips();
  const draft = renderDetailChrome(t("selectRecord"));
  if (draft) els.detailBody.innerHTML = draftCard(draft);
  bindOps();
}

function draftCard(draft) {
  const disabled = state.busy ? "disabled" : "";
  const canPublish = draft.status === "approved" && draft.gate?.verdict !== "BLOCK";
  return `
    <article class="desk-card">
      <div class="desk-head">
        <div class="row wrap">${channelBadges(draft.channels)}<span class="badge pillar">${escapeHtml(draft.pillar)}</span></div>
        <div class="row wrap">${gateBadge(draft.gate)}${reviewBadge(draft.status)}</div>
      </div>
      <p class="desk-hook">${escapeHtml(draft.hook)}</p>
      <p class="desk-body">${escapeHtml(draft.body)}</p>
      <div class="desk-meta">
        ${(draft.hashtags || []).length ? `<div class="tags">${draft.hashtags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${draft.cta ? `<div class="muted"><strong>${t("cta")}:</strong> ${escapeHtml(draft.cta)}</div>` : ""}
        ${draft.scheduled_for ? `<div class="muted"><strong>${t("scheduledFor")}:</strong> ${dateTime(draft.scheduled_for)}</div>` : ""}
      </div>
      ${draft.agent_notes ? `<div class="warnings info"><div><strong>${t("agentNotes")}</strong><span>${escapeHtml(draft.agent_notes)}</span></div></div>` : ""}
      ${draft.review_note ? `<div class="muted review-note"><strong>${t("reviewNote")}:</strong> ${escapeHtml(draft.review_note)}</div>` : ""}
      ${gatePanel(draft.gate)}
      ${draft.gate?.verdict === "BLOCK" ? `<div class="gate-block-note">${t("gateBlockedNote")}</div>` : ""}
      ${reviewActions("draft", draft.draft_id, draft)}
      ${
        canPublish
          ? `<div class="actions publish-row"><button type="button" class="btn-approve" data-op="publish_post" data-idkey="draft_id" data-id="${escapeHtml(draft.draft_id)}" ${disabled}>${t("publish")}</button></div>`
          : ""
      }
    </article>
  `;
}

// ── Shorts (short-video scripts queue; split detail) ────────────────────────
export function renderShortsView() {
  const all = shorts();
  const list = byWorkflow(all);
  els.viewTitle.textContent = t("shortScripts");
  els.viewTitle.title = t("shortScripts");
  els.viewCount.textContent = `${recordTotal("shorts", all.length)} ${t("shorts")}`;
  els.viewFilters.hidden = false;
  els.viewFilters.innerHTML = workflowChips(all);
  els.listPanel.innerHTML = `
    ${
      list.length
        ? `<table class="ws-table queue-table">
      ${tableHead([[t("post")], [t("pillar")], [t("channel"), "ws-col-narrow"], [t("duration"), "ws-col-narrow ws-col-num"], [t("status"), "ws-col-narrow"]])}
      <tbody>
        ${list
          .map(
            (short) => `${rowOpen(short.short_id)}
          ${cell(`<span class="strong">${escapeHtml(short.title)}</span>`, short.title)}
          ${cell(`<span class="badge pillar">${escapeHtml(short.pillar)}</span>`)}
          ${cell(channelBadges(short.channels), "", "ws-split-keep")}
          ${cell(`${escapeHtml(String(short.duration_s))}s`, "", "ws-col-num")}
          ${cell(reviewBadge(short.status))}
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    ${paginationControl("shorts")}`
        : `<div class="empty">${t("noItems")}</div>`
    }
  `;
  bindWorkflowChips();
  const short = renderDetailChrome(t("selectRecord"));
  if (short) els.detailBody.innerHTML = shortCard(short);
  bindOps();
}

function shortCard(short) {
  return `
    <article class="desk-card">
      <div class="desk-head">
        <div class="row wrap">${channelBadges(short.channels)}<span class="badge pillar">${escapeHtml(short.pillar)}</span></div>
        <div class="row wrap"><span class="badge method">${escapeHtml(short.duration_s)}s</span>${reviewBadge(short.status)}</div>
      </div>
      <h3 class="desk-title">${escapeHtml(short.title)}</h3>
      <p class="desk-hook">${escapeHtml(short.hook)}</p>
      <div class="shotlist">
        <div class="shotlist-head">${t("shotList")}</div>
        ${(short.shots || [])
          .map(
            (shot) => `
          <div class="shot-row">
            <span class="shot-no">${escapeHtml(String(shot.shot_no))}</span>
            <span class="shot-visual"><strong>${escapeHtml(shot.visual)}</strong>${shot.on_screen_text ? `<small>${t("onScreen")}: ${escapeHtml(shot.on_screen_text)}</small>` : ""}</span>
            <span class="shot-vo"><small>${t("voiceover")}</small>${escapeHtml(shot.voiceover)}</span>
            <span class="shot-dur num">${escapeHtml(String(shot.duration_s))}s</span>
          </div>
        `,
          )
          .join("")}
      </div>
      ${short.caption ? `<div class="muted"><strong>${t("caption")}:</strong> ${escapeHtml(short.caption)}</div>` : ""}
      ${(short.hashtags || []).length ? `<div class="tags">${short.hashtags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${short.agent_notes ? `<div class="warnings info"><div><strong>${t("agentNotes")}</strong><span>${escapeHtml(short.agent_notes)}</span></div></div>` : ""}
      ${short.review_note ? `<div class="muted review-note"><strong>${t("reviewNote")}:</strong> ${escapeHtml(short.review_note)}</div>` : ""}
      ${reviewActions("short", short.short_id, short)}
    </article>
  `;
}

// ── Engagement (inbox queue; split detail) ──────────────────────────────────
export function renderEngagementView() {
  const all = engagement();
  const list = byWorkflow(all);
  els.viewTitle.textContent = t("engagementInbox");
  els.viewTitle.title = t("engagementInbox");
  els.viewCount.textContent = `${openReview(all).length} ${t("needsReviewCount")}`;
  els.viewFilters.hidden = false;
  els.viewFilters.innerHTML = workflowChips(all);
  els.listPanel.innerHTML = `
    ${
      list.length
        ? `<table class="ws-table queue-table">
      ${tableHead([[t("from")], [t("incoming")], [t("platform"), "ws-col-narrow"], [t("sentiment"), "ws-col-narrow"], [t("status"), "ws-col-narrow"]])}
      <tbody>
        ${list
          .map(
            (item) => `${rowOpen(item.item_id)}
          ${cell(`<span class="strong">${escapeHtml(item.author_handle)}</span>`, item.author_handle)}
          ${cell(escapeHtml(item.incoming_text), item.incoming_text)}
          ${cell(platformBadge(item.platform), "", "ws-split-keep")}
          ${cell(`<span class="badge sentiment-${escapeHtml(item.sentiment)}">${escapeHtml(enumLabel(item.sentiment, "sentiment"))}</span>${item.priority === "high" ? ` <span class="badge prio-high">${escapeHtml(enumLabel(item.priority, "priority"))}</span>` : ""}`)}
          ${cell(reviewBadge(item.status))}
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    ${paginationControl("engagement")}`
        : `<div class="empty">${t("noItems")}</div>`
    }
  `;
  bindWorkflowChips();
  const item = renderDetailChrome(t("selectRecord"));
  if (item) els.detailBody.innerHTML = engagementCard(item);
  bindOps();
}

function engagementCard(item) {
  const disabled = state.busy ? "disabled" : "";
  const canSend = item.status === "approved";
  return `
    <article class="desk-card">
      <div class="desk-head">
        <div class="row wrap">${platformBadge(item.platform)}<span class="badge kind">${escapeHtml(enumLabel(item.kind, "kind"))}</span><span class="badge sentiment-${escapeHtml(item.sentiment)}">${escapeHtml(enumLabel(item.sentiment, "sentiment"))}</span>${item.priority === "high" ? `<span class="badge prio-high">${escapeHtml(enumLabel(item.priority, "priority"))}</span>` : ""}</div>
        <div class="row wrap">${reviewBadge(item.status)}</div>
      </div>
      <div class="incoming-msg">
        <div class="muted">${t("from")} <strong>${escapeHtml(item.author_handle)}</strong> · ${dateTime(item.received_at)}</div>
        <p>${escapeHtml(item.incoming_text)}</p>
      </div>
      <div class="reply-msg">
        <div class="muted"><strong>${t("draftReply")}</strong></div>
        <p>${escapeHtml(item.draft_reply)}</p>
      </div>
      ${item.review_note ? `<div class="muted review-note"><strong>${t("reviewNote")}:</strong> ${escapeHtml(item.review_note)}</div>` : ""}
      ${reviewActions("engagement", item.item_id, item)}
      ${
        canSend
          ? `<div class="actions publish-row"><button type="button" class="btn-approve" data-op="send_reply" data-idkey="item_id" data-id="${escapeHtml(item.item_id)}" data-channel="${escapeHtml(item.platform)}" ${disabled}>${t("sendReply")}</button></div>`
          : ""
      }
    </article>
  `;
}

// ── Crisis (single incident board — not a record list) ─────────────────────
export function renderCrisis() {
  const plan = crisis();
  if (!plan) {
    els.crisisBody.innerHTML = `<div class="empty">${t("noItems")}</div>`;
    return;
  }
  const disabled = state.busy ? "disabled" : "";
  els.crisisBody.innerHTML = `
    <section class="crisis">
      <div class="crisis-status crisis-${escapeHtml(plan.status)}">
        <div>
          <div class="crisis-eyebrow">${t("incidentStatus")}</div>
          <div class="crisis-state">${escapeHtml(enumLabel(plan.status, "incident"))}</div>
          ${plan.spokesperson ? `<div class="muted">${t("spokesperson")}: ${escapeHtml(plan.spokesperson)}</div>` : ""}
        </div>
        <div class="crisis-controls">
          <div class="pub-flag ${plan.publishing_paused ? "paused" : "live"}">${plan.publishing_paused ? t("publishingPaused") : t("publishingLive")}</div>
          <button type="button" data-op="crisis_toggle" data-paused="${plan.publishing_paused ? "false" : "true"}" ${disabled}>${plan.publishing_paused ? t("resumePublishing") : t("pausePublishing")}</button>
        </div>
      </div>
      <div class="crisis-severity">
        <button type="button" class="${plan.status === "calm" ? "active" : ""}" data-op="crisis_toggle" data-incident="calm" ${disabled}>${t("setCalm")}</button>
        <button type="button" class="${plan.status === "watch" ? "active" : ""}" data-op="crisis_toggle" data-incident="watch" ${disabled}>${t("setWatch")}</button>
        <button type="button" class="btn-danger ${plan.status === "active" ? "active" : ""}" data-op="crisis_toggle" data-incident="active" ${disabled}>${t("setActive")}</button>
      </div>
      <div class="crisis-steps">
        ${(plan.steps || [])
          .map(
            (step) => `
          <label class="crisis-step ${step.done ? "done" : ""}">
            <input type="checkbox" data-op="crisis_toggle" data-step-id="${escapeHtml(step.step_id)}" ${step.done ? "checked" : ""} ${disabled}>
            <span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small>${step.owner ? `<small class="crisis-owner">${escapeHtml(step.owner)}</small>` : ""}</span>
          </label>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
  bindOps(els.crisisBody);
}

// ── Timeline (posts feed; full-page detail) ─────────────────────────────────
export function renderTimelineView() {
  const list = filteredPosts();
  els.viewTitle.textContent = t("timeline");
  els.viewTitle.title = t("timeline");
  els.viewCount.textContent = `${recordTotal("posts", list.length)} ${t("posts")}`;
  els.viewFilters.hidden = false;
  els.viewFilters.innerHTML = platformChips();
  els.listPanel.innerHTML = `${warnings()}${timelineTable(list)}${paginationControl("posts")}`;
  bindPlatformChips();
  const post = renderDetailChrome(t("selectRecord"));
  if (post) els.detailBody.innerHTML = postDetailContent(post);
}

export function timelineTable(list) {
  if (!list.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <table class="ws-table">
      ${tableHead([
        [t("date")],
        [t("platform"), "ws-col-narrow"],
        [t("account"), "ws-col-wide ws-split-keep"],
        [t("post")],
        [t("likes"), "ws-col-num"],
        [t("replies"), "ws-col-num"],
        [t("reposts"), "ws-col-num"],
        [t("views"), "ws-col-num"],
      ])}
      <tbody>
        ${list
          .map(
            (post) => `${rowOpen(post.post_id)}
          ${cell(dateTime(post.posted_at))}
          ${cell(platformBadge(post.platform))}
          ${cell(escapeHtml(accountName(post.account_id)), "", "ws-split-keep")}
          ${cell(
            `<span class="strong">${escapeHtml(truncateText(post.text, 110))}</span><div class="muted">${escapeHtml(enumLabel(post.type, "type"))}${post.media && post.media !== "none" ? " · " : ""}${mediaIndicator(post)}</div>`,
            post.text,
            "post-cell",
          )}
          ${cell(num(post.metrics?.likes), "", "ws-col-num")}
          ${cell(num(post.metrics?.replies), "", "ws-col-num")}
          ${cell(num(post.metrics?.reposts), "", "ws-col-num")}
          ${cell(num(post.metrics?.views), "", "ws-col-num")}
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function truncateText(value, length) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function postDetailContent(post) {
  const metrics = post.metrics || {};
  return `
    <header class="detail-head">
      <h2>${t("postDetail")}</h2>
      <p class="muted">${escapeHtml(enumLabel(post.platform, "platform"))} · ${escapeHtml(accountName(post.account_id))} · ${dateTime(post.posted_at)}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <div class="post-panel">
          <div class="row between">
            ${platformBadge(post.platform)}
            <span class="muted">${dateTime(post.posted_at)}</span>
          </div>
          <p class="post-text">${escapeHtml(post.text)}</p>
          <div class="muted">${escapeHtml(enumLabel(post.type, "type"))} ${mediaIndicator(post)}</div>
          ${post.permalink ? `<a class="permalink" href="${escapeHtml(post.permalink)}" target="_blank" rel="noreferrer noopener">${t("permalink")} ↗</a>` : ""}
        </div>
        <h2>${t("metricsBreakdown")}</h2>
        <div class="metrics post-metrics">
          <div class="metric"><span>${t("likes")}</span><strong>${num(metrics.likes)}</strong></div>
          <div class="metric"><span>${t("replies")}</span><strong>${num(metrics.replies)}</strong></div>
          <div class="metric"><span>${t("reposts")}</span><strong>${num(metrics.reposts)}</strong></div>
          <div class="metric"><span>${t("views")}</span><strong>${num(metrics.views)}</strong></div>
          <div class="metric"><span>${t("saves")}</span><strong>${num(metrics.saves)}</strong></div>
          <div class="metric"><span>${t("clicks")}</span><strong>${num(metrics.clicks)}</strong></div>
          <div class="metric"><span>${t("engagementRate")}</span><strong>${pct(post.engagement_rate)}</strong></div>
        </div>
        ${post.agent_notes ? `<div class="warnings info"><div><strong>${t("agentNotes")}</strong><span>${escapeHtml(post.agent_notes)}</span></div></div>` : ""}
      </div>
      <aside class="detail-side">
        <h2>${t("postDetail")}</h2>
        <dl>
          <dt>${t("platform")}</dt><dd>${escapeHtml(enumLabel(post.platform, "platform"))}</dd>
          <dt>${t("account")}</dt><dd><a href="${recordUrl(post.account_id, "accounts")}">${escapeHtml(accountName(post.account_id))}</a></dd>
          <dt>${t("postedAt")}</dt><dd>${dateTime(post.posted_at)}</dd>
          <dt>${t("type")}</dt><dd>${escapeHtml(enumLabel(post.type, "type"))}</dd>
          <dt>${t("media")}</dt><dd>${escapeHtml(enumLabel(post.media, "media"))}</dd>
          ${post.permalink ? `<dt>${t("permalink")}</dt><dd><a href="${escapeHtml(post.permalink)}" target="_blank" rel="noreferrer noopener">${escapeHtml(post.permalink)}</a></dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
}

// ── Accounts (profiles; drawer detail) ──────────────────────────────────────
export function renderAccountsView() {
  const list = accounts();
  els.viewTitle.textContent = t("accounts");
  els.viewTitle.title = t("accounts");
  els.viewCount.textContent = `${recordTotal("accounts", list.length)} ${t("configured")}`;
  els.viewFilters.hidden = true;
  els.viewFilters.innerHTML = "";
  els.listPanel.innerHTML = list.length
    ? `
    ${warnings()}
    <table class="ws-table">
      ${tableHead([
        [t("handle")],
        [t("platform"), "ws-col-narrow"],
        [t("followers"), "ws-col-num ws-split-keep"],
        [t("delta7d"), "ws-col-num"],
        [t("engagementRate"), "ws-col-num"],
        [t("collection")],
        [t("lastSync")],
        [t("status"), "ws-col-narrow"],
      ])}
      <tbody>
        ${list
          .map(
            (account) => `${rowOpen(account.account_id)}
          ${cell(`<span class="strong">${escapeHtml(account.handle)}</span><div class="muted">${escapeHtml(account.display_name)}</div>`, account.handle)}
          ${cell(platformBadge(account.platform))}
          ${cell(num(account.metrics?.followers), "", "ws-col-num ws-split-keep")}
          ${cell(delta(account.metrics?.followers_delta_7d), "", "ws-col-num")}
          ${cell(pct(account.metrics?.engagement_rate_7d), "", "ws-col-num")}
          ${cell(methodBadge(account.collection))}
          ${cell(dateTime(account.last_sync_at))}
          ${cell(`<span class="status ${escapeHtml(account.status)}">${escapeHtml(enumLabel(account.status))}</span>`)}
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    ${paginationControl("accounts")}
  `
    : `<div class="empty">${t("empty")}</div>`;
  const account = renderDetailChrome(t("selectRecord"));
  if (account) els.detailBody.innerHTML = accountDetailContent(account);
}

function accountDetailContent(account) {
  const metrics = account.metrics || {};
  const accountPosts = filteredPosts(account.account_id).slice(0, 8);
  const history = syncLog().filter((entry) => entry.account_id === account.account_id);
  const seriesData = account.follower_series || [];
  const first = seriesData[0]?.followers;
  const last = seriesData[seriesData.length - 1]?.followers;
  return `
    <header class="detail-head">
      <h2>${escapeHtml(account.handle || account.display_name)}</h2>
      <p class="muted">${escapeHtml(enumLabel(account.platform, "platform"))} · ${escapeHtml(enumLabel(account.collection, "method"))} · ${escapeHtml(enumLabel(account.status))}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        ${warnings(account.account_id)}
        <div class="metrics">
          <div class="metric"><span>${t("followers")}</span><strong>${num(metrics.followers)}</strong><small>${delta(metrics.followers_delta_7d)} ${t("delta7d")} · ${delta(metrics.followers_delta_28d)} ${t("delta28d")}</small></div>
          <div class="metric"><span>${t("impressions7d")}</span><strong>${num(metrics.impressions_7d)}</strong></div>
          <div class="metric"><span>${t("engagementRate7d")}</span><strong>${pct(metrics.engagement_rate_7d)}</strong></div>
          <div class="metric"><span>${t("profileVisits")}</span><strong>${num(metrics.profile_visits_7d)}</strong></div>
        </div>
        <div class="trend-panel">
          <h2>${t("followersTrend")}</h2>
          <div class="trend-large">${sparkline(seriesData, { width: 640, height: 120 })}</div>
          <div class="row between muted">
            <span>${seriesData.length ? `${date(seriesData[0].date)} · ${num(first)}` : ""}</span>
            <span>${seriesData.length ? `${date(seriesData[seriesData.length - 1].date)} · ${num(last)}` : ""}</span>
          </div>
        </div>
        <h2>${t("topPostsThisWeek")}</h2>
        ${timelineTable(accountPosts)}
        ${
          (account.traffic_sources || []).length
            ? `
          <div class="traffic-panel">
            <h2>${t("trafficSources")}</h2>
            ${account.traffic_sources
              .map(
                (item) => `
              <div class="traffic-row">
                <span>${escapeHtml(item.source)}</span>
                <span class="traffic-bar"><span style="width:${Math.round(Number(item.share || 0) * 100)}%"></span></span>
                <span class="num">${pct(item.share)}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        ${
          history.length
            ? `
          <div class="sync-panel">
            <h2>${t("syncHistory")}</h2>
            ${history
              .map(
                (entry) => `
              <div class="sync-row">
                <span class="status ${escapeHtml(entry.status)}">${escapeHtml(enumLabel(entry.status))}</span>
                <span>${methodBadge(entry.method)}</span>
                <span class="muted">${dateTime(entry.completed_at || entry.started_at)}</span>
                <span>${num(entry.posts_collected)} ${t("posts")}</span>
                <p>${escapeHtml(entry.message || "")}</p>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("profileSummary")}</h2>
        <dl>
          <dt>${t("platform")}</dt><dd>${escapeHtml(enumLabel(account.platform, "platform"))}</dd>
          <dt>${t("handle")}</dt><dd>${escapeHtml(account.handle)}</dd>
          <dt>${t("accountId")}</dt><dd>${escapeHtml(account.account_id)}</dd>
          ${account.profile_url ? `<dt>${t("profileUrl")}</dt><dd><a href="${escapeHtml(account.profile_url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(account.profile_url)}</a></dd>` : ""}
          <dt>${t("collection")}</dt><dd>${escapeHtml(enumLabel(account.collection, "method"))}</dd>
          <dt>${t("lastSync")}</dt><dd>${escapeHtml(account.last_sync_at || "")}</dd>
          <dt>${t("following")}</dt><dd>${num(metrics.following)}</dd>
          <dt>${t("postsCount")}</dt><dd>${num(metrics.posts)}</dd>
          ${account.notes ? `<dt>${t("notes")}</dt><dd>${escapeHtml(account.notes)}</dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
}

export function renderSettings() {
  els.settingsTitle.title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  els.settingsBody.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("accounts")}</h2>
        ${
          (summary.accounts || [])
            .map(
              (account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.handle || account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.platform, "platform"))} · ${escapeHtml(enumLabel(account.collection, "method"))}</span>
            <span>${account.secret_envs?.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : t("noSecretsNeeded")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}

export function warnings(accountId = "") {
  const items = (state.snapshot?.warnings || []).filter(
    (item) => !accountId || !item.account_id || item.account_id === accountId,
  );
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
