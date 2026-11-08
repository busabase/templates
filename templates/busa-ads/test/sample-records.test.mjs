import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeCampaign } from "../scripts/lib/ads-model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORMS = new Set(["amazon", "meta", "tiktok", "google"]);
const STATUSES = new Set(["active", "paused", "rejected"]);
const DAY_KEYS = ["date", "spend", "impressions", "clicks", "conversions", "revenue"];

test("Campaigns sample records match the ads schema", async () => {
  const text = await readFile(path.join(root, "content/campaigns/records.ndjson"), "utf8");
  const rows = text.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows.length, 3);
  for (const row of rows) {
    const fields = row.fields;
    const campaign = normalizeCampaign({
      campaign_id: fields["campaign-id"],
      platform: fields.platform,
      name: fields.name,
      product: fields.product,
      sku: fields.sku,
      status: fields.status,
      daily_budget: fields["daily-budget"],
      budget_spent_today_pct: fields["budget-spent-today-pct"],
      acos_target_pct: fields["acos-target-pct"],
      currency: fields.currency,
      daily: fields.daily,
      targets: fields.targets,
      last_sync_at: fields["last-sync-at"],
    });
    assert.equal(fields["campaign-id"], campaign.campaign_id);
    assert.ok(PLATFORMS.has(campaign.platform), campaign.platform);
    assert.ok(STATUSES.has(campaign.status), campaign.status);
    assert.ok(campaign.daily.length > 0);
    assert.ok(campaign.targets.length > 0);
    for (const day of campaign.daily) {
      for (const key of DAY_KEYS) assert.ok(day[key] !== undefined, key);
      assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
      for (const key of DAY_KEYS.slice(1)) assert.equal(typeof day[key], "number", key);
    }
    for (const target of campaign.targets) {
      assert.equal(typeof target.target_id, "string");
      assert.equal(typeof target.type, "string");
      assert.equal(typeof target.text, "string");
    }
    assert.doesNotMatch(fields.platform, /sample|needs_review|approved/i);
    assert.doesNotMatch(fields.daily, /Needs review|Approved sample|Completed sample/);
    assert.doesNotMatch(fields.targets, /Needs review|Approved sample|Completed sample/);
  }
});
