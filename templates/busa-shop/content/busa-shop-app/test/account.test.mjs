// src/account.js on its own: what a buyer may see of an order, the cookies,
// and the email and code rules.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUYER_ORDER_FIELDS,
  buyerOrderFromRecord,
  clearSessionCookie,
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
