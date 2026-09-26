import assert from "node:assert/strict";
import test from "node:test";
import { demoRows } from "../app/js/providers/demo-data.js";
import {
  agentTotals,
  attentionList,
  changePct,
  choiceIds,
  decideProposal,
  decisionFields,
  evaluateProposal,
  exceptionQueue,
  filterOrders,
  isBelowFloor,
  isPaidBelowListed,
  normalizeException,
  normalizeGuardrail,
  normalizeOrder,
  normalizeProposal,
  normalizeSettings,
  orderFlags,
  orderRevenue,
  orderWindows,
  relationId,
  resolveException,
  reviewQueue,
  statedBreachKinds,
} from "../app/js/orders-model.js";

const o = (id, fields = {}) =>
  normalizeOrder({
    __recordId: id,
    "order-no": `#${id}`,
    agent: "chatgpt",
    sku: "SKU-1",
    quantity: 1,
    "paid-price": 100,
    "listed-price": 100,
    "ordered-on": "2026-09-24",
    status: "paid",
    ...fields,
  });
const g = (sku, fields = {}) =>
  normalizeGuardrail({ __recordId: `g-${sku}`, sku, "floor-price": 90, "ceiling-price": 120, "max-change-pct": 10, ...fields });
const p = (id, fields = {}) =>
  normalizeProposal({
    __recordId: id,
    title: `Proposal ${id}`,
    sku: "SKU-1",
    "current-price": 100,
    "proposed-price": 105,
    status: "proposed",
    ...fields,
  });
const x = (id, fields = {}) =>
  normalizeException({ __recordId: id, title: `Exception ${id}`, type: "channel-mismatch", "detected-on": "2026-09-24", status: "open", ...fields });

test("normalizers coerce the API's value shapes", () => {
  assert.equal(relationId(["recabc"]), "recabc");
  assert.equal(relationId({ id: "recabc" }), "recabc");
  assert.deepEqual(choiceIds('["chatgpt","gemini"]'), ["chatgpt", "gemini"]);
  const order = o("1", { agent: { id: "gemini", name: "Gemini" }, quantity: "3", "paid-price": "19.5", "ordered-on": "2026-09-24T00:00:00.000Z" });
  assert.equal(order.agent, "gemini");
  assert.equal(order.quantity, 3);
  assert.equal(order.paid_price, 19.5);
  assert.equal(order.ordered_on, "2026-09-24");
  assert.equal(normalizeOrder({}).quantity, 0);
  assert.equal(normalizeOrder({}).listed_price, null);
  assert.equal(normalizeGuardrail({ "same-price-everywhere": "true" }).same_price_everywhere, true);
  assert.equal(normalizeGuardrail({}).same_price_everywhere, false);
  assert.equal(normalizeException({ order: ["record1"] }).order, "record1");
  assert.equal(normalizeSettings(null), null);
  assert.deepEqual(normalizeSettings({ "agent-channels": '["meta-muse"]' }).agent_channels, ["meta-muse"]);
});

test("revenue is quantity × unit price paid, summed without float drift", () => {
  assert.equal(orderRevenue(o("1", { quantity: 3, "paid-price": 0.1 })), 0.3);
  assert.equal(orderRevenue(o("1", { "paid-price": null })), 0);
});

test("windows anchor on the latest ordered-on in the data, not the wall clock", () => {
  const windows = orderWindows([o("a", { "ordered-on": "2026-03-01" }), o("b", { "ordered-on": "2026-02-20" })]);
  assert.equal(windows.latest, "2026-03-01");
  assert.deepEqual(windows.current, { from: "2026-02-23", to: "2026-03-01" });
  assert.deepEqual(windows.previous, { from: "2026-02-16", to: "2026-02-22" });
  assert.deepEqual(orderWindows([]), { latest: "", current: null, previous: null });
});

test("agent totals: orders, units, revenue per agent for this 7 days vs the 7 before", () => {
  const orders = [
    o("1", { agent: "chatgpt", quantity: 2, "paid-price": 50, "ordered-on": "2026-09-24" }),
    o("2", { agent: "chatgpt", quantity: 1, "paid-price": 30, "ordered-on": "2026-09-18" }), // first day of current window
    o("3", { agent: "chatgpt", quantity: 1, "paid-price": 40, "ordered-on": "2026-09-17" }), // last day of previous
    o("4", { agent: "gemini", quantity: 1, "paid-price": 70, "ordered-on": "2026-09-11" }), // first day of previous
    o("5", { agent: "gemini", quantity: 9, "paid-price": 999, "ordered-on": "2026-09-10" }), // outside both
    o("6", { agent: "perplexity", quantity: 1, "paid-price": 10, "ordered-on": "2026-09-20" }), // not in settings
  ];
  const result = agentTotals({ orders, settings: { agent_channels: ["gemini", "chatgpt"] } });
  assert.deepEqual(
    result.agents.map((row) => row.agent),
    ["gemini", "chatgpt", "perplexity"],
    "settings order first, then unconfigured agents seen in data",
  );
  const chatgpt = result.agents.find((row) => row.agent === "chatgpt");
  assert.deepEqual(chatgpt.current, { orders: 2, units: 3, revenue: 130 });
  assert.deepEqual(chatgpt.previous, { orders: 1, units: 1, revenue: 40 });
  assert.equal(chatgpt.delta.orders, 1);
  assert.equal(chatgpt.delta.revenue, 90);
  assert.equal(chatgpt.delta.revenue_pct, 90 / 40);
  const gemini = result.agents.find((row) => row.agent === "gemini");
  assert.deepEqual(gemini.current, { orders: 0, units: 0, revenue: 0 });
  assert.deepEqual(gemini.previous, { orders: 1, units: 1, revenue: 70 });
  assert.equal(result.total.current.revenue, 140);
  assert.equal(result.total.previous.revenue, 110);
  assert.equal(result.agents.find((row) => row.agent === "perplexity").delta.revenue_pct, null, "no previous revenue → no %");
});

test("paid-below-listed and below-floor detection", () => {
  const guardrails = [g("SKU-1", { "floor-price": 90 })];
  assert.equal(isPaidBelowListed(o("1", { "paid-price": 95, "listed-price": 100 })), true);
  assert.equal(isPaidBelowListed(o("1", { "paid-price": 100, "listed-price": 100 })), false);
  assert.equal(isPaidBelowListed(o("1", { "listed-price": null })), false, "no listed price never flags");
  assert.equal(isBelowFloor(o("1", { "paid-price": 89 }), guardrails), true);
  assert.equal(isBelowFloor(o("1", { "paid-price": 90 }), guardrails), false, "at the floor is not below it");
  assert.equal(isBelowFloor(o("1", { sku: "OTHER", "paid-price": 1 }), guardrails), false, "no guardrail → not flagged");
  const flags = orderFlags(o("1", { quantity: 2, "paid-price": 179, "listed-price": 189 }), guardrails);
  assert.deepEqual(flags, { below_listed: true, below_floor: false, shortfall: 20 });
});

test("guardrail evaluation computes floor, ceiling and step, and compares with the stated text", () => {
  const guardrails = [g("SKU-1", { "floor-price": 169, "ceiling-price": 219, "max-change-pct": 8, "same-price-everywhere": true })];
  const breach = evaluateProposal(
    p("a", { "current-price": 189, "proposed-price": 164, breaches: "Below floor ($169). Change -13.2% exceeds the 8% step limit." }),
    guardrails,
  );
  assert.deepEqual(breach.computed.map((item) => item.kind), ["floor", "step"]);
  assert.ok(Math.abs(breach.change_pct - -13.227) < 0.01);
  assert.deepEqual(breach.stated.kinds, ["floor", "step"]);
  assert.deepEqual(breach.mismatch, []);
  assert.equal(breach.same_price_rule, true);
  assert.equal(breach.breaches, true);

  const ceiling = evaluateProposal(p("b", { "current-price": 210, "proposed-price": 225, breaches: "" }), guardrails);
  assert.deepEqual(ceiling.computed.map((item) => item.kind), ["ceiling"]);
  assert.deepEqual(ceiling.mismatch, ["ceiling"], "a computed breach the agent did not state is a mismatch");

  const overstated = evaluateProposal(p("c", { "current-price": 189, "proposed-price": 190, breaches: "Below floor" }), guardrails);
  assert.deepEqual(overstated.computed, []);
  assert.deepEqual(overstated.mismatch, ["floor"], "a stated breach that does not compute is a mismatch");

  const exact = evaluateProposal(p("d", { "current-price": 100, "proposed-price": 108 }), [g("SKU-1", { "max-change-pct": 8, "floor-price": 1, "ceiling-price": 999 })]);
  assert.deepEqual(exact.computed, [], "exactly at the step limit is allowed");

  const channel = evaluateProposal(p("e", { breaches: "Channel price would differ from Amazon ($64)." }), [g("SKU-1")]);
  assert.deepEqual(channel.stated.kinds, ["same-price"]);
  assert.equal(channel.same_price_noted, true);
  assert.deepEqual(channel.mismatch, [], "the same-price rule is noted, never computed, so never a mismatch");
  assert.equal(channel.breaches, true);

  const missing = evaluateProposal(p("f", { sku: "NONE", breaches: "" }), guardrails);
  assert.equal(missing.guardrail, null);
  assert.deepEqual(missing.computed, []);
  assert.equal(missing.breaches, false);
  assert.equal(changePct(p("g", { "current-price": 0 })), null);
  assert.deepEqual(statedBreachKinds(""), []);
});

test("attention: breaching proposed proposals, open exceptions with impact, uncovered below-listed orders", () => {
  const guardrails = [g("SKU-1", { "floor-price": 90 })];
  const orders = [
    o("covered", { "paid-price": 95, "listed-price": 100 }),
    o("uncovered", { "paid-price": 95, "listed-price": 100 }),
    o("fine"),
  ];
  const proposals = [
    p("breach", { "proposed-price": 80 }),
    p("decided", { "proposed-price": 80, status: "blocked" }),
    p("clean", { "proposed-price": 101 }),
  ];
  const exceptions = [x("1", { order: "covered", impact: -10 }), x("2", { impact: -20.5 }), x("3", { status: "resolved", impact: -99 })];
  const result = attentionList({ orders, guardrails, proposals, exceptions });
  assert.deepEqual(result.breaching.map((item) => item.proposal.id), ["breach"]);
  assert.deepEqual(result.open.map((row) => row.id), ["1", "2"]);
  assert.equal(result.impact, -30.5);
  assert.deepEqual(result.uncovered.map((row) => row.id), ["uncovered"]);
  assert.equal(result.count, 4);
});

test("decisions change only status and the note; notes required where the rule says", () => {
  assert.deepEqual(decideProposal(p("1"), "approve"), { status: "approved", "decision-note": "" });
  assert.deepEqual(decideProposal(p("1", { status: "changes-requested" }), "block", " too low "), {
    status: "blocked",
    "decision-note": "too low",
  });
  assert.throws(() => decideProposal(p("1"), "request-changes", "  "), /NOTE_REQUIRED/);
  assert.throws(() => decideProposal(p("1"), "block", ""), /NOTE_REQUIRED/);
  assert.throws(() => decideProposal(p("1", { status: "applied" }), "approve"), /only proposed/);
  assert.throws(() => decideProposal(p("1"), "merge"), /Unsupported/);

  assert.deepEqual(resolveException(x("1"), "resolve", "Refunded $10"), { status: "resolved", resolution: "Refunded $10" });
  assert.deepEqual(resolveException(x("1"), "accept", "Promo was valid"), { status: "accepted", resolution: "Promo was valid" });
  assert.throws(() => resolveException(x("1"), "accept", ""), /NOTE_REQUIRED/);
  assert.throws(() => resolveException(x("1", { status: "resolved" }), "resolve", "x"), /only open/);
  assert.throws(() => decisionFields("orders", o("1"), "approve", ""), /No decisions/);
  assert.deepEqual(Object.keys(decisionFields("exceptions", x("1"), "resolve", "done")).sort(), ["resolution", "status"]);
  assert.deepEqual(Object.keys(decisionFields("proposals", p("1"), "approve", "")).sort(), ["decision-note", "status"]);
});

test("lists: review queue, order filter on loaded rows, exception queue", () => {
  const queue = reviewQueue(
    [p("z", { status: "applied" }), p("b", { "proposed-price": 101 }), p("a", { "proposed-price": 50 }), p("c", { status: "changes-requested" })],
    [g("SKU-1")],
  );
  assert.deepEqual(queue.map((row) => row.id), ["a", "b", "c", "z"], "proposed first, breaching first within");
  const orders = [o("1", { agent: "gemini", "ordered-on": "2026-09-20" }), o("2", { "paid-price": 80, "ordered-on": "2026-09-22" }), o("3", { status: "refunded" })];
  assert.deepEqual(filterOrders(orders, { agent: "gemini" }).map((row) => row.id), ["1"]);
  assert.deepEqual(filterOrders(orders, { status: "refunded" }).map((row) => row.id), ["3"]);
  assert.deepEqual(filterOrders(orders, { flagged: true }, [g("SKU-1", { "floor-price": 90 })]).map((row) => row.id), ["2"]);
  const exq = exceptionQueue([x("r", { status: "resolved" }), x("old", { "detected-on": "2026-09-01" }), x("new")]);
  assert.deepEqual(exq.map((row) => row.id), ["new", "old", "r"]);
});

test("the template's demo data tells the intended story", () => {
  const orders = demoRows.orders.map(normalizeOrder);
  const guardrails = demoRows.guardrails.map(normalizeGuardrail);
  const proposals = demoRows.proposals.map(normalizeProposal);
  const exceptions = demoRows.exceptions.map(normalizeException);
  const settings = normalizeSettings(demoRows.settings[0]);
  const totals = agentTotals({ orders, settings });
  assert.equal(totals.latest, "2026-09-24");
  const muse = totals.agents.find((row) => row.agent === "meta-muse");
  assert.equal(muse.current.orders, 7);
  assert.equal(muse.current.revenue, 64 * 2 + 229 + 189 + 179 + 179 * 2 + 39 * 4 + 64);
  const attention = attentionList({ orders, guardrails, proposals, exceptions });
  assert.deepEqual(attention.breaching.map((item) => item.proposal.title), ["Match Air 20 to Northloop at $164"]);
  assert.equal(attention.impact, -309);
  assert.equal(attention.uncovered.length, 0, "both below-listed Muse orders already have an exception");
  for (const proposal of proposals) {
    assert.deepEqual(evaluateProposal(proposal, guardrails).mismatch, [], `${proposal.title}: stated and computed agree`);
  }
  // Every exception's order relation resolves to a demo order record id.
  const ids = new Set(orders.map((row) => row.id));
  for (const row of exceptions) assert.ok(ids.has(row.order), `${row.title} → order`);
});
