import assert from "node:assert/strict";
import test from "node:test";
import { appConfig } from "../app/js/config.js";

test("declares a portable resource map", () => {
  assert.equal(appConfig.appId, "busa-wechat-crm");
  assert.equal(appConfig.airApp.resourceKey, "busa-wechat-crm-app");
  assert.deepEqual(
    appConfig.bases.map((base) => base.key),
    ["people", "goals", "relationship-snapshots", "actions", "worklog", "settings"],
  );
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `${appConfig.appId}-${base.key}`);
    assert.equal("nodeId" in base, false);
    assert.equal("baseId" in base, false);
    assert.ok(base.readLimit >= 1 && base.readLimit <= 50);
  }
});

test("ships a bounded deterministic relationship strategy scenario", () => {
  /** @type {string[]} */
  const recordKeys = [];
  for (const base of appConfig.bases) {
    for (const record of base.sampleRecords || []) recordKeys.push(record.key);
  }
  assert.equal(recordKeys.length, 45);
  assert.equal(new Set(recordKeys).size, recordKeys.length);
  assert.equal(appConfig.onboarding.version, 4);
  assert.equal(appConfig.onboarding.completionResource, "settings");
  assert.deepEqual(appConfig.onboarding.requiredFields, []);
  assert.ok(appConfig.onboarding.rationale.length > 0);
});

test("keeps relation identities aligned across runtime and package formats", () => {
  for (const [source, target] of Object.entries(appConfig.templateRelations)) {
    const [baseKey, fieldSlug] = source.split(".");
    const base = appConfig.bases.find((item) => item.key === baseKey);
    const field = base.fields.find((item) => item.slug === fieldSlug);
    assert.equal(field.options.targetBaseSlug, `${appConfig.appId}-${target}`, source);
  }
});
