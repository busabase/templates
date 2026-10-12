import { bindForm } from "./actions.js";
import { escapeHtml, formatBytes } from "./format.js";
import { seriesForm } from "./forms.js";
import { t } from "./i18n.js";
import { shotReadiness } from "./shots.js";
import { $, project, store } from "./store.js";

function overviewCard(title, body, target, tag) {
  return `
    <button type="button" class="overview-row" data-go="${target}">
      <span class="row-key">${escapeHtml(tag)}</span>
      <span class="row-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(body)}</small>
      </span>
      <span class="row-arrow">${t("overview_card_open")}</span>
    </button>`;
}

function visualBiblePreview(bible) {
  const assets = bible.background_reference_assets || [];
  return `
    <section class="visual-bible-card">
      <div>
        <h3>${t("visual_bible_title")}</h3>
        <p>${escapeHtml(bible.format_note || "")}</p>
        <p class="muted">${escapeHtml(bible.realism_target || "")}</p>
      </div>
      <div class="reference-grid">
        ${assets.map((asset) => `<figure><img src="${escapeHtml(asset.path)}" alt="${escapeHtml(asset.title || t("visual_bible_title"))}" /><figcaption>${escapeHtml(asset.title || t("visual_bible_title"))}</figcaption></figure>`).join("") || `<div class="asset-placeholder">${t("visual_bible_placeholder")}</div>`}
      </div>
    </section>`;
}

function hyperframeStatusPanel(status) {
  if (!status.ok) return `<p class="form-note">${escapeHtml(status.error || "Could not read HyperFrame project.")}</p>`;
  const compositions = status.compositions || [];
  const renders = status.renders || [];
  const audio = status.audio || [];
  const changelogs = status.changelogs || [];
  return `
    <div class="hyperframe-metrics">
      <div><strong>${status.counts?.compositions || 0}</strong><span>compositions</span></div>
      <div><strong>${status.counts?.scenes || 0}</strong><span>scenes</span></div>
      <div><strong>${status.counts?.renders || 0}</strong><span>renders</span></div>
      <div><strong>${status.counts?.audio || 0}</strong><span>audio</span></div>
    </div>
    <div class="hyperframe-list">
      <h4>Compositions</h4>
      ${
        compositions
          .map(
            (item) => `
        <div class="hyperframe-row">
          <code>${escapeHtml(item.path)}</code>
          <span>${escapeHtml(item.scenes?.length || 0)} scenes</span>
          <span>${Number.isFinite(item.duration_seconds) ? `${item.duration_seconds}s` : ""}</span>
        </div>`,
          )
          .join("") || `<p class="muted">No HTML compositions found.</p>`
      }
    </div>
    <div class="hyperframe-list compact">
      <h4>Renders</h4>
      ${
        renders
          .slice(0, 5)
          .map(
            (item) =>
              `<div class="hyperframe-row"><code>${escapeHtml(item.path)}</code><span>${Number.isFinite(item.duration_seconds) ? `${item.duration_seconds.toFixed(1)}s` : ""}</span><span>${formatBytes(item.size_bytes)}</span></div>`,
          )
          .join("") || `<p class="muted">No rendered videos found.</p>`
      }
    </div>
    <div class="hyperframe-list compact">
      <h4>Audio</h4>
      ${
        audio
          .slice(0, 8)
          .map((item) => `<span class="hf-chip">${escapeHtml(item.path)}</span>`)
          .join("") || `<p class="muted">No audio files found.</p>`
      }
    </div>
    ${changelogs.length ? `<div class="hyperframe-list compact"><h4>Latest changelog</h4><div class="hyperframe-row"><code>${escapeHtml(changelogs[0].path)}</code><span>${escapeHtml((changelogs[0].updated_at || "").slice(0, 10))}</span></div></div>` : ""}
  `;
}

// The browser can never read an arbitrary local filesystem path (and neither
// could the retired app's UI, in spirit — the HyperFrame project always
// lives on the machine running the agent, not the AirApp). The status panel
// below only displays the CACHED snapshot a trusted operator/agent process
// last wrote via `scripts/read_hyperframe_status.mjs --apply`, which walks
// the HyperFrame project path on disk and stores the result on the project
// record's `hyperframe_status_json` field — see that script and
// references/drama-workflow.md's HyperFrame section.
function hyperframeOverview(p) {
  const series = p.series || {};
  const path = series.hyperframe_project_path || "";
  const status = series.hyperframe_status || {};
  const hasStatus = Boolean(status && Object.keys(status).length);
  return `
    <section class="hyperframe-card">
      <div class="section-head">
        <div>
          <h3>HyperFrame</h3>
          <p class="muted">${escapeHtml(path || "No project path set")}</p>
        </div>
        ${series.hyperframe_status_updated_at ? `<span class="badge soft">Last read ${escapeHtml(series.hyperframe_status_updated_at.slice(0, 10))}</span>` : ""}
      </div>
      ${!path ? `<div class="asset-placeholder">Set the HyperFrame project path in the project form.</div>` : ""}
      ${path && !hasStatus ? `<p class="muted">Not read yet — run <code>scripts/read_hyperframe_status.mjs --apply</code> to cache the HyperFrame project status here.</p>` : ""}
      ${path && hasStatus ? hyperframeStatusPanel(status) : ""}
    </section>`;
}

// At most three numbers, none of them already on screen: per-Base totals sit
// next to the nav items and the attention counts in the sidebar block. Shots
// have no nav item of their own (they live inside episodes).
function overviewMetrics(p) {
  const shots = p.shots || [];
  const shotsMore = store.state.pagination?.shots ? "+" : "";
  const episodesMore = store.state.pagination?.episodes ? "+" : "";
  const totalShots = store.state.totalCount?.shots ?? store.state.totals?.shots;
  const ready = shots.filter((shot) => shotReadiness(shot).ready).length;
  const imaged = shots.filter((shot) => shot.image_asset).length;
  const approved = (p.episodes || []).filter((episode) => ["approved", "done"].includes(episode.status)).length;
  // Ready / imaged / approved are computed from the loaded page: "n+" while
  // more pages exist, so a partial count never reads as the total.
  const cells = [
    [t("overview_metric_shots"), Number.isFinite(totalShots) ? String(totalShots) : `${shots.length}${shotsMore}`],
    [t("overview_metric_video_ready"), `${ready}${shotsMore}`, t("overview_metric_video_ready_title").replace("{n}", imaged)],
    [t("overview_metric_episodes_approved"), `${approved}${episodesMore}`],
  ];
  return cells
    .map(
      ([label, value, title]) =>
        `<div${title ? ` title="${escapeHtml(title)}"` : ""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
}

export function renderOverview() {
  const p = project();
  const series = p.series || {};
  $("overviewContext").textContent = [series.genre, series.format].filter(Boolean).join(" · ");
  $("overviewTitle").textContent = series.title || t("project_unnamed");
  $("overviewSummary").textContent = series.logline || t("view_overview_sub");
  $("overviewMetrics").innerHTML = overviewMetrics(p);
  $("overviewBody").innerHTML = `
    <div class="overview-main">
      <section class="card overview-steps">
        <div class="section-label">${t("overview_next_steps")}</div>
        ${overviewCard(t("overview_card_char_consistency"), t("overview_card_char_consistency_hint"), "characters", t("view_characters"))}
        ${overviewCard(t("overview_card_plot"), t("overview_card_plot_body").replace("{n}", store.state.completeness.episodes_missing_cliffhanger), "episodes", t("view_episodes"))}
        ${overviewCard(t("overview_card_storyboard"), t("overview_card_storyboard_hint"), "episodes", t("stat_shots"))}
        ${overviewCard(t("overview_card_relationship"), t("overview_card_relationship_body").replace("{n}", store.state.completeness.relationships_missing_evidence), "relationships", t("view_relationships"))}
      </section>
      <section class="card overview-side">
        ${hyperframeOverview(p)}
        ${visualBiblePreview(series.visual_bible || {})}
      </section>
    </div>
    <div class="card overview-series">${seriesForm(series)}</div>
  `;
  bindForm();
}
