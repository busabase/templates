import assert from "node:assert/strict";
import test from "node:test";
import {
  CERT_EXPIRING_SOON_DAYS,
  DECISION_ACTIONS,
  assembleSnapshot,
  buildConfigSummary,
  certStatusFor,
  certificateToFields,
  certificatesFor,
  channelToFields,
  channelsFor,
  computeMetrics,
  filteredProducts,
  inventoryFor,
  inventoryToFields,
  normalizeCertificateRow,
  normalizeChannelRow,
  normalizeInventoryRow,
  normalizeProductRow,
  normalizeReviewRow,
  parseJsonValue,
  productToFields,
  reviewExecution,
  reviewFor,
  reviewToFields,
  sortCertificatesByUrgency,
  statusForVerdict,
} from "../app/js/product-hub-model.js";

test("parseJsonValue: parses valid JSON, falls back on empty/invalid input", () => {
  assert.deepEqual(parseJsonValue("[1,2,3]", []), [1, 2, 3]);
  assert.deepEqual(parseJsonValue("", []), []);
  assert.deepEqual(parseJsonValue("not json", { a: 1 }), { a: 1 });
  assert.deepEqual(parseJsonValue(undefined, null), null);
});

test("productToFields/normalizeProductRow round trip preserves every field, including JSON-encoded blocks", () => {
  const product = {
    product_id: "prod-aurora-lamp",
    ref: 1,
    sku: "NH-AL-01",
    name: "Aurora Gradient Desk Lamp",
    subtitle: "USB-C aluminum lamp",
    category: "Home Office Lighting",
    lifecycle: "launch",
    status: "needs_review",
    owner: "Mia",
    vendor: "Dongguan Lumenworks",
    launch_date: "2026-07-18",
    image: "/assets/product-images/aurora-lamp.png",
    gallery: ["/assets/product-images/aurora-lamp.png", "/assets/product-images/aurora-lamp-lifestyle.png"],
    tags: ["new launch", "hero SKU"],
    pricing: { cogs: 11.8, landed_cost: 15.25, gross_margin_pct: 51.4 },
    inventory: { on_hand: 920, days_cover: 16 },
    content: { hero_images_ready: 5, hero_images_required: 6, video_ready: false },
    compliance: { score: 86, status: "warn", notes: ["EU energy-label image missing."] },
    created_at: "2026-06-20T02:00:00.000Z",
    updated_at: "2026-07-07T07:52:00.000Z",
  };
  const fields = productToFields(product);
  const roundTripped = normalizeProductRow(fields);
  assert.deepEqual(roundTripped, product);
});

test("channelToFields/normalizeChannelRow round trip preserves buybox tri-state (true/false/null)", () => {
  const withTrue = normalizeChannelRow(
    channelToFields({ channel_id: "p1__amazon", product_id: "p1", platform: "amazon", buybox: true }),
  );
  const withFalse = normalizeChannelRow(
    channelToFields({ channel_id: "p1__amazon", product_id: "p1", platform: "amazon", buybox: false }),
  );
  const withNull = normalizeChannelRow(
    channelToFields({ channel_id: "p1__amazon", product_id: "p1", platform: "amazon", buybox: null }),
  );
  assert.equal(withTrue.buybox, true);
  assert.equal(withFalse.buybox, false);
  assert.equal(withNull.buybox, null);
});

test("channel-id defaults to product_id__platform when not supplied", () => {
  const fields = channelToFields({ product_id: "prod-lunchbox", platform: "amazon" });
  assert.equal(fields.channel_id, "prod-lunchbox__amazon");
});

test("inventoryToFields/normalizeInventoryRow round trip preserves every field", () => {
  const item = {
    inventory_id: "prod-aurora-lamp__wh-sz",
    product_id: "prod-aurora-lamp",
    warehouse_id: "wh-sz",
    warehouse_name: "Shenzhen 3PL",
    on_hand: 920,
    available: 712,
    reserved: 134,
    inbound: 1800,
    inbound_eta: "2026-07-14",
    days_cover: 16,
    status: "low_stock",
    updated_at: "2026-07-07T07:51:00.000Z",
  };
  assert.deepEqual(normalizeInventoryRow(inventoryToFields(item)), item);
});

test("reviewToFields/normalizeReviewRow round trip preserves every field, including JSON evidence array", () => {
  const item = {
    item_id: "review-aurora-launch",
    ref: 1,
    product_id: "prod-aurora-lamp",
    type: "publish_approval",
    status: "needs_review",
    title: "Approve Aurora Lamp Amazon launch",
    summary: "Publish Amazon US at $38.99.",
    risk: "medium",
    recommendation: "approve",
    evidence: ["Gross margin 51.4%, above 32% floor.", "Inventory cover is only 16 days."],
    decision_note: "",
    decided_at: "",
    execution_status: "",
    execution_detail: "",
    executed_at: "",
    created_at: "2026-07-07T08:00:00.000Z",
    updated_at: "2026-07-07T08:00:00.000Z",
  };
  assert.deepEqual(normalizeReviewRow(reviewToFields(item)), item);
});

test("statusForVerdict: worked example over the three review-queue actions", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  assert.equal(statusForVerdict("unknown", "needs_review"), "needs_review");
});

test("DECISION_ACTIONS matches the three buttons the retired review queue actually exposed", () => {
  assert.deepEqual([...DECISION_ACTIONS].sort(), ["approve", "block", "request_changes"]);
});

test("channelsFor/inventoryFor/reviewFor join helpers filter by product_id", () => {
  const channels = [
    { product_id: "p1", platform: "amazon" },
    { product_id: "p2", platform: "shopify" },
  ];
  const inventory = [
    { product_id: "p1", warehouse_id: "wh-1" },
    { product_id: "p2", warehouse_id: "wh-2" },
  ];
  const reviewItems = [
    { product_id: "p1", item_id: "r1" },
    { product_id: "p2", item_id: "r2" },
  ];
  assert.equal(channelsFor(channels, "p1").length, 1);
  assert.equal(inventoryFor(inventory, "p2").warehouse_id, "wh-2");
  assert.equal(inventoryFor(inventory, "missing"), null);
  assert.equal(reviewFor(reviewItems, "p1")[0].item_id, "r1");
});

test("filteredProducts: matches name/sku/category/owner/vendor/tags, case-insensitively", () => {
  const products = [
    {
      name: "Aurora Gradient Desk Lamp",
      sku: "NH-AL-01",
      category: "Lighting",
      owner: "Mia",
      vendor: "Lumenworks",
      tags: ["hero SKU"],
    },
    {
      name: "Collapsible Silicone Lunch Box",
      sku: "NH-LB-01",
      category: "Kitchen",
      owner: "Noah",
      vendor: "Foldware",
      tags: [],
    },
  ];
  assert.equal(filteredProducts(products, "").length, 2);
  assert.equal(filteredProducts(products, "aurora").length, 1);
  assert.equal(filteredProducts(products, "NH-LB-01").length, 1);
  assert.equal(filteredProducts(products, "hero sku").length, 1);
  assert.equal(filteredProducts(products, "nomatch").length, 0);
});

test("computeMetrics: worked example over the retired demo.ts's five products", () => {
  const products = [
    {
      lifecycle: "launch",
      status: "needs_review",
      pricing: { gross_margin_pct: 51.4, landed_cost: 15.25 },
      inventory: { available: 712 },
    },
    {
      lifecycle: "active",
      status: "active",
      pricing: { gross_margin_pct: 47.1, landed_cost: 7.45 },
      inventory: { available: 3820 },
    },
    {
      lifecycle: "active",
      status: "blocked",
      pricing: { gross_margin_pct: 28.3, landed_cost: 12.9 },
      inventory: { available: 420 },
    },
    {
      lifecycle: "test",
      status: "needs_review",
      pricing: { gross_margin_pct: 44.8, landed_cost: 10.85 },
      inventory: { available: 510 },
    },
    {
      lifecycle: "archive",
      status: "retiring",
      pricing: { gross_margin_pct: 32.9, landed_cost: 9.3 },
      inventory: { available: 231 },
    },
  ];
  const channels = [{ issue: "Needs approval" }, { issue: "" }, { issue: "" }];
  const inventory = [{ status: "low_stock" }, { status: "healthy" }, { status: "stockout_risk" }];
  const metrics = computeMetrics(products, channels, inventory);
  assert.equal(metrics.product_count, 5);
  assert.equal(metrics.active_count, 4);
  assert.equal(metrics.needs_review_count, 2);
  assert.equal(metrics.low_stock_count, 2);
  assert.equal(metrics.channel_issue_count, 1);
  assert.equal(metrics.avg_margin_pct, 40.9);
});

test("assembleSnapshot: assembles the full snapshot, warns only when both products and review_items are empty", () => {
  const empty = assembleSnapshot({});
  assert.equal(empty.warnings.length, 1);
  assert.equal(empty.warnings[0].id, "no-snapshot");

  const withProducts = assembleSnapshot({
    products: [{ product_id: "p1", ref: 1, pricing: {}, inventory: {} }],
  });
  assert.equal(withProducts.warnings.length, 0);
  assert.equal(withProducts.metrics.product_count, 1);
});

test("assembleSnapshot: derives an activity log from product/review timestamps when none is supplied", () => {
  const snapshot = assembleSnapshot({
    products: [{ product_id: "p1", ref: 1, name: "Aurora Lamp", updated_at: "2026-07-07T07:52:00.000Z" }],
    review_items: [
      {
        item_id: "r1",
        ref: 1,
        product_id: "p1",
        title: "Approve launch",
        status: "approved",
        decision_note: "Looks good",
        decided_at: "2026-07-07T08:00:00.000Z",
      },
    ],
  });
  assert.equal(snapshot.activity_log.length, 2);
  assert.match(snapshot.activity_log[0].text, /Approved Approve launch: Looks good/);
});

test("buildConfigSummary: reads seller/platforms/warehouses/review-policy/sync off a raw Settings row", () => {
  const summary = buildConfigSummary({
    settings: {
      seller_brand: "Nimbus Home",
      seller_entity: "Nimbus Home Trading Co., Ltd.",
      base_currency: "USD",
      platforms: JSON.stringify([{ platform: "amazon", enabled: true, store_name: "Nimbus Home US" }]),
      warehouses: JSON.stringify([{ warehouse_id: "wh-sz", name: "Shenzhen 3PL", region: "CN-SZ" }]),
      review_policy: JSON.stringify({ margin_floor_pct: 32 }),
      sync: JSON.stringify({ sources: ["amazon"] }),
    },
  });
  assert.equal(summary.seller.brand, "Nimbus Home");
  assert.equal(summary.platforms[0].platform, "amazon");
  assert.equal(summary.warehouses[0].warehouse_id, "wh-sz");
  assert.equal(summary.review_policy.margin_floor_pct, 32);
  assert.deepEqual(summary.sync.sources, ["amazon"]);
});

// ---- Certificates: certStatusFor is the "derived, not stored" boundary ----
// (same shape as busa-expo-leads's slaStateFor test suite). NOW is chosen so
// NOW + 90 days lands exactly on a UTC midnight boundary: Jan has 31 days
// (-> Feb 1, 31 elapsed), Feb 2026 has 28 (-> Mar 1, 59 elapsed), Mar has 31
// (-> Apr 1, 90 elapsed).

const CERT_NOW = "2026-01-01T00:00:00.000Z";

test("certStatusFor: CERT_EXPIRING_SOON_DAYS is 90", () => {
  assert.equal(CERT_EXPIRING_SOON_DAYS, 90);
});

test("certStatusFor: just under the 90-day window is expiring_soon", () => {
  assert.equal(certStatusFor("2026-03-31T00:00:00.000Z", CERT_NOW), "expiring_soon");
});

test("certStatusFor: exactly at the 90-day boundary is still expiring_soon, not valid", () => {
  assert.equal(certStatusFor("2026-04-01T00:00:00.000Z", CERT_NOW), "expiring_soon");
});

test("certStatusFor: just over the 90-day boundary is valid", () => {
  assert.equal(certStatusFor("2026-04-02T00:00:00.000Z", CERT_NOW), "valid");
});

test("certStatusFor: long before the boundary is valid", () => {
  assert.equal(certStatusFor("2027-01-01T00:00:00.000Z", CERT_NOW), "valid");
});

test("certStatusFor: expiry exactly at now is expiring_soon (0 days remaining), not expired", () => {
  assert.equal(certStatusFor(CERT_NOW, CERT_NOW), "expiring_soon");
});

test("certStatusFor: just past expiry is expired", () => {
  assert.equal(certStatusFor("2025-12-31T23:59:00.000Z", CERT_NOW), "expired");
});

test("certStatusFor: long past expiry is expired", () => {
  assert.equal(certStatusFor("2020-01-01T00:00:00.000Z", CERT_NOW), "expired");
});

test("certStatusFor: missing or unparseable expiry is treated as expired (most urgent), never hidden as valid", () => {
  assert.equal(certStatusFor("", CERT_NOW), "expired");
  assert.equal(certStatusFor(undefined, CERT_NOW), "expired");
  assert.equal(certStatusFor("not-a-date", CERT_NOW), "expired");
});

test("normalizeCertificateRow/certificateToFields round trip preserves every field", () => {
  const item = {
    certificate_id: "rec123",
    product_id: "prod-aurora-lamp",
    cert_type: "CE",
    issuer: "TÜV Rheinland Shenzhen",
    cert_number: "CE-AL-2026-0142",
    issued_date: "2025-06-01",
    expiry_date: "2027-06-01",
    file: null,
    source_note: "spec-sheet.pdf p.2",
  };
  const fields = certificateToFields(item);
  const roundTripped = normalizeCertificateRow({ ...fields, __recordId: item.certificate_id });
  assert.deepEqual(roundTripped, { ...item, __headCommitId: undefined });
});

test("normalizeCertificateRow: relation field value may arrive as a bare id or a one-item array", () => {
  assert.equal(normalizeCertificateRow({ product: "rec-p1" }).product_id, "rec-p1");
  assert.equal(normalizeCertificateRow({ product: ["rec-p1"] }).product_id, "rec-p1");
  assert.equal(normalizeCertificateRow({ product: [] }).product_id, "");
  assert.equal(normalizeCertificateRow({}).product_id, "");
});

test("certificatesFor: filters certificates by product_id", () => {
  const certs = [
    { product_id: "p1", cert_type: "CE" },
    { product_id: "p2", cert_type: "FCC" },
  ];
  assert.equal(certificatesFor(certs, "p1").length, 1);
  assert.equal(certificatesFor(certs, "p1")[0].cert_type, "CE");
  assert.equal(certificatesFor(certs, "missing").length, 0);
});

test("sortCertificatesByUrgency: expired first, then expiring_soon, then valid, soonest-expiry first within each bucket", () => {
  const certs = [
    { certificate_id: "c-valid", product_id: "p1", expiry_date: "2027-01-01T00:00:00.000Z" },
    { certificate_id: "c-expired-old", product_id: "p1", expiry_date: "2020-01-01T00:00:00.000Z" },
    { certificate_id: "c-soon-later", product_id: "p1", expiry_date: "2026-03-31T00:00:00.000Z" },
    { certificate_id: "c-expired-recent", product_id: "p1", expiry_date: "2025-12-31T00:00:00.000Z" },
    { certificate_id: "c-soon-sooner", product_id: "p1", expiry_date: "2026-01-15T00:00:00.000Z" },
  ];
  const sorted = sortCertificatesByUrgency(certs, CERT_NOW);
  assert.deepEqual(
    sorted.map((item) => item.certificate_id),
    ["c-expired-old", "c-expired-recent", "c-soon-sooner", "c-soon-later", "c-valid"],
  );
  assert.deepEqual(
    sorted.map((item) => item.cert_status),
    ["expired", "expired", "expiring_soon", "expiring_soon", "valid"],
  );
});

test("computeMetrics: counts expiring_cert_count and expired_cert_count from certificates, independent of products/channels/inventory", () => {
  const certs = [
    { expiry_date: "2020-01-01T00:00:00.000Z" }, // expired
    { expiry_date: "2026-01-15T00:00:00.000Z" }, // expiring_soon
    { expiry_date: "2026-01-20T00:00:00.000Z" }, // expiring_soon
    { expiry_date: "2027-01-01T00:00:00.000Z" }, // valid
  ];
  const metrics = computeMetrics([], [], [], certs, CERT_NOW);
  assert.equal(metrics.expired_cert_count, 1);
  assert.equal(metrics.expiring_cert_count, 2);
});

test("assembleSnapshot: includes certificates sorted by urgency and annotated with cert_status", () => {
  const snapshot = assembleSnapshot({
    products: [{ product_id: "p1", ref: 1, pricing: {}, inventory: {} }],
    certificates: [
      { certificate_id: "c1", product_id: "p1", expiry_date: "2020-01-01T00:00:00.000Z" },
      { certificate_id: "c2", product_id: "p1", expiry_date: "2027-01-01T00:00:00.000Z" },
    ],
    now: CERT_NOW,
  });
  assert.equal(snapshot.certificates.length, 2);
  assert.equal(snapshot.certificates[0].certificate_id, "c1");
  assert.equal(snapshot.certificates[0].cert_status, "expired");
  assert.equal(snapshot.metrics.expired_cert_count, 1);
});

// ---- Review queue: the new `spec_claim` type is a value convention on the
// existing free-form `type` field, not a schema change -- it must round-trip
// and take decisions exactly like every pre-existing type. ----

test("spec_claim review items round-trip through reviewToFields/normalizeReviewRow like any other type", () => {
  const item = {
    item_id: "review-scale-un383-claim",
    ref: 4,
    product_id: "prod-scale",
    type: "spec_claim",
    status: "needs_review",
    title: "Cite the UN38.3 expiry before it reaches a quote",
    summary: "Sourced only from a supplier email, no document or page cited.",
    risk: "medium",
    recommendation: "request_changes",
    evidence: ["certificates.source-note reads only \"from supplier email\"."],
    decision_note: "",
    decided_at: "",
    execution_status: "",
    execution_detail: "",
    executed_at: "",
    created_at: "2026-07-07T08:20:00.000Z",
    updated_at: "2026-07-07T08:20:00.000Z",
  };
  assert.deepEqual(normalizeReviewRow(reviewToFields(item)), item);
});

test("spec_claim review items take the same three decision actions as every other type", () => {
  assert.equal(statusForVerdict("approve", "needs_review"), "approved");
  assert.equal(statusForVerdict("request_changes", "needs_review"), "changes_requested");
  assert.equal(statusForVerdict("block", "needs_review"), "blocked");
});

test("reviewFor: a spec_claim item is picked up by the same product join as every other review type", () => {
  const reviewItems = [
    { product_id: "p1", item_id: "r1", type: "publish_approval" },
    { product_id: "p1", item_id: "r2", type: "spec_claim" },
    { product_id: "p2", item_id: "r3", type: "spec_claim" },
  ];
  const forP1 = reviewFor(reviewItems, "p1");
  assert.equal(forP1.length, 2);
  assert.ok(forP1.some((item) => item.type === "spec_claim"));
});

// reviewExecution is exercised by scripts/execute_decisions.mjs, which has no
// test harness of its own (it is a trusted script, not browser code) -- this
// is the only place its operation-mapping logic is checked at all, so every
// type this queue carries needs its own case, not just the ones ported from
// the retired app.
test("reviewExecution: approving publish_approval maps to publish_channel", () => {
  const result = reviewExecution({ item_id: "r1", product_id: "p1", type: "publish_approval" }, { action: "approve" }, "Aurora Lamp");
  assert.equal(result.operation, "publish_channel");
  assert.equal(result.target, "p1");
});

test("reviewExecution: approving price_change maps to apply_price_change", () => {
  const result = reviewExecution({ item_id: "r1", product_id: "p1", type: "price_change" }, { action: "approve" }, "Aurora Lamp");
  assert.equal(result.operation, "apply_price_change");
});

test("reviewExecution: approving quality_hold lifts the hold unless the recommendation is block", () => {
  const lift = reviewExecution({ item_id: "r1", product_id: "p1", type: "quality_hold", recommendation: "lift" }, { action: "approve" }, "Aurora Lamp");
  assert.equal(lift.operation, "lift_quality_hold");
  const hold = reviewExecution({ item_id: "r1", product_id: "p1", type: "quality_hold", recommendation: "block" }, { action: "approve" }, "Aurora Lamp");
  assert.equal(hold.operation, "maintain_quality_hold");
});

test("reviewExecution: approving a spec_claim maps to verify_spec_claim, not the archive_product fallback", () => {
  const result = reviewExecution({ item_id: "r1", product_id: "p1", type: "spec_claim" }, { action: "approve" }, "Aurora Lamp");
  assert.equal(result.operation, "verify_spec_claim");
  assert.equal(result.target, "p1");
  assert.match(result.detail, /safe to include on a customer-facing quote/);
});

test("reviewExecution: approving an unrecognized type falls back to archive_product (lifecycle decisions)", () => {
  const result = reviewExecution({ item_id: "r1", product_id: "p1", type: "lifecycle" }, { action: "approve" }, "Aurora Lamp");
  assert.equal(result.operation, "archive_product");
});

test("reviewExecution: request_changes always maps to request_revision regardless of type", () => {
  const result = reviewExecution({ item_id: "r1", product_id: "p1", type: "spec_claim" }, { action: "request_changes" }, "Aurora Lamp");
  assert.equal(result.operation, "request_revision");
});

test("reviewExecution: block always maps to maintain_block regardless of type", () => {
  const result = reviewExecution({ item_id: "r1", product_id: "p1", type: "spec_claim" }, { action: "block" }, "Aurora Lamp");
  assert.equal(result.operation, "maintain_block");
  assert.equal(result.target, "p1");
});

test("reviewExecution: status reflects apply vs dry-run", () => {
  const dryRun = reviewExecution({ item_id: "r1", product_id: "p1", type: "spec_claim" }, { action: "approve" }, "Aurora Lamp");
  assert.equal(dryRun.status, "planned");
  const applied = reviewExecution({ item_id: "r1", product_id: "p1", type: "spec_claim" }, { action: "approve" }, "Aurora Lamp", { apply: true });
  assert.equal(applied.status, "ready_for_agent");
});
