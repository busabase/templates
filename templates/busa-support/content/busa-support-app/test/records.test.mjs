import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appConfig } from "../app/js/config.js";
import {
  CATEGORIES,
  CHANNELS,
  CONNECTORS,
  PRIORITIES,
  PROPOSED_ACTIONS,
  TICKET_STATUSES,
  buildSnapshot,
  normalizeKbArticle,
  normalizeTicket,
  refreshTicketDerived,
  runQualityGate,
} from "../app/js/support-model.js";

// The starter rows a fresh install carries. They are installed as plain records, so
// nothing but this file stops a typo'd field slug or a dangling reference from
// shipping: install accepts unknown slugs silently and the desk just renders blanks.
const read = (base) =>
  readFileSync(new URL(`../../${base}/records.ndjson`, import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const rows = Object.fromEntries(appConfig.bases.map((base) => [base.key, read(base.key)]));
const fieldsOf = (base) => rows[base].map((row) => row.fields);
// Provider convention: kebab-case slugs become snake_case keys.
const snake = (fields) => Object.fromEntries(Object.entries(fields).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const snakeRows = (base) => fieldsOf(base).map(snake);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test("every Base ships rows, within the 50-row ceiling, with unique package keys", () => {
  const seen = new Set();
  for (const base of appConfig.bases) {
    assert.ok(rows[base.key].length > 0, `${base.key} has no rows`);
    assert.ok(rows[base.key].length <= 50, `${base.key} has more than 50 rows`);
    for (const row of rows[base.key]) {
      assert.ok(row.key && !seen.has(row.key), `duplicate or empty key ${row.key}`);
      seen.add(row.key);
    }
  }
});

test("every row matches its Base declaration: known slugs, required filled, numbers are numbers", () => {
  for (const base of appConfig.bases) {
    const declared = new Map(base.fields.map((field) => [field.slug, field]));
    for (const { key, fields } of rows[base.key]) {
      for (const [slug, value] of Object.entries(fields)) {
        const field = declared.get(slug);
        assert.ok(field, `${key}: "${slug}" is not a declared field of ${base.key}`);
        if (field.type === "number") assert.equal(typeof value, "number", `${key}.${slug} must be a number`);
        else assert.equal(typeof value, "string", `${key}.${slug} must be a string`);
      }
      for (const field of base.fields.filter((item) => item.required)) {
        assert.ok(fields[field.slug], `${key}: required ${field.slug} is empty`);
      }
    }
  }
});

test("references resolve: accounts, tickets, messages and the knowledge base agree", () => {
  const accounts = new Set(snakeRows("accounts").map((row) => row.account_id));
  const tickets = new Set(snakeRows("tickets").map((row) => row.ticket_id));
  const articles = new Set(snakeRows("knowledge-base").map((row) => row.article_id));
  for (const ticket of snakeRows("tickets")) {
    assert.ok(accounts.has(ticket.account_id), `${ticket.ticket_id}: unknown account ${ticket.account_id}`);
    for (const ref of JSON.parse(ticket.kb_refs)) assert.ok(articles.has(ref), `${ticket.ticket_id}: kb ref ${ref} does not exist`);
  }
  for (const message of snakeRows("messages")) assert.ok(tickets.has(message.ticket_id), `${message.message_id}: unknown ticket ${message.ticket_id}`);
  for (const entry of snakeRows("sync-log")) assert.ok(accounts.has(entry.account_id), `${entry.sync_id}: unknown account`);
  for (const ticket of tickets) assert.ok(snakeRows("messages").some((message) => message.ticket_id === ticket), `${ticket} has no conversation`);
  for (const article of snakeRows("knowledge-base")) assert.ok(Array.isArray(JSON.parse(article.tags)), `${article.article_id}: tags must be a JSON array`);
});

test("enumerated values stay inside the vocabularies the app understands", () => {
  for (const ticket of snakeRows("tickets")) {
    assert.ok(TICKET_STATUSES.includes(ticket.status), `${ticket.ticket_id}: status ${ticket.status}`);
    assert.ok(CATEGORIES.includes(ticket.category), `${ticket.ticket_id}: category ${ticket.category}`);
    assert.ok(PRIORITIES.includes(ticket.priority), `${ticket.ticket_id}: priority ${ticket.priority}`);
    assert.ok(PROPOSED_ACTIONS.includes(ticket.proposed_action), `${ticket.ticket_id}: action ${ticket.proposed_action}`);
    assert.ok(CHANNELS.includes(ticket.channel), `${ticket.ticket_id}: channel ${ticket.channel}`);
    assert.ok(["true", "false"].includes(ticket.unread), `${ticket.ticket_id}: unread must be "true"/"false"`);
    if (ticket.csat_score !== undefined) assert.ok(ticket.csat_score >= 1 && ticket.csat_score <= 5, `${ticket.ticket_id}: CSAT is 1-5`);
  }
  for (const account of snakeRows("accounts")) assert.ok(CONNECTORS.includes(account.connector), `${account.account_id}: connector`);
  for (const message of snakeRows("messages")) assert.ok(["incoming", "outgoing"].includes(message.direction), `${message.message_id}: direction`);
});

test("every timestamp is a full ISO instant, and each ticket's own timeline is ordered", () => {
  for (const base of appConfig.bases) {
    for (const { key, fields } of rows[base.key]) {
      for (const slug of Object.keys(fields).filter((item) => /(-at|-due-by|^at)$/.test(item))) {
        assert.match(fields[slug], ISO, `${key}.${slug}`);
      }
    }
  }
  const messages = snakeRows("messages");
  for (const ticket of snakeRows("tickets")) {
    for (const message of messages.filter((item) => item.ticket_id === ticket.ticket_id)) {
      assert.ok(message.sent_at >= ticket.created_at, `${message.message_id} predates its ticket`);
    }
    if (ticket.decided_at) assert.ok(ticket.decided_at >= ticket.created_at, `${ticket.ticket_id}: decided before created`);
    if (ticket.executed_at) assert.ok(ticket.executed_at >= ticket.decided_at, `${ticket.ticket_id}: executed before decided`);
  }
});

test("settings is the single config row and its JSON parses", () => {
  const [config, ...extra] = snakeRows("settings");
  assert.equal(extra.length, 0);
  assert.equal(config.record_id, "config");
  for (const key of ["sla_policy", "risk_policy", "reply_style"]) assert.equal(typeof JSON.parse(config[key]), "object");
  assert.equal(JSON.parse(config.risk_policy).refund_requires_approval, true);
});

test("nothing on screen announces itself as a mock, and no address can route", () => {
  const text = JSON.stringify(rows);
  assert.doesNotMatch(text, /demo|sample|示例|演示|Local Producer/i);
  for (const email of text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []) {
    assert.match(email, /\.example$/, `${email} is not on the reserved .example TLD`);
  }
});

// "Story time" is the desk's last collection run: the moment the rows were written to
// describe. The clock-dependent parts of the live app (SLA breach, "this week") read the
// real clock, so this pins the intended picture at that moment. Re-dating the rows
// (scripts/redate-records.mjs) shifts every timestamp together and keeps this true.
const storyNow = snakeRows("sync-log")
  .map((entry) => entry.at)
  .sort()
  .at(-1);

const snapshotAt = (reference) => {
  const kb = snakeRows("knowledge-base").map(normalizeKbArticle);
  const risk = JSON.parse(snakeRows("settings")[0].risk_policy);
  const messages = snakeRows("messages");
  return snakeRows("tickets")
    .map(normalizeTicket)
    .map((ticket) => {
      ticket.messages = messages
        .filter((item) => item.ticket_id === ticket.ticket_id)
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      refreshTicketDerived(ticket, reference);
      ticket.quality_gate = runQualityGate(ticket, kb, risk);
      return ticket;
    });
};

test("at story time the desk reads as intended: a few breaching, most not, one refund held by the gate", () => {
  const tickets = snapshotAt(storyNow);
  const breaching = tickets.filter((ticket) => ticket.sla.breached).map((ticket) => ticket.ticket_id);
  assert.deepEqual(breaching.sort(), ["tk-fischer-export", "tk-liu-invoice", "tk-park-sync"]);
  const open = tickets.filter((ticket) => !["done", "blocked"].includes(ticket.status));
  assert.ok(breaching.length < open.length / 2, "most open tickets must not be breaching");

  const featured = tickets.find((ticket) => ticket.ticket_id === "tk-ochoa-refund");
  assert.equal(featured.quality_gate.verdict, "block");
  assert.equal(featured.status, "needs_review");
  assert.equal(featured.execution.amount, 120);
  assert.deepEqual(tickets.filter((ticket) => ticket.quality_gate.verdict === "block").map((ticket) => ticket.ticket_id), ["tk-ochoa-refund"]);
  assert.ok(tickets.some((ticket) => ticket.quality_gate.verdict === "fix"), "the gate's FIX verdict is shown somewhere");
  for (const ticket of tickets.filter((item) => item.status === "done")) {
    assert.equal(ticket.quality_gate.verdict, "ship", `${ticket.ticket_id} was sent, so it cannot carry a gate warning`);
  }
});

test("the live snapshot builder accepts the rows as written", () => {
  const snapshot = buildSnapshot({
    accounts: snakeRows("accounts"),
    tickets: snakeRows("tickets"),
    messages: snakeRows("messages"),
    knowledge_base: snakeRows("knowledge-base"),
    sync_log: snakeRows("sync-log"),
    risk_policy: JSON.parse(snakeRows("settings")[0].risk_policy),
  });
  assert.equal(snapshot.metrics.ticket_count, 14);
  assert.equal(snapshot.metrics.csat_responses, 3);
  assert.equal(snapshot.metrics.first_response_median_minutes, 15);
  assert.equal(snapshot.metrics.status_counts.done, 3);
  assert.equal(snapshot.metrics.status_counts.blocked, 1);
  assert.equal(snapshot.accounts.reduce((sum, account) => sum + account.ticket_count, 0), 14);
});
