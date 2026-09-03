/**
 * Raw Base rows in, the thing the editor is actually looking at out.
 *
 * Pure and isomorphic on purpose: the server imports it to build `/api/state`, and
 * the browser imports its issue vocabulary to label rows. Nothing here touches the
 * DOM or the SDK, so "what counts as a problem" is stated once instead of drifting
 * between the two sides.
 */

/** The one status the busabase-cms reader serves. Everything else is invisible online. */
export const LIVE_STATUS = "published";

/** Busabase sends a relation as one id or an array of them; the app wants an array. */
const toIdArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value) return [value];
  return [];
};

const toStringArray = (value) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  if (typeof value === "string" && value) return [value];
  return [];
};

/**
 * A one-line gist for a list row, without a DOM.
 *
 * Deliberately crude: the real preview sanitizes and renders properly in the
 * browser. This only has to be readable at 13px in a two-line clamp, and it has to
 * run on the server where there is no `DOMParser`.
 */
export const plainExcerpt = (body, kind, limit = 160) => {
  let text = String(body ?? "");
  text = kind === "pages" ? text.replace(/<[^>]*>/g, " ") : text.replace(/^```[\s\S]*?```$/gm, " ");
  text = text
    .replace(/^\s*[#>|-]+\s*/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

export const toItem = (record, kind) => {
  const fields = record.fields ?? {};
  const body = String(fields.body ?? "");
  return {
    recordId: record.id,
    headCommitId: record.headCommit?.id ?? record.headCommitId ?? null,
    kind,
    path: String(fields.path ?? ""),
    title: String(fields.title ?? "").trim(),
    slug: String(fields.slug ?? ""),
    locale: String(fields.locale ?? ""),
    status: String(fields.status ?? ""),
    template: kind === "pages" ? String(fields.template ?? "") : null,
    body,
    description: String(fields.description ?? ""),
    excerpt: String(fields.description ?? "").trim() || plainExcerpt(body, kind),
    author: String(fields.author ?? ""),
    categoryIds: toIdArray(fields.categories),
    tagIds: toIdArray(fields.tags),
    publishedAt: String(fields["published-at"] ?? ""),
    canonicalUrl: String(fields["canonical-url"] ?? ""),
    legacyPaths: toStringArray(fields["legacy-paths"]),
    seoTitle: String(fields["seo-title"] ?? ""),
    seoDescription: String(fields["seo-description"] ?? ""),
    schemaVersion: Number(fields["schema-version"] ?? 0),
    updatedAt: String(fields["updated-at"] ?? record.updatedAt ?? ""),
    /** The stored values, for checks that care about present-but-blank. */
    raw: fields,
  };
};

export const toTerm = (record, kind) => {
  const fields = record.fields ?? {};
  return {
    recordId: record.id,
    kind,
    name: String(fields.name ?? "").trim(),
    slug: String(fields.slug ?? ""),
    locale: String(fields.locale ?? ""),
    description: String(fields.description ?? ""),
    updatedAt: String(fields["updated-at"] ?? record.updatedAt ?? ""),
  };
};

/**
 * Issue codes, and the severity that decides row order.
 *
 * The browser turns each code into a sentence through i18n; the code itself never
 * appears in the UI. Wording lives in `app/i18n/messages.js` under
 * `issue.<code>.label` / `issue.<code>.hint`.
 */
export const ISSUE_TONES = {
  "blank-field": "danger",
  "bad-path": "danger",
  "duplicate-path": "danger",
  "empty-body": "danger",
  "missing-seo": "warn",
  "no-published-at": "warn",
  "not-published": "muted",
  orphan: "muted",
};

const SEVERITY = { danger: 3, warn: 2, muted: 1 };

export const worstTone = (issues) =>
  issues.map((issue) => ISSUE_TONES[issue] ?? "muted").sort((a, b) => SEVERITY[b] - SEVERITY[a])[0] ??
  null;

/**
 * Fields the reader requires to be non-empty *if present at all*.
 *
 * An empty string is a value, not an absence: the SDK's DTO rejects the whole row
 * and the post vanishes from the site with only a console warning. Absent is fine;
 * blank is fatal. Found by publishing a seeded draft that carried `description: ""`
 * and watching it never appear.
 */
const BLANK_IS_FATAL = ["description", "author", "seo-title", "seo-description", "canonical-url"];

/** Issues an item carries on its own, before the whole set is known. */
const itemIssues = (item) => {
  const issues = [];
  if (
    item.status === LIVE_STATUS &&
    BLANK_IS_FATAL.some((slug) => item.raw?.[slug] === "")
  ) {
    issues.push("blank-field");
  }
  if (item.status !== LIVE_STATUS) issues.push("not-published");
  if (!item.path.startsWith("/")) issues.push("bad-path");
  if (item.status === LIVE_STATUS && !item.seoDescription) issues.push("missing-seo");
  if (item.status === LIVE_STATUS && !item.body.trim()) issues.push("empty-body");
  if (item.kind === "posts" && item.status === LIVE_STATUS && !item.publishedAt) {
    issues.push("no-published-at");
  }
  return issues;
};

/** Something an operator should look at today, as opposed to merely unfinished. */
export const needsAttention = (item) => item.tone === "danger" || item.tone === "warn";

/**
 * @param {{posts?: object[], pages?: object[], categories?: object[], tags?: object[]}} raw
 */
export const analyze = (raw) => {
  const items = [
    ...(raw.posts ?? []).map((record) => toItem(record, "posts")),
    ...(raw.pages ?? []).map((record) => toItem(record, "pages")),
  ];
  const terms = [
    ...(raw.categories ?? []).map((record) => toTerm(record, "categories")),
    ...(raw.tags ?? []).map((record) => toTerm(record, "tags")),
  ];

  // A route collision only matters between rows the site actually serves; two
  // drafts sharing a path are just two drafts.
  const liveByRoute = new Map();
  for (const item of items) {
    if (item.status !== LIVE_STATUS) continue;
    const route = `${item.locale}|${item.path}`;
    liveByRoute.set(route, [...(liveByRoute.get(route) ?? []), item]);
  }
  const collided = new Set(
    [...liveByRoute.values()].filter((group) => group.length > 1).flat(),
  );

  for (const item of items) {
    item.issues = [...itemIssues(item), ...(collided.has(item) ? ["duplicate-path"] : [])];
    item.tone = worstTone(item.issues);
  }

  // An archive page lists published posts, so "unused" has to be counted the same
  // way. A term only a draft references is a third state — it starts working the
  // day that draft ships — and calling it unused would invite deleting it.
  const liveUsage = new Map();
  const draftUsage = new Map();
  for (const item of items) {
    const usage = item.status === LIVE_STATUS ? liveUsage : draftUsage;
    for (const id of [...item.categoryIds, ...item.tagIds]) {
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }
  const slugSeen = new Map();
  for (const term of terms) {
    const key = `${term.kind}|${term.locale}|${term.slug}`;
    slugSeen.set(key, (slugSeen.get(key) ?? 0) + 1);
  }
  for (const term of terms) {
    term.usedBy = liveUsage.get(term.recordId) ?? 0;
    term.usedByDrafts = draftUsage.get(term.recordId) ?? 0;
    term.duplicateSlug = (slugSeen.get(`${term.kind}|${term.locale}|${term.slug}`) ?? 0) > 1;
    term.issues = term.usedBy === 0 && term.usedByDrafts === 0 ? ["orphan"] : [];
    term.tone = worstTone(term.issues);
  }

  const live = items.filter((item) => item.status === LIVE_STATUS);
  return {
    items,
    terms,
    counts: {
      // The sidebar counts what the sidebar navigates to, so each number is the
      // size of the list you land in — not a filtered subset of it.
      posts: items.filter((item) => item.kind === "posts").length,
      pages: items.filter((item) => item.kind === "pages").length,
      categories: terms.filter((term) => term.kind === "categories").length,
      tags: terms.filter((term) => term.kind === "tags").length,
      live: live.length,
      not_live: items.length - live.length,
      needsAttention: items.filter(needsAttention).length,
      livePosts: live.filter((item) => item.kind === "posts").length,
      livePages: live.filter((item) => item.kind === "pages").length,
      orphanTerms: terms.filter((term) => term.usedBy === 0 && term.usedByDrafts === 0).length,
      locales: [...new Set(live.map((item) => item.locale))].filter(Boolean).sort(),
    },
  };
};
