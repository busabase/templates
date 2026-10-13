import { t } from "./i18n.js";
import { project } from "./store.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function arr(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function lines(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

const STATUSES = ["draft", "needs_review", "changes_requested", "approved", "done", "blocked"];

export function statusLabel(status) {
  return STATUSES.includes(status) ? t(`status_${status}`) : status || t("status_draft");
}

export function statusBadge(status) {
  const label = statusLabel(status);
  return `<span class="badge status-${escapeHtml(status || "draft")}">${escapeHtml(label)}</span>`;
}

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

// Resolve a stored id to the record's name. When the record is not in the
// loaded page say so instead of printing the id.
export function characterName(id) {
  if (!id) return "—";
  return (project().characters || []).find((character) => character.id === id)?.name || t("not_loaded");
}

export function episodeTitle(id) {
  if (!id) return "—";
  return (project().episodes || []).find((episode) => episode.id === id)?.title || t("not_loaded");
}

// A select over loaded records keeps an unloaded current value as its own
// option, so saving the form never silently re-points the relation.
function recordOptions(ids, value) {
  return value && !ids.includes(value) ? [...ids, value] : ids;
}

export function input(name, label, value = "", type = "text") {
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" /></div>`;
}

export function textarea(name, label, value = "", full = true) {
  return `<div class="field ${full ? "full" : ""}"><label for="${name}">${label}</label><textarea id="${name}" name="${name}">${escapeHtml(value)}</textarea></div>`;
}

export function select(name, label, value, options) {
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
  </select></div>`;
}

// Options show the status label, never the raw stored value.
export function statusSelect(value) {
  const current = value || "draft";
  const options = STATUSES.includes(current) ? STATUSES : [...STATUSES, current];
  return `<div class="field"><label for="status">Status</label><select id="status" name="status">
    ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === current ? "selected" : ""}>${escapeHtml(statusLabel(option))}</option>`).join("")}
  </select></div>`;
}

export function characterSelect(name, label, value) {
  const options = recordOptions(
    (project().characters || []).map((character) => character.id),
    value,
  );
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((id) => `<option value="${escapeHtml(id)}" ${id === value ? "selected" : ""}>${escapeHtml(characterName(id))}</option>`).join("")}
  </select></div>`;
}

export function episodeSelect(name, label, value) {
  const options = recordOptions(
    (project().episodes || []).map((episode) => episode.id),
    value,
  );
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((id) => `<option value="${escapeHtml(id)}" ${id === value ? "selected" : ""}>${escapeHtml(episodeTitle(id))}</option>`).join("")}
  </select></div>`;
}

export function formActions() {
  return `<div class="form-actions"><button type="submit">${t("form_save")}</button><button type="button" class="danger" data-delete>${t("form_delete")}</button><span class="muted save-hint">${t("form_saved_connected")}</span></div>`;
}
