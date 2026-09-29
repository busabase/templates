import { readFile, writeFile, mkdir } from "node:fs/promises";
import { appConfig } from "../content/busa-office-recruiting-app/app/js/config.js";
import { seedRecords } from "../content/busa-office-recruiting-app/app/js/demo-data.js";
const check = process.argv.includes("--check");
const emit = async (p, c) => {
  if (check) {
    if ((await readFile(p, "utf8")) !== c) throw new Error("Out of date: " + p);
  } else {
    await mkdir(p.slice(0, p.lastIndexOf("/")), { recursive: true });
    await writeFile(p, c);
  }
};
const json = (x) => JSON.stringify(x, null, 2) + "\n";
await emit("content/_folder.json", json(appConfig.folder));
for (const [i, b] of appConfig.bases.entries()) {
  await emit(
    "content/" + b.key + "/base.json",
    json({
      name: b.name,
      description: b.description,
      position: i,
      agentPrompts: b.agentPrompts,
      fields: b.fields.map((f, p) => ({
        slug: f.slug,
        name: f.name,
        type: f.type,
        required: f.required,
        position: p,
        options: f.options,
      })),
      views: b.views,
    }),
  );
  await emit(
    "content/" + b.key + "/records.ndjson",
    seedRecords[b.key].map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
}
console.log(
  check ? "Content and seeds are current" : "Content and seeds generated",
);
