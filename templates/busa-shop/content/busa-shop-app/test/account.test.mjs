// src/account.js on its own: what a buyer may see of an order, the cookies,
// and the email and code rules.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUYER_ORDER_FIELDS,
  buyerOrderFromRecord,
  clearSessionCookie,
  clientIpOf,
  createAccounts,
  createFormGuard,
  FORM_MIN_AGE_MS,
  normalizeCode,
  normalizeEmail,
  parseCookies,
  sessionCookie,
  sessionTokenOf,
} from "../src/account.js";

describe("account helpers", () => {
  it("a buyer's order keeps only the buyer's columns", () => {
    const order = buyerOrderFromRecord({
      id: "rec_1",
      createdAt: "2026-11-01T00:00:00.000Z",
      fields: {
        "order-id": "ORD-9D4TB7W1XE",
        status: { id: "paid", name: "Paid" },
        "created-at": "2026-11-02T09:00:00.000Z",
        "items-summary": "2 × Walking Robot Buddy (TT-ROB-01) @ 24.00 USD = 48.00 USD\n1 × Rainbow Blocks @ 22.40 USD = 22.40 USD",
        total: "78.40",
        currency: "usd",
        "internal-note": "staff only",
        "tracking-number": "T1",
      },
    });
    assert.deepEqual(order, {
      orderId: "ORD-9D4TB7W1XE",
      createdAt: "2026-11-02T09:00:00.000Z",
      items: [
        { name: "Walking Robot Buddy", quantity: 2 },
        { name: "Rainbow Blocks", quantity: 1 },
      ],
      total: 78.4,
      currency: "USD",
      status: "paid",
    });
    assert.deepEqual(BUYER_ORDER_FIELDS, ["order-id", "created-at", "items", "items-summary", "total", "currency", "status"]);
    assert.equal(buyerOrderFromRecord({ fields: { status: "made-up" } }).status, "", "an unknown status is not shown");
  });

  it("the session cookie is HttpOnly, Secure, Lax, site-wide, 30 days; clearing it expires it", () => {
    assert.equal(sessionCookie("abcdefghijklmnopqrstuvwxyz"), "busa_shop_session=abcdefghijklmnopqrstuvwxyz; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000");
    assert.equal(clearSessionCookie(), "busa_shop_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  });

  it("only a token Busabase could have issued is read from the cookie", () => {
    const request = (cookie) => new Request("https://shop.example/account", { headers: { cookie } });
    assert.equal(sessionTokenOf(request("a=1; busa_shop_session=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA_-")), "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA_-");
    assert.equal(sessionTokenOf(request("busa_shop_session=short")), "");
    assert.equal(sessionTokenOf(request("busa_shop_session=has spaces and; x=1")), "");
    assert.equal(sessionTokenOf(request("")), "");
    assert.deepEqual([...parseCookies("a=1; b = 2;c=")], [["a", "1"], ["b", "2"], ["c", ""]]);
  });

  it("emails are trimmed and lowercased; codes are 6 digits, spaces allowed", () => {
    assert.equal(normalizeEmail("  Mia.Jensen@Example.COM "), "mia.jensen@example.com");
    assert.equal(normalizeEmail("nope"), null);
    assert.equal(normalizeEmail(`${"a".repeat(200)}@example.com`), null);
    assert.equal(normalizeCode("123 456"), "123456");
    assert.equal(normalizeCode("123-456"), "123456");
    assert.equal(normalizeCode("12345"), null);
    assert.equal(normalizeCode("12a456"), null);
  });
});

describe("send-code abuse protection helpers", () => {
  it("the render time: too fast, ok, expired, forged, from another key", async () => {
    let clock = 1_800_000_000_000;
    const guard = createFormGuard({ secret: "site-key", now: () => clock });
    const stamp = await guard.stamp();
    assert.match(stamp, /^1800000000000\.[A-Za-z0-9_-]{43}$/);
    assert.equal(await guard.check(stamp), "too_fast");
    clock += FORM_MIN_AGE_MS - 1;
    assert.equal(await guard.check(stamp), "too_fast");
    clock += 1;
    assert.equal(await guard.check(stamp), "ok");
    clock += 7 * 60 * 60 * 1000;
    assert.equal(await guard.check(stamp), "expired");
    const other = createFormGuard({ secret: "another-site-key", now: () => clock });
    assert.equal(await other.check(stamp), "invalid", "signed with another site's key");
    assert.equal(await guard.check(`${Number(stamp.split(".")[0]) - 5000}.${stamp.split(".")[1]}`), "invalid", "an earlier time with the same signature");
    for (const junk of [undefined, null, "", "123", "abc.def"]) assert.equal(await guard.check(junk), "invalid");
    const future = createFormGuard({ secret: "site-key", now: () => clock + 60_000 });
    assert.equal(await guard.check(await future.stamp()), "invalid", "a time from the future");
  });

  it("the client IP comes from CF-Connecting-IP, else the first X-Forwarded-For hop", () => {
    const req = (headers) => new Request("https://shop.example/account/send-code", { headers });
    assert.equal(clientIpOf(req({ "cf-connecting-ip": "198.51.100.23", "x-forwarded-for": "203.0.113.7" })), "198.51.100.23");
    assert.equal(clientIpOf(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
    assert.equal(clientIpOf(req({ "cf-connecting-ip": "bad value", "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
    assert.equal(clientIpOf(req({})), "");
  });

  it("sendCode sends the IP header and keeps the per-network 429 reasons", async () => {
    const seen = [];
    const answers = [
      { status: 200, body: { ok: true, resendAfterSeconds: 60 } },
      { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 1200, reason: "ip_hourly_limit" } },
      { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 40000, reason: "ip_daily_limit" } },
      { status: 429, body: { code: "RATE_LIMITED", retryAfterSeconds: 10, reason: "something_new" } },
    ];
    const accounts = createAccounts({
      baseUrl: "https://busabase.example",
      apiKey: "k",
      spaceId: "spc",
      fetchImpl: async (url, init) => {
        seen.push(init.headers);
        const { status, body } = answers.shift();
        return new Response(JSON.stringify(body), { status });
      },
    });
    assert.deepEqual(await accounts.sendCode({ appId: "a", email: "m@example.com", locale: "en", ip: "203.0.113.7" }), { ok: true, resendAfterSeconds: 60 });
    assert.equal(seen[0]["x-busabase-app-user-ip"], "203.0.113.7");
    assert.equal((await accounts.sendCode({ appId: "a", email: "m@example.com" })).reason, "ip_hourly_limit");
    assert.equal("x-busabase-app-user-ip" in seen[1], false, "no IP, no header");
    assert.equal((await accounts.sendCode({ appId: "a", email: "m@example.com" })).reason, "ip_daily_limit");
    assert.equal((await accounts.sendCode({ appId: "a", email: "m@example.com" })).reason, "cooldown", "an unknown reason reads as the cooldown");
  });
});
