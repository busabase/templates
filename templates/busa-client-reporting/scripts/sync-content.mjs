#!/usr/bin/env node
/**
 * Regenerate `content/` from the app's own declaration, or check it is current.
 *
 * The app declaration is canonical. Package Base and node sidecars are derived
 * from it so template installs and self-provisioning cannot drift.
 *
 *   node scripts/sync-content.mjs
 *   node scripts/sync-content.mjs --check
 *
 * Follows the busa-campaigns pattern (fields + `templateRelations`), extended
 * the way busa-cms / busa-rnd extend it: each Base's native Views and per-node
 * `agentPrompts` are also declared in `config.js` and carried through, because
 * this template ships real table views and scenario prompts per Base — emitting
 * `views: []` would silently drop them on every regeneration.
 *
 * Relation handling (template-format.md, "When the app declares its own
 * tables"): the app config declares relations with the prefixed Base slug
 * (`busa-client-reporting-clients`); `appConfig.templateRelations` names the
 * package-side target — the target Base's `content/` directory name — and this
 * script writes that into `base.json`. A relation with no target on either
 * side is refused: it would install as a field that links to nothing.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const { appConfig } = await import(path.join(root, "content/busa-client-reporting-app/app/js/config.js"));

const stale = [];

const emit = async (relativePath, contents) => {
  const target = path.join(root, relativePath);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    if (current !== contents) stale.push(relativePath);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const keyBySlug = new Map((appConfig.bases ?? []).map((base) => [base.slug, base.key]));

let position = 0;
for (const base of appConfig.bases) {
  await emit(
    `content/${base.key}/base.json`,
    json({
      name: base.name,
      description: base.description ?? "",
      position: position++,
      ...(base.agentPrompts?.length ? { agentPrompts: base.agentPrompts } : {}),
      fields: (base.fields ?? []).map((field, index) => {
        const options = { ...(field.options ?? {}) };
        if (field.type === "relation") {
          const declared = appConfig.templateRelations?.[`${base.key}.${field.slug}`] ?? options.targetBaseSlug;
          const targetKey = appConfig.templateRelations?.[`${base.key}.${field.slug}`]
            ? declared
            : keyBySlug.get(declared);
          if (!targetKey) {
            console.error(
              `content/${base.key}: relation "${field.slug}" has no resolvable target (declared: ${declared ?? "none"}). ` +
                "Declare it in appConfig.templateRelations or with a prefixed targetBaseSlug in config.js.",
            );
            process.exit(1);
          }
          options.targetBaseSlug = targetKey;
        }
        return {
          slug: field.slug,
          name: field.name,
          type: field.type,
          required: Boolean(field.required),
          position: index,
          options,
        };
      }),
      views: (base.views ?? []).map((view) => ({
        slug: view.slug,
        name: view.name,
        type: view.type,
        config: view.config,
      })),
    }),
  );
}

if (appConfig.drive) {
  await emit(
    `content/${appConfig.airApp.slug.replace(/-app$/, "")}-files/_node.json`,
    json({
      type: "drive",
      name: appConfig.drive.name,
      description: appConfig.drive.description ?? "",
      position: position++,
    }),
  );
}

await emit(
  "content/_folder.json",
  json({
    name: appConfig.folder.name,
    description: appConfig.folder.description ?? "",
    ...(appConfig.folderPrompts?.length ? { agentPrompts: appConfig.folderPrompts } : {}),
  }),
);

await emit(
  `content/${appConfig.airApp.slug}/_node.json`,
  json({
    type: "airapp",
    name: appConfig.airApp.name,
    description: appConfig.folder.description ?? "",
    ...(appConfig.airAppPrompts?.length ? { agentPrompts: appConfig.airAppPrompts } : {}),
  }),
);

if (check && stale.length > 0) {
  console.error(
    `content/ is out of date with config.js:\n${stale.map((item) => `  ${item}`).join("\n")}\n\nRun: node scripts/sync-content.mjs`,
  );
  process.exit(1);
}
console.log(check ? "content/ is up to date." : "content/ regenerated from config.js.");
