// Pure domain helpers for Busa Product Hub, ported from the retired
// app/server/demo.ts (dataset shape + inline metrics()/demoActivity()) and
// the retired app/app.js (filteredProducts/channelsFor/inventoryFor/
// reviewFor/effectiveReviewStatus join+filter helpers). Only TS types were
// stripped and DOM/fetch references removed -- same variable names, same
// order of operations.
//
// The retired app/server/store.ts only ever persisted a separate
// app/.data/decisions.json handoff bucket for review verdicts
// (applyDecision()); this Busabase-only shape replaces that with a direct
// field write onto the review item's own record (status/decision-note/
// decided-at), matching the busa-legal-contracts/busa-crm precedent. Since
// Busabase reads are always live, the retired app.js's
// effectiveReviewStatus() "compare decided_at vs generated_at staleness"
// overlay is gone entirely -- a review item's `status` field is always the
// current truth.
//
// products/channel_matrix/inventory/review_items/certificates enter Busabase
// through the operator's own workflow (directly, through $busabase, or
// through an agent acting on the operator's behalf) -- the browser itself
// only ever decides on a review item (approve/request_changes/block), it
// never creates a product, channel row, inventory row, or certificate. See
// busabase-provider.js's comments and SKILL.md's Boundary.
//
// Certificates never carry a stored status field. `certStatusFor()` below
// derives valid/expiring_soon/expired from `expiry-date` compared against
// "now" every time the snapshot is built, the same derived-not-stored
// pattern busa-expo-leads uses for its lead SLA bucket (slaStateFor) -- so
// the certificate list is always correct relative to when it is opened,
// never stale relative to whenever a record was last written.

export function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ---- Normalization: Busabase rows (already snake_cased by the provider) -> item shapes ----

export function normalizeProductRow({
  __recordId = "",
  product_id = "",
  ref = 0,
  sku = "",
  name = "",
  subtitle = "",
  category = "",
  lifecycle = "active",
  status = "active",
  owner = "",
  vendor = "",
  launch_date = "",
  image = "",
  gallery = "",
  tags = "",
  pricing = "",
  inventory = "",
  content = "",
  compliance = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    product_id,
    ref: Number(ref) || 0,
    sku,
    name: name || product_id,
    subtitle,
    category,
    lifecycle,
    status,
    owner,
    vendor,
    launch_date,
    image,
    gallery: parseJsonValue(gallery, []) || [],
    tags: parseJsonValue(tags, []) || [],
    pricing: parseJsonValue(pricing, {}) || {},
    inventory: parseJsonValue(inventory, {}) || {},
    content: parseJsonValue(content, {}) || {},
    compliance: parseJsonValue(compliance, {}) || {},
    created_at,
    updated_at,
    // The Busabase record id, kept only when a live row carried one: it is
    // what a certificate's `product` relation points at (see
    // agentReadinessFor()). Never written back -- productToFields() ignores it.
    ...(__recordId ? { record_id: __recordId } : {}),
  };
}

export function productToFields(product = {}) {
  return {
    product_id: product.product_id || "",
    ref: product.ref || 0,
    sku: product.sku || "",
    name: product.name || "",
    subtitle: product.subtitle || "",
    category: product.category || "",
    lifecycle: product.lifecycle || "active",
    status: product.status || "active",
    owner: product.owner || "",
    vendor: product.vendor || "",
    launch_date: product.launch_date || "",
    image: product.image || "",
    gallery: JSON.stringify(product.gallery || []),
    tags: JSON.stringify(product.tags || []),
    pricing: JSON.stringify(product.pricing || {}),
    inventory: JSON.stringify(product.inventory || {}),
    content: JSON.stringify(product.content || {}),
    compliance: JSON.stringify(product.compliance || {}),
    created_at: product.created_at || new Date().toISOString(),
    updated_at: product.updated_at || new Date().toISOString(),
  };
}

export function normalizeChannelRow({
  channel_id = "",
  product_id = "",
  platform = "",
  listing_id = "",
  status = "draft",
  price = 0,
  buybox = "",
  content_score = 0,
  issue = "",
  next_step = "",
  updated_at = "",
} = {}) {
  return {
    channel_id: channel_id || `${product_id}__${platform}`,
    product_id,
    platform,
    listing_id,
    status,
    price: Number(price) || 0,
    buybox: buybox === "true" ? true : buybox === "false" ? false : null,
    content_score: Number(content_score) || 0,
    issue,
    next_step,
    updated_at,
  };
}

export function channelToFields(channel = {}) {
  return {
    channel_id: channel.channel_id || `${channel.product_id}__${channel.platform}`,
    product_id: channel.product_id || "",
    platform: channel.platform || "",
    listing_id: channel.listing_id || "",
    status: channel.status || "draft",
    price: channel.price || 0,
    buybox: channel.buybox === true ? "true" : channel.buybox === false ? "false" : "",
    content_score: channel.content_score || 0,
    issue: channel.issue || "",
    next_step: channel.next_step || "",
    updated_at: channel.updated_at || new Date().toISOString(),
  };
}

export function normalizeInventoryRow({
  inventory_id = "",
  product_id = "",
  warehouse_id = "",
  warehouse_name = "",
  on_hand = 0,
  available = 0,
  reserved = 0,
  inbound = 0,
  inbound_eta = "",
  days_cover = 0,
  status = "healthy",
  updated_at = "",
} = {}) {
  return {
    inventory_id: inventory_id || `${product_id}__${warehouse_id}`,
    product_id,
    warehouse_id,
    warehouse_name,
    on_hand: Number(on_hand) || 0,
    available: Number(available) || 0,
    reserved: Number(reserved) || 0,
    inbound: Number(inbound) || 0,
    inbound_eta,
    days_cover: Number(days_cover) || 0,
    status,
    updated_at,
  };
}

export function inventoryToFields(item = {}) {
  return {
    inventory_id: item.inventory_id || `${item.product_id}__${item.warehouse_id}`,
    product_id: item.product_id || "",
    warehouse_id: item.warehouse_id || "",
    warehouse_name: item.warehouse_name || "",
    on_hand: item.on_hand || 0,
    available: item.available || 0,
    reserved: item.reserved || 0,
    inbound: item.inbound || 0,
    inbound_eta: item.inbound_eta || "",
    days_cover: item.days_cover || 0,
    status: item.status || "healthy",
    updated_at: item.updated_at || new Date().toISOString(),
  };
}

// `type` is free-form text on the review Base (not a constrained enum), so
// this is a documented value convention rather than a schema migration.
// Known values: `publish_approval`, `quality_hold`, `price_change`, a
// lifecycle/archive decision, and:
//
//   `spec_claim` -- a specification claim the agent extracted from an
//   uploaded document (e.g. a spec-sheet PDF) WITHOUT a clear page/section
//   citation. Any `products` field or `certificates` row whose
//   `source-note` doesn't cite a specific document + location (e.g.
//   "spec-sheet.pdf p.3", not "uploaded by operator") should get a
//   corresponding `spec_claim` review item before that fact is trustworthy
//   enough to appear on a customer-facing quote. It renders in the review
//   queue exactly like every other type (reviewRow() in app.js keys off
//   `type` only for the badge label) -- there is no separate UI surface.
export function normalizeReviewRow({
  item_id = "",
  ref = 0,
  product_id = "",
  type = "publish_approval",
  status = "needs_review",
  title = "",
  summary = "",
  risk = "medium",
  recommendation = "",
  evidence = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_detail = "",
  executed_at = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    item_id,
    ref: Number(ref) || 0,
    product_id,
    type,
    status,
    title,
    summary,
    risk,
    recommendation,
    evidence: parseJsonValue(evidence, []) || [],
    decision_note,
    decided_at,
    execution_status,
    execution_detail,
    executed_at,
    created_at,
    updated_at,
  };
}

export function reviewToFields(item = {}) {
  return {
    item_id: item.item_id || "",
    ref: item.ref || 0,
    product_id: item.product_id || "",
    type: item.type || "publish_approval",
    status: item.status || "needs_review",
    title: item.title || "",
    summary: item.summary || "",
    risk: item.risk || "medium",
    recommendation: item.recommendation || "",
    evidence: JSON.stringify(item.evidence || []),
    decision_note: item.decision_note || "",
    decided_at: item.decided_at || "",
    execution_status: item.execution_status || "",
    execution_detail: item.execution_detail || "",
    executed_at: item.executed_at || "",
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || new Date().toISOString(),
  };
}

export function normalizeCertificateRow({
  __recordId = "",
  __headCommitId,
  product = "",
  cert_type = "Other",
  issuer = "",
  cert_number = "",
  issued_date = "",
  expiry_date = "",
  file = null,
  source_note = "",
} = {}) {
  return {
    certificate_id: __recordId,
    __headCommitId,
    product_id: Array.isArray(product) ? product[0] || "" : product || "",
    cert_type,
    issuer,
    cert_number,
    issued_date,
    expiry_date,
    file: file ?? null,
    source_note,
  };
}

export function certificateToFields(item = {}) {
  return {
    product: item.product_id || "",
    cert_type: item.cert_type || "Other",
    issuer: item.issuer || "",
    cert_number: item.cert_number || "",
    issued_date: item.issued_date || "",
    expiry_date: item.expiry_date || "",
    file: item.file ?? null,
    source_note: item.source_note || "",
  };
}

// Certificate status is never stored (see the file-header comment): always
// derived from `expiry_date` compared to "now". A missing/unparseable
// expiry date is treated as `expired`, never silently hidden as `valid` --
// an export desk with no expiry on file for a certificate should never read
// as safe by default.
export const CERT_EXPIRING_SOON_DAYS = 90;

export function certStatusFor(expiryDateIso, nowIso = new Date().toISOString()) {
  const expiry = Date.parse(expiryDateIso || "");
  const now = Date.parse(nowIso) || Date.now();
  if (!Number.isFinite(expiry)) return "expired";
  const daysRemaining = (expiry - now) / 86_400_000;
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= CERT_EXPIRING_SOON_DAYS) return "expiring_soon";
  return "valid";
}

// ---- Certificate -> product join. A certificate's `product` is a real
// relation field, so on a live install normalizeCertificateRow() yields the
// linked product's Busabase RECORD id, while demo data and ingest payloads
// carry the natural product_id. Every join accepts either, so no screen ever
// falls back to showing a raw record id. ----

// The identities one product answers to: its product_id and, for a live row,
// its record id (`record_id` once normalized, `__recordId` on a raw row).
export function productKeys(product = {}) {
  return new Set([product.product_id, product.record_id, product.__recordId].filter(Boolean));
}

// `productOrId` is a product object (preferred: matches both identities) or,
// for backwards compatibility, a bare product_id / record id string.
export function certificatesFor(certificates = [], productOrId = "") {
  const keys =
    productOrId && typeof productOrId === "object" ? productKeys(productOrId) : new Set([productOrId].filter(Boolean));
  return certificates.filter((item) => keys.has(item.product_id));
}

// The product a certificate belongs to, or null when that product is not
// among `products` (e.g. not on the loaded page).
export function productForCertificate(products = [], certificate = {}) {
  const key = certificate.product_id;
  if (!key) return null;
  return products.find((product) => productKeys(product).has(key)) || null;
}

// Every certificate annotated with its own `cert_status`, sorted
// soonest-expiry-first within (expired, expiring_soon) and left out of the
// count entirely once it's comfortably `valid` far in the future -- mirrors
// bucketLeads()'s shape in busa-expo-leads's expo-leads-model.js. `valid`
// certificates are still returned (for the full Certificates list/detail
// pages), just not prioritized to the front.
export function sortCertificatesByUrgency(certificates = [], now = new Date().toISOString()) {
  const RANK = { expired: 0, expiring_soon: 1, valid: 2 };
  return [...certificates]
    .map((item) => ({ ...item, cert_status: certStatusFor(item.expiry_date, now) }))
    .sort((a, b) => {
      const rankDiff = RANK[a.cert_status] - RANK[b.cert_status];
      if (rankDiff !== 0) return rankDiff;
      return String(a.expiry_date).localeCompare(String(b.expiry_date));
    });
}

// Sanitized config summary for #/settings -- reads straight off the live
// Settings row. Shape mirrors the retired app/server/store.ts's
// summarizeConfig(), minus secret-env bookkeeping (no local env/token
// concept survives in the Busabase-only shape; platform connectivity is
// tracked outside this app).
/**
 * @param {{ settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ settings = {} } = {}) {
  return {
    config_path: "busabase",
    is_example: false,
    seller: {
      brand: settings.seller_brand || "",
      entity: settings.seller_entity || "",
      base_currency: settings.base_currency || "USD",
    },
    platforms: parseJsonValue(settings.platforms, []) || [],
    warehouses: parseJsonValue(settings.warehouses, []) || [],
    review_policy: parseJsonValue(settings.review_policy, {}) || {},
    sync: parseJsonValue(settings.sync, {}) || {},
  };
}

// ---- Joins/filters, ported from the retired app/app.js ----

export function channelsFor(channels = [], productId = "") {
  return channels.filter((item) => item.product_id === productId);
}

export function inventoryFor(inventory = [], productId = "") {
  return inventory.find((item) => item.product_id === productId) || null;
}

export function reviewFor(reviewItems = [], productId = "") {
  return reviewItems.filter((item) => item.product_id === productId);
}

export function filteredProducts(products = [], query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter((product) =>
    [product.name, product.sku, product.category, product.owner, product.vendor, ...(product.tags || [])]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

// ---- Agent readiness: how ready one product's data is for AI shopping
// agents (ChatGPT, Gemini, Meta Muse, Amazon Rufus) to read and recommend.
// Derived, never stored -- the same pattern as certStatusFor(): every check
// is recomputed from rows already on the page, so the score can never go
// stale relative to the data it describes, and there is no field to write.
//
// The optional attribute keys live INSIDE the existing `content` JSON block
// (`content.attributes.{weight,dimensions,warranty,returns}`), so this adds
// no Base field and no schema version. ----

export const AGENT_READINESS_CHECK_IDS = [
  "price",
  "availability",
  "channel-price",
  "attributes",
  "images",
  "sourced-claims",
  "certificates",
];
export const AGENT_ATTRIBUTE_KEYS = ["weight", "dimensions", "warranty", "returns"];
// Channel statuses that mean a shopper (or a shopping agent) can see the
// listing's price right now. ready_to_publish/draft/price_review/suppressed
// are not public yet (or no longer), so they cannot contradict each other.
export const AGENT_LIVE_CHANNEL_STATUSES = new Set(["live", "active"]);
// Review statuses that leave a spec_claim unresolved: not yet decided, or
// sent back for a better source. approved/blocked are both final verdicts.
export const OPEN_REVIEW_STATUSES = new Set(["needs_review", "changes_requested"]);
const CHANNEL_PRICE_TOLERANCE = 0.01;

function knownNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonEmpty(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "";
}

function plural(count, one, other) {
  return `${count} ${count === 1 ? one : other}`;
}

/**
 * @param {Record<string, any>} product a normalized product (normalizeProductRow shape)
 * @param {{ channels?: any[], inventory?: any[], certificates?: any[], reviewItems?: any[], now?: string }} [context]
 * @returns {{ passed: number, total: number, checks: { id: string, ok: boolean, detail: string, reason: string, data: Record<string, any> }[] }}
 */
export function agentReadinessFor(
  product = {},
  { channels = [], inventory = [], certificates = [], reviewItems = [], now = new Date().toISOString() } = {},
) {
  const keys = productKeys(product);
  const checks = [];
  const add = (id, ok, reason, detail, data = {}) => checks.push({ id, ok, reason, detail, data });

  // 1. price -- a price and the currency it is in. `price` is the Busabase
  // record shape; `current_price` is the demo/ingest shape of the same fact.
  const pricing = product.pricing || {};
  const price = knownNumber(pricing.price ?? pricing.current_price);
  const currency = nonEmpty(pricing.currency) ? String(pricing.currency).trim() : "";
  const hasPrice = price !== null && price > 0;
  if (hasPrice && currency) add("price", true, "priced", `${currency} ${price.toFixed(2)}`, { price, currency });
  else if (!hasPrice && !currency) add("price", false, "missing_price_currency", "no price or currency");
  else if (!hasPrice) add("price", false, "missing_price", "no price");
  else add("price", false, "missing_currency", "price has no currency", { price });

  // 2. availability -- a known available (or on-hand) quantity, from the
  // product's own inventory rollup or, failing that, its warehouse rows.
  const rollup = product.inventory || {};
  let available = knownNumber(rollup.available ?? rollup.on_hand);
  if (available === null) {
    const rows = inventory.filter((row) => keys.has(row.product_id));
    if (rows.length) {
      available = rows.reduce((sum, row) => sum + (knownNumber(row.available ?? row.on_hand) || 0), 0);
    }
  }
  if (available !== null) add("availability", true, "available", `${available} available`, { count: available });
  else add("availability", false, "unknown_stock", "no stock quantity on file");

  // 3. channel-price -- every live channel that shows a price shows the same one.
  const priced = channels
    .filter((row) => keys.has(row.product_id) && AGENT_LIVE_CHANNEL_STATUSES.has(row.status))
    .map((row) => ({ platform: row.platform, price: knownNumber(row.price) }))
    .filter((row) => row.price !== null && row.price > 0);
  if (!priced.length) {
    add("channel-price", true, "no_priced_channels", "no priced channels");
  } else {
    const prices = priced.map((row) => row.price);
    const spread = Math.max(...prices) - Math.min(...prices);
    const list = priced.map((row) => `${row.platform} ${row.price.toFixed(2)}`).join(", ");
    if (spread <= CHANNEL_PRICE_TOLERANCE + 1e-9) {
      add("channel-price", true, "channel_prices_match", `same price on ${plural(priced.length, "live channel", "live channels")}`, {
        count: priced.length,
      });
    } else {
      add("channel-price", false, "channel_price_mismatch", `live channels disagree: ${list}`, { list, channels: priced });
    }
  }

  // 4. attributes -- the facts a shopping agent is asked about most.
  const attributes = product.content?.attributes;
  const attrs = attributes && typeof attributes === "object" && !Array.isArray(attributes) ? attributes : {};
  const missing = AGENT_ATTRIBUTE_KEYS.filter((key) => !nonEmpty(attrs[key]));
  if (!missing.length) add("attributes", true, "attributes_complete", "weight, dimensions, warranty, returns");
  else add("attributes", false, "attributes_missing", `missing ${missing.join(", ")}`, { missing });

  // 5. images -- the listing's image set is marked ready.
  if (product.content?.images_ready === true) add("images", true, "images_ready", "images ready");
  else add("images", false, "images_not_ready", "images not marked ready");

  // 6. sourced-claims -- no unresolved spec_claim for this product.
  const openClaims = reviewItems.filter(
    (item) => keys.has(item.product_id) && item.type === "spec_claim" && OPEN_REVIEW_STATUSES.has(item.status),
  ).length;
  if (!openClaims) add("sourced-claims", true, "no_open_claims", "no open spec claims");
  else
    add("sourced-claims", false, "open_claims", `${plural(openClaims, "open spec claim", "open spec claims")}`, {
      count: openClaims,
    });

  // 7. certificates -- nothing on file has lapsed (derived status, as above).
  const expired = certificates.filter(
    (item) => keys.has(item.product_id) && certStatusFor(item.expiry_date, now) === "expired",
  );
  if (!expired.length) add("certificates", true, "no_expired_certs", "no expired certificates");
  else {
    const types = expired.map((item) => item.cert_type || "Other").join(", ");
    add("certificates", false, "expired_certs", `expired: ${types}`, { types });
  }

  return { passed: checks.filter((check) => check.ok).length, total: checks.length, checks };
}

// Products whose readiness is a full score, out of the products given.
export function countAgentReady(products = [], context = {}) {
  return products.filter((product) => {
    const { passed, total } = agentReadinessFor(product, context);
    return passed === total;
  }).length;
}

// ---- Metrics, ported verbatim from the retired app/server/demo.ts's
// metrics() -- same field names, same rollup logic. ----

function money(value = 0) {
  return Math.round(value * 100) / 100;
}

export function computeMetrics(products = [], channels = [], inventory = [], certificates = [], now = new Date().toISOString()) {
  const active = products.filter((product) => ["active", "launch", "test"].includes(product.lifecycle)).length;
  const needsReview = products.filter((product) => product.status === "needs_review").length;
  const lowStock = inventory.filter((item) => ["low_stock", "stockout_risk"].includes(item.status)).length;
  const channelIssues = channels.filter((item) => item.issue).length;
  const marginAvg = products.length
    ? products.reduce((sum, product) => sum + (product.pricing?.gross_margin_pct || 0), 0) / products.length
    : 0;
  const inventoryValue = products.reduce(
    (sum, product) => sum + (product.inventory?.available || 0) * (product.pricing?.landed_cost || 0),
    0,
  );
  const certStatuses = certificates.map((item) => certStatusFor(item.expiry_date, now));
  const expiringCerts = certStatuses.filter((status) => status === "expiring_soon").length;
  const expiredCerts = certStatuses.filter((status) => status === "expired").length;
  return {
    product_count: products.length,
    active_count: active,
    needs_review_count: needsReview,
    low_stock_count: lowStock,
    channel_issue_count: channelIssues,
    avg_margin_pct: money(marginAvg),
    inventory_value: money(inventoryValue),
    expiring_cert_count: expiringCerts,
    expired_cert_count: expiredCerts,
  };
}

// ---- Review decision -> status mapping, ported verbatim from the retired
// app/app.js's DECISION_STATUS table (the only three actions the retired
// review queue actually exposed as buttons -- "revise" existed in
// app/server/store.ts's DECISION_ACTIONS but only reachable by queuing an
// internal agent_tasks entry, which has no Busabase-only equivalent since
// agent execution happens entirely outside this app). ----

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "block"]);

export function statusForVerdict(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus;
}

// New orchestration (not a port): derives a recent-activity feed from each
// product's and review item's own timestamps instead of reading a persisted
// activity_log.json, since Busabase reads are always live and there is no
// staleness to paper over (mirrors busa-legal-contracts'
// deriveActivityLog()). The retired app/server/demo.ts's hand-authored
// demoActivity() narrative strings are kept verbatim in the demo provider
// instead, since they reference specific facts (inventory cover falling
// below a threshold, a listing being suppressed) that are richer than a
// generic timestamp-derived line.
export function deriveActivityLog(products = [], reviewItems = [], { limit = 50 } = {}) {
  const entries = [];
  for (const product of products) {
    if (product.updated_at) {
      entries.push({
        id: `act-${product.product_id}-updated`,
        at: product.updated_at,
        actor: "agent",
        text: `Updated ${product.name || product.product_id}.`,
      });
    }
  }
  for (const item of reviewItems) {
    if (item.decided_at && item.decision_note !== undefined) {
      const label =
        item.status === "approved"
          ? "Approved"
          : item.status === "changes_requested"
            ? "Requested changes on"
            : "Blocked";
      entries.push({
        id: `act-${item.item_id}-decision`,
        at: item.decided_at,
        actor: "seller",
        text: `${label} ${item.title || item.item_id}${item.decision_note ? `: ${item.decision_note}` : "."}`,
      });
    }
  }
  return entries.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// Pure assembly on already-parsed products/channels/inventory/review_items
// (fields as real objects/arrays, not JSON strings) plus a seller summary.
// Used by both the demo provider (which builds its fixtures already in this
// shape) and buildSnapshot() below for the Busabase-row path.
export function assembleSnapshot({
  products = [],
  channel_matrix = [],
  inventory = [],
  review_items = [],
  certificates = [],
  activity_log = null,
  seller = {},
  now = new Date().toISOString(),
} = {}) {
  const sortedProducts = [...products].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const sortedReviewItems = [...review_items].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const sortedCertificates = sortCertificatesByUrgency(certificates, now);
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "busa-product-hub",
    seller,
    metrics: computeMetrics(sortedProducts, channel_matrix, inventory, certificates, now),
    products: sortedProducts,
    channel_matrix,
    inventory,
    review_items: sortedReviewItems,
    certificates: sortedCertificates,
    activity_log: activity_log || deriveActivityLog(sortedProducts, sortedReviewItems),
    warnings:
      sortedProducts.length || sortedReviewItems.length
        ? []
        : [
            {
              id: "no-snapshot",
              severity: "info",
              message:
                "No product snapshot exists yet. Import products or ask the agent to prepare a product-management snapshot.",
            },
          ],
  };
  return snapshot;
}

// Adapted from the retired SKILL.md workflow's step 5 ("execute only approved
// operations, record concrete results in execution_report.json"): maps a
// decided review item to the concrete follow-up operation the agent must
// perform outside the app, and the target the operation acts on. The retired
// app wrote a list of ExecutionResult entries to a separate
// execution_report.json; this shape writes one execution marker directly
// onto the review item's own record instead (see scripts/execute_decisions.mjs).
export function reviewExecution(item, decision, productName = "", { apply = false } = {}) {
  const status = apply ? "ready_for_agent" : "planned";
  if (decision.action === "request_changes") {
    return {
      operation: "request_revision",
      target: item.item_id,
      status,
      detail: "Redraft the recommendation per the review note, then re-ingest with scripts/ingest_products.mjs.",
    };
  }
  if (decision.action === "block") {
    return {
      operation: "maintain_block",
      target: item.product_id,
      status,
      detail: `Keep ${productName || item.product_id} blocked on every channel until the review note's conditions are met.`,
    };
  }
  if (decision.action !== "approve") return null;
  if (item.type === "publish_approval") {
    return {
      operation: "publish_channel",
      target: item.product_id,
      status,
      detail: `Publish the approved channel listing for ${productName || item.product_id} outside the app, then record the result.`,
    };
  }
  if (item.type === "price_change") {
    return {
      operation: "apply_price_change",
      target: item.product_id,
      status,
      detail: `Apply the approved price change for ${productName || item.product_id} on the channel(s) outside the app.`,
    };
  }
  if (item.type === "quality_hold") {
    return {
      operation: item.recommendation === "block" ? "maintain_quality_hold" : "lift_quality_hold",
      target: item.product_id,
      status,
      detail:
        item.recommendation === "block"
          ? `Keep the quality hold on ${productName || item.product_id} in place.`
          : `Lift the quality hold on ${productName || item.product_id} and resume channel publishing.`,
    };
  }
  if (item.type === "spec_claim") {
    return {
      operation: "verify_spec_claim",
      target: item.product_id,
      status,
      detail: `The operator has confirmed the source for this claim on ${productName || item.product_id} -- it is now safe to include on a customer-facing quote or spec sheet.`,
    };
  }
  return {
    operation: "archive_product",
    target: item.product_id,
    status,
    detail: `Archive ${productName || item.product_id} outside the app per the lifecycle decision.`,
  };
}

// Busabase-row wrapper: normalizes the raw
// products/channels/inventory/review/certificates rows read from Busabase
// (already snake_cased by the provider) into item shapes, pulls the seller
// profile off the live Settings row, then calls assembleSnapshot().
export function buildSnapshot({
  products = [],
  channels = [],
  inventory = [],
  reviewItems = [],
  certificates = [],
  settings = {},
  now = new Date().toISOString(),
} = {}) {
  const configSummary = buildConfigSummary({ settings });
  return assembleSnapshot({
    products: products.map(normalizeProductRow),
    channel_matrix: channels.map(normalizeChannelRow),
    inventory: inventory.map(normalizeInventoryRow),
    review_items: reviewItems.map(normalizeReviewRow),
    certificates: certificates.map(normalizeCertificateRow),
    seller: configSummary.seller,
    now,
  });
}
