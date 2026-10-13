import { bindForm } from "./actions.js";
import { characterName, escapeHtml, statusBadge } from "./format.js";
import { detailForm } from "./forms.js";
import { t } from "./i18n.js";
import { DETAIL_MODES } from "./router.js";
import { isMobileLayout } from "./shell.js";
import { $, project, store } from "./store.js";

export function collectionFor(currentView = store.view) {
  const p = project();
  if (currentView === "characters") return p.characters || [];
  if (currentView === "relationships") return p.relationships || [];
  if (currentView === "episodes") return p.episodes || [];
  if (currentView === "shots") return p.shots || [];
  if (currentView === "tasks") return p.tasks || [];
  return [];
}

export function matches(item) {
  if (!store.query) return true;
  return JSON.stringify(item).toLowerCase().includes(store.query.toLowerCase());
}

// The rows a list shows, in display order (also what arrow keys walk).
export function visibleItems(view = store.view) {
  const items = collectionFor(view).filter(matches);
  if (view === "episodes") items.sort((a, b) => (a.number || 0) - (b.number || 0));
  return items;
}

export function selectedItem() {
  return collectionFor().find((item) => String(item.id) === String(store.selectedId)) || null;
}

export function loadMoreControl(key) {
  if (!store.state?.pagination?.[key]) return "";
  return `<div class="load-more"><button type="button" class="button" data-load-more="${escapeHtml(key)}" ${store.loadingMore[key] ? "disabled" : ""}>${store.loadingMore[key] ? t("loading_more") : t("load_more")}</button>${store.loadMoreError[key] ? `<span role="alert">${t("load_more_failed")}</span>` : ""}</div>`;
}

// The toolbar count only shows while a search narrows the list (base-ui hides
// it otherwise; the nav already carries the total) — and on phones.
export function renderCount(items) {
  const more = store.state.pagination?.[store.view] ? "+" : "";
  $("itemCount").textContent = store.query
    ? `${items.length}${more}`
    : String(store.state.totalCount?.[store.view] ?? `${items.length}${more}`);
}

export function emptyList() {
  return store.query
    ? `<div class="empty-inline">${t("no_matches")}</div>`
    : `<div class="empty-inline"><strong>${t("empty_list")}</strong><span>${t("empty_list_hint")}</span></div>`;
}

export function rowClass(id) {
  const selected = id === store.selectedId || (!store.selectedId && id === store.cursorId);
  return selected ? "ws-selected" : "";
}

// Detail bar: Back on a page (and on phones), Close on a drawer/split, plus
// Open full page from a drawer/split — one detail implementation for all modes.
export function renderDetailBar() {
  const page = store.presentation === "page" || isMobileLayout();
  $("backToList").textContent = page ? t("back_to_list") : t("close");
  $("openFullPage").hidden = !store.selectedId || store.presentation === "page";
  $("detailPanel").querySelector(".ws-detail-bar").hidden = !store.selectedId;
}

// A relation-ish id (task target, relationship end) resolves to the target
// record's name; when the record is not in the loaded page, say so.
function recordLabel(id) {
  if (!id) return "—";
  const p = project();
  const hit =
    (p.episodes || []).find((item) => item.id === id) ||
    (p.characters || []).find((item) => item.id === id) ||
    (p.shots || []).find((item) => item.id === id) ||
    (p.relationships || []).find((item) => item.id === id);
  if (!hit) return t("not_loaded");
  if (hit.number) return `${t("episode_short")} ${hit.number} · ${hit.title || ""}`;
  return hit.name || hit.title || hit.type || t("not_loaded");
}

const characterLabel = characterName;

function hasThreeViews(item) {
  const visual = item.visual || {};
  return Boolean(visual.front && visual.side && visual.back);
}

function flag(ok, okLabel, missingLabel) {
  return ok
    ? `<span class="badge positive">${escapeHtml(okLabel)}</span>`
    : `<span class="badge warning">${escapeHtml(missingLabel)}</span>`;
}

function charactersTable(items) {
  return `
    <table class="ws-table">
      <thead><tr>
        <th>${t("col_character")}</th>
        <th class="ws-col-wide">${t("col_role")}</th>
        <th>${t("col_status")}</th>
        <th>${t("col_three_view")}</th>
        <th>${t("col_reference_card")}</th>
      </tr></thead>
      <tbody>
        ${items
          .map((item) => {
            const thumb = item.reference_card?.image_asset || "";
            return `<tr class="${rowClass(item.id)}" data-id="${escapeHtml(item.id)}">
              <td><span class="cell-name">${thumb ? `<img class="row-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" />` : `<span class="row-thumb" aria-hidden="true"></span>`}<strong>${escapeHtml(item.name || t("untitled"))}</strong></span></td>
              <td class="ws-col-wide">${escapeHtml(item.role || "—")}</td>
              <td>${statusBadge(item.status)}</td>
              <td>${flag(hasThreeViews(item), t("three_view_complete"), t("three_view_missing"))}</td>
              <td>${flag(Boolean(item.reference_card?.image_asset), t("ref_generated"), t("ref_pending"))}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function relationshipsTable(items) {
  return `
    <table class="ws-table">
      <thead><tr>
        <th>${t("col_relationship")}</th>
        <th>${t("col_from")}</th>
        <th>${t("col_to")}</th>
        <th>${t("col_temperature")}</th>
        <th class="ws-col-wide">${t("col_conflict")}</th>
      </tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `<tr class="${rowClass(item.id)}" data-id="${escapeHtml(item.id)}">
              <td><strong>${escapeHtml(item.type || t("untitled"))}</strong></td>
              <td>${escapeHtml(characterLabel(item.from))}</td>
              <td>${escapeHtml(characterLabel(item.to))}</td>
              <td>${escapeHtml(item.emotional_temperature || "—")}</td>
              <td class="ws-col-wide">${escapeHtml(item.conflict || "—")}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function tasksTable(items) {
  return `
    <table class="ws-table">
      <thead><tr>
        <th>${t("col_task")}</th>
        <th>${t("col_status")}</th>
        <th class="ws-col-narrow">${t("col_kind")}</th>
        <th class="ws-col-wide">${t("col_target")}</th>
        <th>${t("col_note")}</th>
      </tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `<tr class="${rowClass(item.id)}" data-id="${escapeHtml(item.id)}">
              <td><strong>${escapeHtml(item.title || t("untitled"))}</strong></td>
              <td>${statusBadge(item.status)}</td>
              <td class="ws-col-narrow">${escapeHtml(item.kind || "—")}</td>
              <td class="ws-col-wide">${escapeHtml(recordLabel(item.target_id))}</td>
              <td>${escapeHtml(item.note || "—")}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderDetail() {
  renderDetailBar();
  if (!store.selectedId) {
    $("detail").innerHTML =
      DETAIL_MODES[store.view] === "split" ? `<div class="ws-detail-empty">${t("select_task")}</div>` : "";
    return;
  }
  const item = selectedItem();
  $("detail").innerHTML = item
    ? detailForm(item)
    : `<div class="ws-detail-empty"><strong>${t("record_missing")}</strong><br />${t("record_missing_hint")}</div>`;
}

export function renderListAndDetail() {
  const items = visibleItems();
  renderCount(items);
  const table =
    store.view === "characters"
      ? charactersTable(items)
      : store.view === "relationships"
        ? relationshipsTable(items)
        : tasksTable(items);
  $("list").innerHTML = `${items.length ? table : emptyList()}${loadMoreControl(store.view)}`;
  renderDetail();
  bindForm();
}
