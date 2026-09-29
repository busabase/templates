import { writeFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
const root = process.cwd(),
  manifest = JSON.parse(await readFile("busabase.json", "utf8"));
const { appConfig } = await import(
  pathToFileURL(
    path.join(root, "content", manifest.template.airapp, "app/js/config.js"),
  )
);
const { samples } = await import(
  pathToFileURL(
    path.join(root, "content", manifest.template.airapp, "app/js/samples.js"),
  )
);
const check = process.argv.includes("--check");
let errors = 0;
for (const [position, b] of appConfig.bases.entries()) {
  const base = {
    ...b,
    position,
    fields: b.fields.map((f) => ({
      ...f,
      options:
        f.type === "relation"
          ? {
              ...f.options,
              targetBaseSlug: appConfig.bases.find(
                (s) => s.slug === f.options.targetBaseSlug,
              )?.key,
            }
          : f.options,
    })),
  };
  for (const [file, content] of [
    ["base.json", JSON.stringify(base, null, 2) + "\n"],
    [
      "records.ndjson",
      samples[b.key].map((r) => JSON.stringify(r)).join("\n") + "\n",
    ],
  ]) {
    const target = "content/" + b.key + "/" + file;
    if (check) {
      if ((await readFile(target, "utf8")) !== content) {
        console.error("Schema/sample drift: " + target);
        errors++;
      }
    } else await writeFile(target, content);
  }
}
if (errors) process.exit(1);
console.log(check ? "Content parity passed." : "Content regenerated.");
