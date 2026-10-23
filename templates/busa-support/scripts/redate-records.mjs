#!/usr/bin/env node
/**
 * Move the starter records forward in time, keeping their story intact.
 *
 * The desk is installed as plain records with fixed timestamps, but the live app judges
 * SLA breach and "tickets this week" against the real clock, so the rows describe one
 * day and slowly stop matching it. This shifts EVERY ISO timestamp in the six
 * `content/<base>/records.ndjson` files by the same whole number of days, so gaps,
 * due times and time of day all stay as written.
 *
 * "Story day" is the date of the latest sync-log run: the day the desk was last looked at.
 *
 *   node scripts/redate-records.mjs                    # print the story day, change nothing
 *   node scripts/redate-records.mjs --to 2026-12-01    # make 2026-12-01 the story day
 *   node scripts/redate-records.mjs --days 14          # or shift by a number of days
 *
 * Run it before publishing a release, then `node --test` in content/busa-support-app: the
 * records test checks the picture at the story day (which tickets breach, which are held).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASES = ["accounts", "tickets", "messages", "knowledge-base", "sync-log", "settings"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DAY = 86_400_000;

const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};

const files = new Map();
for (const base of BASES) {
  const file = path.join(root, "content", base, "records.ndjson");
  files.set(
    file,
    (await readFile(file, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)),
  );
}

const syncRows = files.get(path.join(root, "content", "sync-log", "records.ndjson"));
const storyNow = syncRows.map((row) => row.fields.at).sort().at(-1);
const storyDay = Date.parse(`${storyNow.slice(0, 10)}T00:00:00.000Z`);

let days;
if (arg("--days") !== undefined) days = Number(arg("--days"));
else if (arg("--to") !== undefined) {
  const target = Date.parse(`${arg("--to")}T00:00:00.000Z`);
  if (Number.isNaN(target)) throw new Error("--to takes a date like 2026-12-01");
  days = Math.round((target - storyDay) / DAY);
} else {
  console.log(`Story day is ${storyNow.slice(0, 10)} (latest sync-log run ${storyNow}). Pass --to YYYY-MM-DD or --days N to move it.`);
  process.exit(0);
}
if (!Number.isInteger(days)) throw new Error("--days takes a whole number");

const shift = (value) => (typeof value === "string" && ISO.test(value) ? new Date(Date.parse(value) + days * DAY).toISOString() : value);

let moved = 0;
for (const [file, rows] of files) {
  for (const row of rows) {
    for (const [slug, value] of Object.entries(row.fields)) {
      const next = shift(value);
      if (next !== value) {
        row.fields[slug] = next;
        moved += 1;
      }
    }
  }
  await writeFile(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}
console.log(`Shifted ${moved} timestamps by ${days} day(s). Story day is now ${new Date(storyDay + days * DAY).toISOString().slice(0, 10)}.`);
