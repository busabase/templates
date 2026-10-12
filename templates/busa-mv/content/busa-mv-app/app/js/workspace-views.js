import {
  closeDetail,
  DURATIONS,
  esc,
  go,
  loadState,
  navCount,
  openRecord,
  pickFile,
  project,
  render,
  secs,
  state,
  statusClass,
  t,
  toast,
} from "../app.js";
import { listToArray, storyboardPromptPreview } from "./mv-model.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";

const STATUSES = ["draft", "needs_review", "approved", "blocked"];
// Status values are stored as ids; the screen shows their label.
export function statusLabel(status) {
  const key = `status_${status || "draft"}`;
  const label = t(key);
  return label === key ? String(status || "") : label;
}
function statusBadge(status) {
  return `<span class="badge ${statusClass(status)}">${esc(statusLabel(status))}</span>`;
}

// Search matches the fields a person reads in the row, not the raw record
// (asset URLs and ids would match almost any query).
function matches(values) {
  const query = state.search.trim().toLowerCase();
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

// ---------------------------------------------------------------------------
// OVERVIEW — the only page with the hero and the metrics band.
// ---------------------------------------------------------------------------
export function renderOverview() {
  const song = project().song || {};
  const c = state.data.completeness || {};
  const m = state.data.metrics || {};
  document.getElementById("overviewTitle").textContent = song.title || t("project_unnamed");
  document.getElementById("overviewSummary").textContent =
    [song.artist, song.duration_seconds ? secs(song.duration_seconds) : ""].filter(Boolean).join(" · ") ||
    t("project_meta_fallback");
  // Three numbers the nav does not already show. When the provider could not
  // count them exactly (more pages exist and records.count is unavailable),
  // the cell says "—" instead of a partial number.
  const metric = (label, value) =>
    `<div title="${esc(label)}"><span>${esc(label)}</span><strong>${value === null || value === undefined ? "—" : esc(value)}</strong></div>`;
  document.getElementById("overviewMetrics").innerHTML = [
    metric(t("metric_refs_missing"), "refsMissing" in m ? m.refsMissing : c.characters_missing_refs),
    metric(t("metric_shots_no_image"), "shotsNoImage" in m ? m.shotsNoImage : c.shots_missing_image),
    metric(t("metric_shots_no_video"), "shotsNoVideo" in m ? m.shotsNoVideo : c.shots_missing_video),
  ].join("");
  const castTotal = state.data.totals?.characters ?? (project().characters || []).length;
  const shotTotal = state.data.totals?.shots ?? (project().shots || []).length;
  const castDone = castTotal > 0 && c.characters_missing_refs === 0 && !state.data.pagination?.cast;
  const run = t("checklist_storyboard_run").replace("{dur}", secs(c.shots_total_seconds));
  const steps = [
    [
      "song",
      t("checklist_song"),
      c.song_ready ? t("checklist_song_done").replace("{dur}", secs(song.duration_seconds)) : t("checklist_song_todo"),
      c.song_ready,
    ],
    [
      "overview",
      t("checklist_concept"),
      c.concept_ready ? t("checklist_concept_done") : t("checklist_concept_todo"),
      c.concept_ready,
    ],
    [
      "cast",
      t("checklist_cast"),
      castTotal ? (castDone ? t("checklist_cast_done") : t("checklist_cast_todo")) : t("checklist_cast_none"),
      castDone,
    ],
    [
      "storyboard",
      t("checklist_storyboard"),
      shotTotal
        ? `${run}${song.duration_seconds ? t("shot_timeline_meta_song").replace("{song}", secs(song.duration_seconds)) : ""}`
        : t("checklist_storyboard_none"),
      shotTotal > 0 && c.shots_missing_video === 0 && !state.data.pagination?.shots,
    ],
  ];
  const checklist = steps
    .map(
      ([view, label, sub, ok]) => `
      <button type="button" class="step-row" ${view === "overview" ? 'data-focus-concept="1"' : `data-jump="${view}"`}>
        <span class="ready-chip ${ok ? "ok" : "planned"}" aria-hidden="true">${ok ? "✓" : "…"}</span>
        <span class="step-main"><strong>${esc(label)}</strong><span>${esc(sub)}</span></span>
        <span class="row-arrow" aria-hidden="true">›</span>
      </button>`,
    )
    .join("");
  const host = document.getElementById("overviewBody");
  host.innerHTML = `
    <div class="overview-column">
      <section class="card">
        <div class="card-heading"><h2>${t("overview_checklist")}</h2><span class="muted">${steps.filter((step) => step[3]).length}/${steps.length}</span></div>
        <div class="step-list">${checklist}</div>
      </section>
      <section class="card">
        <div class="card-heading"><h2>${t("how_to_title")}</h2></div>
        <p class="card-copy muted">${t("how_to_body")}</p>
      </section>
    </div>
    ${detailConcept()}`;
  host.querySelectorAll("[data-jump]").forEach((node) => node.addEventListener("click", () => go(node.dataset.jump)));
  host
    .querySelector("[data-focus-concept]")
    ?.addEventListener("click", () => host.querySelector('#conceptForm [data-field="summary"]')?.focus());
  bindDetail(host);
}

// ---------------------------------------------------------------------------
// SONG — one record, so a form under the toolbar instead of a list.
// ---------------------------------------------------------------------------
export function renderSong() {
  const host = document.getElementById("songBody");
  host.innerHTML = detailSong();
  bindDetail(host);
}

// ---------------------------------------------------------------------------
// RECORD VIEWS — one toolbar row over a full-bleed table.
// ---------------------------------------------------------------------------
export function renderList() {
  const host = document.getElementById("list");
  const { html, count, meta } = state.view === "cast" ? listCast() : listStoryboard();
  host.innerHTML = html;
  // Shown only while a search narrows the list (and on phones).
  document.getElementById("viewCount").textContent = count;
  const metaNode = document.getElementById("viewMeta");
  metaNode.hidden = !meta;
  metaNode.textContent = meta || "";
}

function loadMoreControl(key) {
  if (!state.data?.pagination?.[key]) return "";
  return `<div class="load-more"><button type="button" class="button" data-load-more="${esc(key)}" ${state.loadingMore[key] ? "disabled" : ""}>${state.loadingMore[key] ? t("loading_more") : t("load_more")}</button>${state.loadMoreError[key] ? `<span role="alert">${t("load_more_failed")}</span>` : ""}</div>`;
}

function listCount(items, key) {
  if (!state.search) return navCount(key);
  return `${items.length}${state.data.pagination?.[key] ? "+" : ""}`;
}

function listCast() {
  const items = (project().characters || []).filter((c) =>
    matches([c.name, c.role, c.actor_profile, statusLabel(c.status)]),
  );
  const rows = items
    .map((c) => {
      const ref = c.reference_card?.image_asset;
      const thumb = ref
        ? `<img class="row-thumb cast-thumb" src="${esc(ref)}" alt="" />`
        : `<span class="row-thumb cast-thumb thumb-empty" aria-hidden="true"></span>`;
      return `
      <tr data-select="${esc(c.id)}" class="${c.id === state.selectedId ? "ws-selected" : ""}">
        <td><span class="cell-name">${thumb}<strong>${esc(c.name || t("new_character_name"))}</strong></span></td>
        <td class="muted">${esc(c.role || "—")}</td>
        <td>${ref ? `<span class="badge positive">${t("ref_ready")}</span>` : `<span class="badge">${t("ref_missing")}</span>`}</td>
        <td class="ws-col-wide">${statusBadge(c.status)}</td>
      </tr>`;
    })
    .join("");
  const table = `
    <table class="ws-table cast-table">
      <thead><tr><th>${t("col_character")}</th><th>${t("col_role")}</th><th>${t("col_ref")}</th><th class="ws-col-wide">${t("col_status")}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  const empty = `<div class="ws-detail-empty">${t("cast_list_empty")}</div>`;
  return { html: `${items.length ? table : empty}${loadMoreControl("cast")}`, count: listCount(items, "cast") };
}

function characterName(id) {
  return (project().characters || []).find((c) => c.id === id)?.name || "";
}

function listStoryboard() {
  const all = project().shots || [];
  const c = state.data.completeness || {};
  const song = project().song || {};
  const shots = all
    .map((shot, index) => ({ shot, index }))
    .filter(({ shot }) =>
      matches([shot.title, shot.description, shot.video_prompt, ...(shot.characters || []).map(characterName)]),
    );
  const rows = shots
    .map(({ shot, index }) => {
      const thumb = shot.image_asset
        ? `<img class="row-thumb shot-thumb" src="${esc(shot.image_asset)}" alt="" />`
        : `<span class="row-thumb shot-thumb thumb-empty" aria-hidden="true"></span>`;
      // A shot's cast arrives as character ids; show names, never the id.
      // A character outside the loaded page is counted as "not loaded".
      const ids = shot.characters || [];
      const names = ids.map(characterName).filter(Boolean);
      const missing = ids.length - names.length;
      const cast = [...names, ...(missing ? [`${missing} ${t("not_loaded")}`] : [])].join(", ") || "—";
      return `
      <tr data-select="${esc(shot.id)}" class="${shot.id === state.selectedId ? "ws-selected" : ""}">
        <td><span class="cell-name"><span class="shot-no">${index + 1}</span>${thumb}<strong>${esc(shot.title || t("new_shot_name"))}</strong></span></td>
        <td class="ws-col-narrow ws-split-keep media-cell">${shot.image_asset ? `<span class="badge positive" title="${esc(t("shot_badge_image"))}">${t("shot_badge_image")}</span>` : ""}${shot.video_asset ? `<span class="badge positive" title="${esc(t("shot_badge_video"))}">${t("shot_badge_video")}</span>` : ""}${shot.image_asset || shot.video_asset ? "" : '<span class="muted">—</span>'}</td>
        <td class="ws-col-num ws-split-keep">${shot.duration_seconds ? `${esc(shot.duration_seconds)}s` : "—"}</td>
        <td class="ws-col-wide muted">${esc(cast)}</td>
      </tr>`;
    })
    .join("");
  const table = `
    <table class="ws-table shot-table">
      <thead><tr><th>${t("col_shot")}</th><th class="ws-col-narrow ws-split-keep">${t("col_media")}</th><th class="ws-col-num ws-split-keep">${t("col_length")}</th><th class="ws-col-wide">${t("col_cast")}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  const empty = `<div class="ws-detail-empty">${t("shot_list_empty")}</div>`;
  const meta = all.length
    ? `${secs(c.shots_total_seconds)}${song.duration_seconds ? ` / ${secs(song.duration_seconds)}` : ""}`
    : "";
  return {
    html: `${shots.length ? table : empty}${loadMoreControl("shots")}`,
    count: listCount(
      shots.map(({ shot }) => shot),
      "shots",
    ),
    meta,
  };
}

// ---------------------------------------------------------------------------
// DETAIL panel — the same markup in every mode (page / drawer / split).
// ---------------------------------------------------------------------------
export function renderDetail() {
  const host = document.getElementById("detail");
  if (!state.selectedId) {
    host.innerHTML =
      state.view === "storyboard" ? `<div class="ws-detail-empty">${t("shot_empty")}</div>` : "";
    return;
  }
  host.innerHTML = state.view === "cast" ? detailCast() : detailStoryboard();
  bindDetail(host);
}

function field(label, name, value, opts = {}) {
  const { textarea, type = "text", placeholder = "", full } = opts;
  const control = textarea
    ? `<textarea data-field="${name}" rows="${opts.rows || 3}" placeholder="${esc(placeholder)}">${esc(value ?? "")}</textarea>`
    : `<input data-field="${name}" type="${type}" value="${esc(value ?? "")}" placeholder="${esc(placeholder)}" />`;
  return `<label class="field ${full ? "full" : ""}"><span>${esc(label)}</span>${control}</label>`;
}
function selectField(label, name, value, options, opts = {}) {
  const labelOf = opts.labelOf || ((o) => o);
  const opts2 = options
    .map(
      (o) => `<option value="${esc(o)}" ${String(o) === String(value) ? "selected" : ""}>${esc(labelOf(o))}</option>`,
    )
    .join("");
  return `<label class="field ${opts.full ? "full" : ""}"><span>${esc(label)}</span><select data-field="${name}">${opts2}</select></label>`;
}
function collect(scope) {
  const out = {};
  scope.querySelectorAll("[data-field]").forEach((node) => {
    out[node.dataset.field] = node.value;
  });
  return out;
}

function detailConcept() {
  const c = project().treatment || {};
  return `
    <section class="card concept-card">
      <div class="card-heading"><h2>${t("concept_title")}</h2></div>
      <div class="form-grid" id="conceptForm">
        ${field(t("concept_summary_label"), "summary", c.summary, { textarea: true, rows: 4, full: true, placeholder: t("concept_summary_placeholder") })}
        ${field(t("concept_look_label"), "look", c.look, { full: true, placeholder: t("concept_look_placeholder") })}
        ${field(t("concept_ratio_label"), "aspect_ratio", c.aspect_ratio || "16:9")}
      </div>
      <div class="form-actions"><button class="mini-button" id="conceptSave">${t("concept_save")}</button></div>
    </section>`;
}

function detailSong() {
  const s = project().song || {};
  const has = Boolean(s.audio_asset);
  return `
    <section class="card detail-card song-card">
      ${s.source ? `<div class="detail-head"><span class="badge">${esc(s.source === "upload" ? t("asset_uploaded") : s.source)}</span></div>` : ""}
      ${has ? `<audio controls src="${esc(s.audio_asset)}" style="width:100%"></audio>` : `<div class="asset-placeholder">${t("song_placeholder")}</div>`}
      <div class="form-actions"><button class="generate-image-button" id="songUpload">${has ? t("song_reupload") : t("song_upload")}</button></div>
      <div class="form-grid">
        ${field(t("song_title_label"), "title", s.title)}
        ${field(t("song_artist_label"), "artist", s.artist)}
      </div>
      <div class="form-actions"><button class="mini-button" id="songSave">${t("song_save")}</button></div>
      <p class="muted">${has ? t("song_duration_auto").replace("{dur}", secs(s.duration_seconds)) : t("song_duration_hint")}</p>
    </section>`;
}

function detailCast() {
  const c = (project().characters || []).find((x) => x.id === state.selectedId);
  if (!c) return `<div class="ws-detail-empty">${t("cast_empty")}</div>`;
  const v = c.visual || {};
  const card = c.reference_card || {};
  const hasRef = Boolean(card.image_asset);
  return `
    <div class="detail-card" data-character="${esc(c.id)}">
      <div class="detail-head"><h2>${esc(c.name || t("new_character_name"))}</h2></div>
      ${hasRef ? `<img class="character-reference" src="${esc(card.image_asset)}" alt="" />` : `<div class="asset-placeholder">${t("cast_no_ref")}</div>`}
      <div class="form-grid">
        ${field(t("cast_name_label"), "name", c.name)}
        ${field(t("cast_role_label"), "role", c.role)}
        ${selectField(t("cast_status_label"), "status", c.status || "draft", STATUSES.includes(c.status || "draft") ? STATUSES : [...STATUSES, c.status], { labelOf: statusLabel })}
        ${field(t("cast_profile_label"), "actor_profile", c.actor_profile, { textarea: true, rows: 2, full: true })}
        ${field(t("cast_front_label"), "front", v.front, { full: true })}
        ${field(t("cast_side_label"), "side", v.side, { full: true })}
        ${field(t("cast_back_label"), "back", v.back, { full: true })}
        ${field(t("cast_wardrobe_label"), "wardrobe", v.wardrobe, { full: true })}
        ${field(t("cast_anchors_label"), "anchors", (v.anchors || []).join(", "), { full: true })}
        ${field(t("cast_drift_label"), "forbidden_drift", (v.forbidden_drift || []).join(", "), { full: true })}
        ${field(t("cast_ref_prompt_label"), "ref_prompt", card.prompt, { textarea: true, rows: 4, full: true })}
      </div>
      <div class="form-actions">
        <button class="mini-button" id="castSave">${t("cast_save")}</button>
        <button class="generate-image-button" id="castGenRef">${t("cast_gen_ref")}</button>
        <button class="mini-button danger" id="castDelete">${t("cast_delete")}</button>
      </div>
    </div>`;
}

function assetMode(gen) {
  if (!gen) return "";
  if (gen.mode === "upload") return `<span class="img-mode-badge">${t("asset_uploaded")}</span>`;
  if (gen.mode === "image-edit") return `<span class="img-mode-badge">${t("asset_img_edit")}</span>`;
  if (gen.mode === "text-to-image") return `<span class="img-mode-badge">${t("asset_text_to_img")}</span>`;
  if (gen.mode === "draft") return `<span class="img-mode-badge">${t("asset_draft")}</span>`;
  return "";
}

// Candidates carry both the resolved display URL (`path`) and the stable
// `assetId` writes key off; the active pointer on the shot is the resolved
// URL, so match it back to a candidate's assetId for the "active" highlight.
function findAssetId(candidates, activePath) {
  return (candidates || []).find((c) => c.path === activePath)?.assetId || "";
}

function detailStoryboard() {
  const shot = (project().shots || []).find((x) => x.id === state.selectedId);
  if (!shot) return `<div class="ws-detail-empty">${t("shot_missing")}</div>`;
  const chars = project().characters || [];
  const charChecks = chars
    .map(
      (c) =>
        `<label class="cand-chip"><input type="checkbox" data-char="${esc(c.id)}" ${(shot.characters || []).includes(c.id) ? "checked" : ""}/> ${esc(c.name)}</label>`,
    )
    .join("");
  const refChars = chars.filter((c) => (shot.characters || []).includes(c.id));
  const refReady = refChars.filter((c) => c.reference_card?.image_asset).length;

  const candStrip = (cands, activeAssetId, kind) =>
    cands.length
      ? `<div class="cand-strip">${cands
          .map(
            (cd) => `
    <div class="cand-thumb ${cd.assetId === activeAssetId ? "active" : ""}">
      ${kind === "video" ? `<video src="${esc(cd.path)}" muted></video>` : `<img src="${esc(cd.path)}" data-img-active="${esc(cd.assetId)}" alt="" />`}
      ${cd.assetId === activeAssetId ? `<span class="cand-pick">${t("shot_cand_active")}</span>` : `<button class="cand-pick" data-${kind === "video" ? "vid" : "img"}-active="${esc(cd.assetId)}">${t("shot_cand_select")}</button>`}
    </div>`,
          )
          .join("")}</div>`
      : "";

  return `
    <div class="detail-card shot-sheet" data-shot="${esc(shot.id)}">
      <div class="detail-head"><h2>${esc(shot.title || t("new_shot_name"))}</h2></div>

      <div class="section-label">${t("shot_section_image")}</div>
      ${shot.image_asset ? `<div class="storyboard-actions"><img class="storyboard-image" src="${esc(shot.image_asset)}" alt="" />${assetMode(shot.image_generation)}</div>` : `<div class="asset-placeholder">${t("shot_image_empty")}</div>`}
      ${candStrip(shot.image_candidates || [], findAssetId(shot.image_candidates, shot.image_asset), "image")}
      ${refChars.length ? `<p class="form-note">${t("cast_ref_note").replace("{ready}", refReady).replace("{total}", refChars.length)}${refReady < refChars.length ? ` ${t("cast_ref_note_missing")}` : ""}</p>` : ""}
      <div class="form-actions">
        <button class="generate-image-button" id="shotGenImg">${t("shot_gen_img")}</button>
        <button class="mini-button" id="shotUploadImg">${t("shot_upload_img")}</button>
        <button class="mini-button ghost" id="shotPromptPreview">${t("shot_view_prompt")}</button>
      </div>

      <div class="section-label">${t("shot_section_video")}</div>
      ${shot.video_asset ? `<div class="storyboard-actions"><video class="shot-video" src="${esc(shot.video_asset)}" controls preload="metadata" playsinline></video>${assetMode(shot.video_generation)}</div>` : `<div class="asset-placeholder">${t("shot_video_empty")}</div>`}
      ${candStrip(shot.video_candidates || [], findAssetId(shot.video_candidates, shot.video_asset), "video")}
      <div class="form-actions">
        <button class="mini-button ghost" id="shotGenVid">${t("shot_gen_vid")}</button>
        <button class="mini-button" id="shotUploadVid">${t("shot_upload_vid")}</button>
      </div>

      <div class="section-label">${t("shot_section_desc")}</div>
      <div class="form-grid">
        ${field(t("shot_title_label"), "title", shot.title)}
        ${selectField(t("shot_duration_label"), "duration_seconds", shot.duration_seconds || 8, DURATIONS)}
        ${field(t("shot_desc_label"), "description", shot.description, { textarea: true, rows: 4, full: true })}
        ${field(t("shot_neg_label"), "negative_prompt", shot.negative_prompt, { textarea: true, rows: 2, full: true })}
        ${field(t("shot_vid_prompt_label"), "video_prompt", shot.video_prompt, { full: true })}
      </div>
      <div class="section-label">${t("shot_section_chars")}</div>
      <div class="cand-chips" id="shotChars">${charChecks || `<span class="muted">${t("cast_add_cast_hint")}</span>`}</div>
      <div class="form-actions">
        <button class="mini-button" id="shotSave">${t("shot_save")}</button>
        <button class="mini-button danger" id="shotDelete">${t("shot_delete")}</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// DETAIL actions
// ---------------------------------------------------------------------------
function bindDetail(host) {
  const on = (id, fn) => {
    const n = host.querySelector(`#${id}`);
    if (n) n.addEventListener("click", fn);
  };

  // Concept
  on("conceptSave", async () => {
    const f = collect(host.querySelector("#conceptForm"));
    try {
      const provider = await getProvider();
      await provider.saveTreatment(f);
      await loadState();
      toast(t("toast_concept_saved"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });

  // Song
  on("songUpload", async (e) => {
    const file = await pickFile("audio/*");
    if (!file) return;
    e.target.disabled = true;
    e.target.textContent = t("song_uploading");
    try {
      const provider = await getProvider();
      await provider.uploadSong(file, { title: project().song?.title || file.name.replace(/\.[^.]+$/, "") });
      await loadState();
      toast(t("toast_song_uploaded"));
    } catch (err) {
      toast(err.message, "danger");
      render();
    }
  });
  on("songSave", async () => {
    const f = collect(host.querySelector(".detail-card"));
    try {
      const provider = await getProvider();
      await provider.saveSongMeta({ title: f.title, artist: f.artist });
      await loadState();
      toast(t("toast_song_saved"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });

  // Cast
  on("castSave", async () => {
    const card = host.querySelector("[data-character]");
    const f = collect(card);
    const existing = (project().characters || []).find((x) => x.id === state.selectedId) || {};
    const payload = {
      id: state.selectedId,
      name: f.name,
      role: f.role,
      status: f.status,
      actor_profile: f.actor_profile,
      visual: {
        ...(existing.visual || {}),
        front: f.front,
        side: f.side,
        back: f.back,
        wardrobe: f.wardrobe,
        anchors: listToArray(f.anchors),
        forbidden_drift: listToArray(f.forbidden_drift),
      },
      reference_card: { ...(existing.reference_card || {}), prompt: f.ref_prompt },
    };
    try {
      const provider = await getProvider();
      await provider.saveCharacter(payload);
      await loadState();
      toast(t("toast_cast_saved"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });
  on("castGenRef", async (e) => {
    e.target.disabled = true;
    e.target.textContent = t("loading");
    try {
      const provider = await getProvider();
      await provider.requestCharacterCardGeneration(state.selectedId);
      await loadState();
      toast(t("toast_ref_generated"));
    } catch (err) {
      toast(err.message, "danger");
      render();
    }
  });
  on("castDelete", async () => {
    if (!confirm(`${t("cast_delete")}?`)) return;
    try {
      const provider = await getProvider();
      await provider.deleteCharacter(state.selectedId);
      closeDetail();
      await loadState();
      toast(t("toast_cast_deleted"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });

  // Shot
  on("shotSave", () => saveShot(host));
  on("shotGenImg", async (e) => {
    await saveShot(host, true);
    e.target.disabled = true;
    e.target.textContent = t("loading");
    try {
      const provider = await getProvider();
      await provider.requestStoryboardImageGeneration(state.selectedId);
      await loadState();
      toast(t("toast_img_generated"));
    } catch (err) {
      toast(err.message, "danger");
      render();
    }
  });
  on("shotUploadImg", () => uploadShotAsset(host, "image"));
  on("shotGenVid", async (e) => {
    await saveShot(host, true);
    e.target.disabled = true;
    e.target.textContent = t("loading");
    try {
      const provider = await getProvider();
      await provider.requestShotVideoGeneration(state.selectedId);
      await loadState();
      toast(t("toast_vid_generated"));
    } catch (err) {
      toast(err.message, "danger");
      render();
    }
  });
  on("shotUploadVid", () => uploadShotAsset(host, "video"));
  on("shotPromptPreview", async () => {
    await saveShot(host, true);
    openPromptPreview(state.selectedId);
  });
  on("shotDelete", async () => {
    if (!confirm(`${t("shot_delete")}?`)) return;
    try {
      const provider = await getProvider();
      await provider.deleteShot(state.selectedId);
      closeDetail();
      await loadState();
      toast(t("toast_shot_deleted"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });
  host.querySelectorAll("[data-img-active]").forEach((n) =>
    n.addEventListener("click", async () => {
      try {
        const provider = await getProvider();
        await provider.setShotActive(state.selectedId, "image", n.dataset.imgActive);
        await loadState();
      } catch (e) {
        toast(e.message, "danger");
      }
    }),
  );
  host.querySelectorAll("[data-vid-active]").forEach((n) =>
    n.addEventListener("click", async () => {
      try {
        const provider = await getProvider();
        await provider.setShotActive(state.selectedId, "video", n.dataset.vidActive);
        await loadState();
      } catch (e) {
        toast(e.message, "danger");
      }
    }),
  );
}

async function uploadShotAsset(host, kind) {
  await saveShot(host, true);
  const file = await pickFile(kind === "video" ? "video/*" : "image/*");
  if (!file) return;
  try {
    const provider = await getProvider();
    await provider.uploadShotAsset(state.selectedId, kind, file);
    await loadState();
    toast(t("toast_asset_uploaded"));
  } catch (e) {
    toast(e.message, "danger");
  }
}

async function saveShot(host, silent = false) {
  const card = host.querySelector("[data-shot]");
  if (!card) return;
  const f = collect(card);
  const characters = [...host.querySelectorAll("#shotChars input[data-char]:checked")].map((n) => n.dataset.char);
  const payload = {
    id: state.selectedId,
    title: f.title,
    duration_seconds: Number(f.duration_seconds) || 8,
    description: f.description,
    negative_prompt: f.negative_prompt,
    video_prompt: f.video_prompt,
    characters,
  };
  try {
    const provider = await getProvider();
    await provider.saveShot(payload);
    if (!silent) {
      await loadState();
      toast(t("toast_shot_saved"));
    }
  } catch (e) {
    toast(e.message, "danger");
  }
}

export async function newCharacter() {
  const id = `char-${Date.now()}`;
  try {
    const provider = await getProvider();
    await provider.saveCharacter({
      id,
      name: t("new_character_name"),
      role: "",
      status: "draft",
      visual: { front: "", side: "", back: "" },
      reference_card: { prompt: "" },
    });
    await loadState();
    openRecord(id, "cast");
  } catch (e) {
    toast(e.message, "danger");
  }
}
export async function newShot() {
  const id = `shot-${Date.now()}`;
  try {
    const provider = await getProvider();
    await provider.saveShot({ id, title: t("new_shot_name"), description: "", duration_seconds: 8, characters: [] });
    await loadState();
    openRecord(id, "storyboard");
  } catch (e) {
    toast(e.message, "danger");
  }
}

// ---------------------------------------------------------------------------
// Prompt preview — shows what the image model receives + the character cards
// fed in. Pure client-side computation now (no /api/storyboard-prompt round
// trip): the browser already has the full project state.
// ---------------------------------------------------------------------------
function openPromptPreview(shotId) {
  let data;
  try {
    data = storyboardPromptPreview(project(), shotId);
  } catch (e) {
    return toast(e.message, "danger");
  }
  const refs = data.references || [];
  const chars = data.characters || [];
  const modeLabel = data.mode === "image-edit" ? t("prompt_mode_img_edit") : t("prompt_mode_text");
  const node = document.createElement("div");
  node.className = "modal-backdrop";
  node.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><div class="modal-title">${t("prompt_preview_title")}</div><div class="modal-subtitle">${esc(data.title || t("new_shot_name"))} · ${esc(modeLabel)}</div></div><button class="modal-close" id="promptClose">${t("close")}</button></div>
      <div class="modal-body">
        ${chars.length ? `<section class="modal-section"><label>${t("prompt_label_chars")}</label>${chars.map((c) => `<div class="ctx-row"><span>${esc(c.name)}</span><p>${esc(c.visual_front || "")}${c.reference_image ? "" : t("prompt_no_ref")}</p></div>`).join("")}</section>` : ""}
        ${refs.length ? `<section class="modal-section"><label>${t("prompt_label_refs")}</label><div class="ref-grid">${refs.map((r) => `<figure><img class="ref-thumb" src="${esc(r.path)}" alt="" /><figcaption>${esc(r.name || r.kind)}</figcaption></figure>`).join("")}</div></section>` : `<section class="modal-section"><p class="muted">${t("prompt_no_ref_hint")}</p></section>`}
        <section class="modal-section"><label>${t("prompt_label_prompt")}</label><pre class="prompt-pre">${esc(data.prompt || "")}</pre></section>
        ${data.negative_prompt ? `<section class="modal-section"><label>${t("prompt_label_neg")}</label><pre class="prompt-pre">${esc(data.negative_prompt)}</pre></section>` : ""}
      </div>
    </section>`;
  document.body.appendChild(node);
  const close = () => node.remove();
  node.querySelector("#promptClose").addEventListener("click", close);
  node.addEventListener("click", (e) => {
    if (e.target === node) close();
  });
}
