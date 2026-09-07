#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../content/busa-wechat-crm-app/app/js/config.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const blueprint = {
  schema_version: appConfig.schemaVersion,
  app: {
    name: appConfig.appName,
    slug: appConfig.appId,
    airapp_slug: appConfig.airApp.slug,
    description: appConfig.description,
    locale: appConfig.locale,
    deployment: appConfig.deployment,
    space_id: appConfig.spaceId,
    read_only: appConfig.readOnly,
    brand: { mode: "inferred", accent: appConfig.brand.accent, logo_path: "" },
  },
  workspace: {
    folder: { ...appConfig.folder },
    bases: appConfig.bases.map((base) => ({
      key: base.key,
      name: base.name,
      slug: base.slug,
      read_limit: base.readLimit,
      description: base.description,
      fields: base.fields,
      seed_records: (base.sampleRecords || []).map((record) => record.fields),
    })),
    relations: Object.entries(appConfig.templateRelations).map(([source, target]) => ({ source, target })),
    docs: [],
    drives: [],
    whiteboards: [],
    forms: [],
    workflows: [],
    html: [],
  },
  onboarding: {
    version: appConfig.onboarding.version,
    required_fields: appConfig.onboarding.requiredFields.map((field) => ({
      key: field.key,
      resource: field.resource,
      validation: field.validation,
      unlocks: field.unlocks,
    })),
    completion_resource: appConfig.onboarding.completionResource,
    rationale: appConfig.onboarding.rationale,
  },
  ui: {
    primary_base: appConfig.ui.primaryBase,
    summary: appConfig.ui.summary,
    screens: appConfig.bases.map((base) => ({
      id: base.key,
      name: base.name,
      purpose: base.description,
      data_sources: [base.key],
    })),
    attention_states: ["needs-review", "blocked"],
    actions: [
      { id: "create-goal", label: "设置新目标", kind: "direct_write", base: "goals" },
      { id: "promote-person", label: "加入重点联系人", kind: "direct_write", base: "people" },
      {
        id: "decide-action",
        label: "审核下一步",
        kind: "direct_write",
        base: "actions",
        fields: ["status", "decision-comment", "decided-at", "decided-by"],
      },
    ],
  },
  permissions: {
    read_procedures: appConfig.permissions.readProcedures,
    setup_procedures: appConfig.permissions.setupProcedures,
    change_request_procedures: appConfig.permissions.writeProcedures,
  },
  vault_requirements: [],
  integrations: [
    {
      key: "wechat-me",
      name: "wechat-cli-rs",
      execution: "trusted_local_agent",
      purpose: "Read the operator's local WeChat data without modifying WeChat.",
      vault_refs: [],
    },
  ],
};

const contents = `${JSON.stringify(blueprint, null, 2)}\n`;
const targets = ["blueprint.json", "content/busa-wechat-crm-app/airapp-blueprint.json"];
const stale = [];
for (const relative of targets) {
  const target = path.join(root, relative);
  if (check) {
    const current = await readFile(target, "utf8")
      .then((value) => JSON.parse(value))
      .catch(() => null);
    if (JSON.stringify(current) !== JSON.stringify(blueprint)) stale.push(relative);
  } else {
    await writeFile(target, contents);
  }
}
if (stale.length) {
  console.error(`Blueprints are out of date:\n${stale.map((file) => `  ${file}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? "Blueprints are up to date." : "Blueprints regenerated from appConfig.");
