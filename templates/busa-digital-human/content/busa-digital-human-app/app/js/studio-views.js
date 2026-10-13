import {
  actionLabel,
  checks,
  DETAIL_MODES,
  decisionFor,
  detailUrl,
  effectiveStatus,
  els,
  esc,
  filteredChecks,
  filteredVendors,
  isBusy,
  noticeBanner,
  pathBadge,
  pathLabel,
  QA_STATES,
  state,
  statusBadge,
  statusLabel,
  streamStore,
  t,
  updateMouth,
  vendors,
} from "../app.js";

// ── Record views ───────────────────────────────────────────────────────────
// One toolbar row (title · status filter · search) over a full-bleed table;
// the selected record renders in the shared detail panel in the view's mode.
export function renderRecordView() {
  const { view, selectedId, presentation } = state.route;
  const isQa = view === "qa";
  const rows = isQa ? filteredChecks() : filteredVendors();
  const total = isQa ? checks().length : vendors().length;
  els.viewTitle.textContent = isQa ? t("review") : t("vendors");
  // The description lives in the title's tooltip, not as a line under it.
  els.viewTitle.title = isQa ? t("reviewSubtitle") : t("vendorsSubtitle");
  els.viewCount.textContent = rows.length === total ? String(total) : `${rows.length} / ${total}`;
  els.viewFilters.hidden = !isQa;
  els.statusSelect.hidden = !isQa;
  if (isQa) renderStatusFilter();
  els.listPanel.innerHTML = `${noticeBanner()}${isQa ? checksTable(rows) : vendorsTable(rows)}`;
  const selected = isQa
    ? checks().find((check) => check.id === selectedId)
    : vendors().find((vendor) => vendor.id === selectedId);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId);
  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${esc(t("selectCheck"))}</div>` : "";
    return;
  }
  if (!selected) {
    els.detailBody.innerHTML = `<div class="ws-detail-empty">${esc(t("notFound"))}</div>`;
    return;
  }
  els.detailBody.innerHTML = isQa ? renderCheckDetail(selected) : renderVendorDetail(selected);
}

function renderStatusFilter() {
  const current = state.route.status;
  els.viewFilters.innerHTML = QA_STATES.map(
    (status) =>
      `<button type="button" class="segment${status === current ? " active" : ""}" data-status="${status}" aria-pressed="${status === current}">${esc(statusLabel(status))}</button>`,
  ).join("");
  els.statusSelect.innerHTML = QA_STATES.map(
    (status) => `<option value="${status}"${status === current ? " selected" : ""}>${esc(statusLabel(status))}</option>`,
  ).join("");
}

const rowOpen = (id) =>
  `<tr data-id="${esc(id)}" tabindex="0"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function checksTable(items) {
  if (!items.length) return `<div class="empty">${t("empty")}</div>`;
  // Split queue: the check and its verdict. Owner and evidence are in the detail.
  return `<table class="ws-table qa-table">
    <thead><tr><th>${t("qa")}</th><th class="ws-split-keep">${t("verdict")}</th></tr></thead>
    <tbody>${items
      .map(
        (check) =>
          `${rowOpen(check.id)}<td title="${esc(check.evidence)}"><strong>${esc(check.label)}</strong></td><td class="ws-split-keep">${statusBadge(effectiveStatus(check))}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function vendorsTable(items) {
  if (!items.length) return `<div class="empty">${t("empty")}</div>`;
  return `<table class="ws-table vendors-table">
    <thead><tr>
      <th>${t("vendorRoute")}</th>
      <th>${t("path")}</th>
      <th class="ws-col-narrow">${t("speed")}</th>
      <th class="ws-col-narrow">${t("control")}</th>
      <th>${t("cost")}</th>
      <th>${t("integration")}</th>
      <th class="ws-col-wide">${t("risks")}</th>
    </tr></thead>
    <tbody>${items
      .map(
        (vendor) => `${rowOpen(vendor.id)}
          <td><strong>${esc(vendor.label)}</strong></td>
          <td>${pathBadge(vendor.path)}</td>
          <td class="ws-col-narrow">${esc(vendor.speed)}</td>
          <td class="ws-col-narrow">${esc(vendor.control)}</td>
          <td>${esc(vendor.cost)}</td>
          <td title="${esc(vendor.integration)}">${esc(vendor.integration)}</td>
          <td class="ws-col-wide" title="${esc(vendor.risk)}">${esc(vendor.risk)}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderCheckDetail(check) {
  const status = effectiveStatus(check);
  const decision = decisionFor(check.id);
  const edits = state.edits[check.id] || {};
  const note = edits.note ?? decision?.note ?? decision?.comment ?? "";
  const busy = isBusy() ? "disabled" : "";
  return `<article class="detail-card" data-check="${esc(check.id)}">
    ${state.route.presentation === "page" ? noticeBanner() : ""}
    <header class="detail-head">
      <div>
        <h2>${esc(check.label)}</h2>
        <p class="muted">${t("owner")}: ${esc(check.owner)}</p>
      </div>
      ${statusBadge(status)}
    </header>
    <section class="detail-section">
      <h3>${t("evidence")}</h3>
      <p>${esc(check.evidence)}</p>
    </section>
    <section class="detail-section">
      <h3>${t("note")}</h3>
      <textarea data-field="note" rows="5" placeholder="${esc(t("notePlaceholder"))}">${esc(note)}</textarea>
    </section>
    <footer class="detail-actions">
      <button class="button approve" type="button" data-action="approve" ${busy}>${t("approve")}</button>
      <button class="button" type="button" data-action="request_changes" ${busy}>${t("requestChanges")}</button>
      <button class="button danger" type="button" data-action="block" ${busy}>${t("block")}</button>
    </footer>
    ${
      decision
        ? `<div class="decision-log">${t("decision")}: ${esc(actionLabel(decision.action))}${decision.decided_at ? ` · ${esc(new Date(decision.decided_at).toLocaleString())}` : ""}</div>`
        : ""
    }
  </article>`;
}

function renderVendorDetail(vendor) {
  const pipeline = (state.snapshot.pipelines || []).find((item) => item.path === vendor.path);
  return `<article class="detail-card">
    <header class="detail-head">
      <h2>${esc(vendor.label)}</h2>
      ${pathBadge(vendor.path)}
    </header>
    <dl class="detail-fields">
      <dt>${t("integration")}</dt><dd>${esc(vendor.integration)}</dd>
      <dt>${t("speed")}</dt><dd>${esc(vendor.speed)}</dd>
      <dt>${t("control")}</dt><dd>${esc(vendor.control)}</dd>
      <dt>${t("cost")}</dt><dd>${esc(vendor.cost)}</dd>
      <dt>${t("risks")}</dt><dd>${esc(vendor.risk)}</dd>
    </dl>
    ${
      pipeline
        ? `<section class="detail-section">
      <h3>${t("matchingPipeline")}</h3>
      <p><strong>${esc(pipeline.label)}</strong> · ${pipeline.latency_ms}ms · ${esc(pipeline.output)}</p>
      <ol class="stage-list">${pipeline.stages.map((stage) => `<li>${esc(stage)}</li>`).join("")}</ol>
    </section>`
        : ""
    }
  </article>`;
}

// ── Tool pages ─────────────────────────────────────────────────────────────
export function renderStudio() {
  const snapshot = state.snapshot;
  const persona = snapshot.personas.find((item) => item.id === streamStore.currentPersona) || snapshot.personas[0];
  const pipeline = snapshot.pipelines.find((item) => item.id === streamStore.currentProvider) || snapshot.pipelines[0];
  const script =
    state.lang === "zh"
      ? "你好，我是 Busa AI 数字人助理。今天我会用一个实时视频流，演示语音输入、唇形驱动、字幕、延迟监控和上线 QA 的完整闭环。"
      : "Hi, I am the Busa AI digital host. This live stream shows voice input, lip sync, captions, latency monitoring, and the QA gate before launch.";
  els.studioBody.innerHTML = `
    <div class="studio-layout">
      <section class="video-stage">
        <div class="video-grid"></div>
        <div class="stage-hud">
          <span class="hud-chip">LIVE PREVIEW</span>
          <span class="hud-chip">${esc(pipeline.label)}</span>
          <span class="hud-chip">${pipeline.latency_ms}ms</span>
          <span class="spacer"></span>
          <span class="hud-chip">${streamStore.running ? "STREAMING" : "PAUSED"}</span>
        </div>
        <div class="avatar-wrap">
          <div class="avatar-glow"></div>
          <div class="dh-avatar" id="dhAvatar">
            <div class="torso"></div>
            <div class="neck"></div>
            <div class="hair"></div>
            <div class="head"></div>
            <div class="eye left"></div>
            <div class="eye right"></div>
            <div class="nose"></div>
            <div class="mouth" id="mouth"></div>
          </div>
        </div>
        <div class="subtitle">
          <canvas id="waveform" class="waveform" width="900" height="90"></canvas>
          <div class="subtitle-line">${esc(script)}</div>
        </div>
      </section>
      <aside class="studio-side">
        <section class="card">
          <h2>${esc(persona.name)}</h2>
          <p class="muted">${esc(persona.look)}</p>
        </section>
        <section class="card control-stack">
          ${selectControl(
            t("persona"),
            "persona",
            snapshot.personas.map((item) => [item.id, item.name]),
          )}
          ${selectControl(
            t("providerMode"),
            "provider",
            snapshot.pipelines.map((item) => [item.id, item.label]),
          )}
          ${selectControl(t("inputMode"), "inputMode", [
            ["text", "Text to voice"],
            ["audio", "Voice stream"],
            ["llm", "LLM answer"],
          ])}
          <div class="control-row">
            <label>${t("script")}</label>
            <textarea rows="5">${esc(script)}</textarea>
          </div>
          <div class="button-row">
            <button class="button primary" type="button" data-stream-action="start">${streamStore.running ? t("pause") : t("start")}</button>
            <button class="button" type="button" data-stream-action="reset">${t("reset")}</button>
          </div>
        </section>
        <section class="card">
          <h2>${t("routeLatency")}</h2>
          ${pipeline.stages.map((stage, index) => `<div class="event-row"><span>${index + 1}. ${esc(stage)}</span><strong>${Math.round((pipeline.latency_ms / pipeline.stages.length) * (0.82 + index * 0.05))}ms</strong></div>`).join("")}
        </section>
        ${
          (snapshot.events || []).length
            ? `<section class="card">
          <h2>${t("streamEvents")}</h2>
          ${(snapshot.events || [])
            .map(
              (event) =>
                `<div class="event-row"><span><span class="hud-chip">${esc(event.kind)}</span> ${esc(event.label)}</span><strong>${esc(event.at)}</strong></div>`,
            )
            .join("")}
        </section>`
            : ""
        }
      </aside>
    </div>
  `;
  streamStore.waveContext = document.querySelector("#waveform")?.getContext("2d") || null;
  updateMouth();
}

function selectControl(label, name, options) {
  return `<div class="control-row">
    <label>${esc(label)}</label>
    <select data-control="${esc(name)}">
      ${options.map(([value, optionLabel]) => `<option value="${esc(value)}" ${value === selectedValue(name) ? "selected" : ""}>${esc(optionLabel)}</option>`).join("")}
    </select>
  </div>`;
}

function selectedValue(name) {
  if (name === "persona") return streamStore.currentPersona;
  if (name === "provider") return streamStore.currentProvider;
  return "text";
}

export function renderSettings() {
  els.settingsBody.innerHTML = `
    <div class="settings-grid">
      <p class="settings-intro">${esc(t("localFilesOnly"))}</p>
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl class="settings-list">
          <dt>${t("dataProvider")}</dt><dd>${esc(state.settings?.demo ? t("demoData") : t("liveData"))}</dd>
          <dt>${t("handoffFiles")}</dt><dd>qa-decisions</dd>
          <dt>${t("currentPath")}</dt><dd>${pathLabel(state.snapshot.project.recommended_path)}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("safety")}</h2>
        <ul class="safety-list">
          <li>No vendor API calls in demo mode.</li>
          <li>No camera or microphone access.</li>
          <li>No voice, likeness, or customer audio upload without explicit approval.</li>
          <li>Public demo requires QA gate approval.</li>
        </ul>
      </section>
    </div>
  `;
}
