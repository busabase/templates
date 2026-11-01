import { t } from "./i18n.js";
import { store } from "./store.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(store.uiLanguage === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * A localized name record ({ en, "zh-CN" }) → the one name that matches the UI
 * language. Installed display names are the English name alone; the Chinese
 * name lives in `localizedName`, which is what this UI renders per language.
 */
export function localizedName(value) {
  if (value && typeof value === "object") {
    return store.uiLanguage === "zh-CN" ? (value["zh-CN"] ?? value.en ?? "") : (value.en ?? "");
  }
  return String(value ?? "");
}

/**
 * Choice labels arrive as localizedName records from `CHOICES` in schema.js.
 * A badge has room for one language, so pick the matching one instead of
 * truncating. Plain strings still occur in names provisioned by older
 * installs, where one string carried both languages as "English / 中文" —
 * pick the matching half of those too.
 */
export function localizedChoice(name) {
  if (name && typeof name === "object") return localizedName(name);
  const parts = String(name ?? "").split(" / ");
  if (parts.length < 2) return parts[0] ?? "";
  return store.uiLanguage === "zh-CN" ? parts[1] : parts[0];
}

export const localeLabel = (id, choices) =>
  localizedChoice(choices?.locale?.[id]) || id || t("common.unknown");

export const statusLabel = (id, choices) =>
  localizedChoice(choices?.status?.[id]) || id || t("common.unknown");

export const templateLabel = (id, choices) =>
  localizedChoice(choices?.template?.[id]) || id || t("common.unknown");

/** `posts`/`pages` as a word the reader uses, not the Base key. */
export const kindLabel = (kind) => t(kind === "posts" ? "kind.post" : "kind.page");

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access is denied in some embed contexts; the caller falls back to
    // selecting the text so the value is still obtainable.
    return false;
  }
}
