// Buyer accounts ("My orders"): the shop's side of Busabase app users.
//
// A buyer signs in with a 6-digit code emailed to them, and then sees the
// orders placed while signed in, and only those. Busabase does the hard parts
// (the code, the email, the session, and which rows belong to whom); this
// module calls its app-user endpoints with the site's own key, the same way
// src/vault.js reads the Vault: plain fetch, `Authorization: Bearer <key>`,
// `x-busabase-space`, never from the visitor's browser.
//
//   GET  /api/v1/app-users/apps/<app>/settings   is login enabled? (cached, src/handler.js hides all account UI otherwise)
//   POST /api/v1/app-users/send-code             { appId, email, locale }
//   POST /api/v1/app-users/verify                { appId, email, code } → session token + user
//   GET  /api/v1/app-users/session?appId=        who the session belongs to
//   POST /api/v1/app-users/sign-out              { appId }
//   POST /api/v1/app-users/records/query         { appId, baseId, limit, cursor }: the session user's
//                                                Orders rows; Busabase filters by the owner field
//
// `<app>` is this website's own AirApp node (src/resources.js resolveShopApp).
// The session token travels in `x-busabase-app-user-session`, and between the
// buyer's browser and this site in the HttpOnly cookie `busa_shop_session`.
//
// The shop never breaks because of this: an old Busabase (the endpoints 404),
// login switched off, Busabase unreachable, or the browser engine (no key) all
// mean "no account UI", and checkout goes on as a guest checkout.

import { EMAIL_PATTERN, LIMITS } from "./orders.js";

export const SESSION_COOKIE = "busa_shop_session";
// The email a code was just sent to, so the code form can name it after the redirect.
export const PENDING_COOKIE = "busa_shop_login";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
export const PENDING_MAX_AGE = 15 * 60;
export const SETTINGS_TTL_MS = 60_000;
export const SETTINGS_ERROR_TTL_MS = 30_000;
export const ORDERS_PAGE = 20;

// What Busabase issues: random base64url, at least 32 bytes. Anything else in the cookie is not sent on.
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,256}$/;
export const CODE_PATTERN = /^\d{6}$/;
export const CURSOR_PATTERN = /^[A-Za-z0-9_.:=+/-]{1,200}$/;

const apiRoot = (baseUrl) => String(baseUrl).replace(/\/+$/, "").replace(/\/api\/v1$/, "");

/** `a=1; b=2` → Map. Values are taken as sent; callers check them against a pattern. */
export const parseCookies = (header) => {
  const out = new Map();
  for (const part of String(header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!out.has(name)) out.set(name, part.slice(index + 1).trim());
  }
  return out;
};

/** The session token from the request's cookie, or "" when there is none (or it is not one Busabase could have issued). */
export const sessionTokenOf = (request) => {
  const value = parseCookies(request.headers.get("cookie")).get(SESSION_COOKIE) ?? "";
  return SESSION_TOKEN_PATTERN.test(value) ? value : "";
};

/** The email the last code went to (the pending cookie), or "". */
export const pendingEmailOf = (request) => {
  let value = parseCookies(request.headers.get("cookie")).get(PENDING_COOKIE) ?? "";
  try {
    value = decodeURIComponent(value);
  } catch {
    return "";
  }
  return normalizeEmail(value) ?? "";
};

const cookie = (name, value, maxAge, path = "/") => `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=${maxAge}`;

export const sessionCookie = (sessionToken) => cookie(SESSION_COOKIE, sessionToken, SESSION_MAX_AGE);
export const clearSessionCookie = () => cookie(SESSION_COOKIE, "", 0);
export const pendingCookie = (email) => cookie(PENDING_COOKIE, encodeURIComponent(email), PENDING_MAX_AGE);
export const clearPendingCookie = () => cookie(PENDING_COOKIE, "", 0);

/** A typed email as Busabase keys app users: trimmed, lowercased. null when it is not an email address. */
export const normalizeEmail = (value) => {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > LIMITS.email || !EMAIL_PATTERN.test(email)) return null;
  return email;
};

/** The 6 digits, with the spaces or dashes people type between them removed. null otherwise. */
export const normalizeCode = (value) => {
  const code = typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
  return CODE_PATTERN.test(code) ? code : null;
};

// ---- What a buyer may see of their own order ----

// The only Orders fields "My orders" shows. Everything else on the row (the
// internal note, the reply draft, the tracking number, the payment and email
// logs, the PayPal ids, a product's cost) never reaches the page, whatever
// Busabase sends back.
export const BUYER_ORDER_FIELDS = ["order-id", "created-at", "items", "items-summary", "total", "currency", "status"];

const BUYER_STATUSES = new Set(["new", "awaiting-payment", "confirmed", "paid", "shipped", "completed", "cancelled", "refunded", "payment-problem"]);

const text = (value) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const selectId = (value) => (value && typeof value === "object" && !Array.isArray(value) ? text(value.id ?? value.name) : text(value)).toLowerCase();
const numberOrNull = (value) => {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

/** The items as name × quantity: from Items (JSON), or the Items lines when that is unreadable. */
const buyerItems = (fields) => {
  try {
    const parsed = JSON.parse(typeof fields.items === "string" ? fields.items : "");
    if (Array.isArray(parsed)) {
      const lines = parsed
        .filter((line) => line && typeof line === "object" && text(line.name))
        .slice(0, 50)
        .map((line) => ({ name: text(line.name), quantity: Math.max(0, Math.trunc(Number(line.quantity) || 0)) }));
      if (lines.length) return lines;
    }
  } catch {
    // fall through to the summary
  }
  return text(fields["items-summary"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line) => {
      const match = /^(\d+)\s*[×x]\s*(.+?)(?:\s*\([^()]*\))?\s*(?:@.*)?$/.exec(line);
      return match ? { name: match[2].trim(), quantity: Number(match[1]) } : { name: line, quantity: 0 };
    });
};

/** One row from records/query → what the buyer sees. Reads BUYER_ORDER_FIELDS and nothing else. */
export const buyerOrderFromRecord = (record) => {
  const source = record?.fields && typeof record.fields === "object" ? record.fields : {};
  const fields = Object.fromEntries(BUYER_ORDER_FIELDS.map((slug) => [slug, source[slug]]));
  const status = selectId(fields.status);
  const created = text(fields["created-at"]) || text(record?.createdAt);
  return {
    orderId: text(fields["order-id"]),
    createdAt: Number.isFinite(Date.parse(created)) ? new Date(Date.parse(created)).toISOString() : "",
    items: buyerItems(fields),
    total: numberOrNull(fields.total),
    currency: text(fields.currency).toUpperCase(),
    status: BUYER_STATUSES.has(status) ? status : "",
  };
};

// ---- The Busabase client ----

const errorCode = (body) => (body && typeof body === "object" && typeof body.code === "string" ? body.code : "");
const wholeSeconds = (value, fallback) => {
  const seconds = Math.ceil(Number(value));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86_400) : fallback;
};

/**
 * One per Worker isolate and env. `settings(appId)` is cached (a minute; half
 * a minute after a failure); everything else is read now. No method throws:
 * each resolves to a plain result, `{ error: "unavailable" }` when Busabase
 * could not be asked or answered something unexpected.
 */
export const createAccounts = ({ baseUrl, apiKey, spaceId, fetchImpl = fetch, now = () => Date.now(), log = console }) => {
  const root = apiRoot(baseUrl);
  const cache = new Map(); // appId → { value, at, ttl }

  const call = async (method, path, { body, session } = {}) => {
    const headers = {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(spaceId ? { "x-busabase-space": spaceId } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...(session ? { "x-busabase-app-user-session": session } : {}),
    };
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch {
      return { status: 0, body: null };
    }
    const data = await response.json().catch(() => null);
    return { status: response.status, body: data };
  };

  /** `{ enabled, appName, ownerFields }`; `enabled: false` with a `reason` when login is off or cannot be asked about. */
  const settings = async (appId) => {
    if (!apiKey || !appId) return { enabled: false, reason: apiKey ? "no-app" : "no-key" };
    const at = now();
    const hit = cache.get(appId);
    if (hit && at - hit.at < hit.ttl) return hit.value;
    const { status, body } = await call("GET", `/api/v1/app-users/apps/${encodeURIComponent(appId)}/settings`);
    let value;
    let ttl = SETTINGS_TTL_MS;
    if (status === 200 && body && typeof body === "object") {
      value = {
        enabled: body.enabled === true,
        appName: typeof body.appName === "string" ? body.appName : "",
        ownerFields: body.ownerFields && typeof body.ownerFields === "object" ? body.ownerFields : {},
        ...(body.enabled === true ? {} : { reason: "disabled" }),
      };
    } else if (status === 404) {
      // A Busabase without app users (before the endpoints shipped): no accounts, as if switched off.
      value = { enabled: false, reason: "not-supported" };
    } else {
      if (status !== 401 && status !== 403) log.warn?.("busa-shop: app-user settings unreadable", status || "unreachable");
      value = { enabled: false, reason: status ? `http-${status}` : "unreachable" };
      ttl = SETTINGS_ERROR_TTL_MS;
    }
    cache.set(appId, { value, at: now(), ttl });
    return value;
  };

  const forget = (appId) => cache.delete(appId);

  const sendCode = async ({ appId, email, locale }) => {
    const { status, body } = await call("POST", "/api/v1/app-users/send-code", { body: { appId, email, ...(locale ? { locale } : {}) } });
    if (status === 200) return { ok: true, resendAfterSeconds: wholeSeconds(body?.resendAfterSeconds, 60) };
    if (status === 429) {
      const reason = ["cooldown", "email_daily_limit", "space_daily_limit"].includes(body?.reason) ? body.reason : "cooldown";
      return { error: "rate_limited", reason, retryAfterSeconds: wholeSeconds(body?.retryAfterSeconds, 60) };
    }
    if (status === 403 && errorCode(body) === "APP_LOGIN_DISABLED") {
      forget(appId);
      return { error: "disabled" };
    }
    if (status === 400) return { error: "invalid_email" };
    log.warn?.("busa-shop: sign-in code not sent", status || "unreachable", errorCode(body));
    return { error: "unavailable" };
  };

  const verify = async ({ appId, email, code }) => {
    const { status, body } = await call("POST", "/api/v1/app-users/verify", { body: { appId, email, code } });
    if (status === 200) {
      const token = typeof body?.sessionToken === "string" ? body.sessionToken : "";
      const user = body?.user && typeof body.user.id === "string" ? { id: body.user.id, email: text(body.user.email) } : null;
      if (SESSION_TOKEN_PATTERN.test(token) && user) return { ok: true, sessionToken: token, user };
      log.warn?.("busa-shop: sign-in answered without a usable session");
      return { error: "unavailable" };
    }
    const answer = errorCode(body);
    if (status === 400 && answer === "INVALID_CODE") {
      const left = Math.trunc(Number(body?.attemptsLeft));
      return { error: "invalid_code", attemptsLeft: Number.isFinite(left) && left > 0 ? left : 0 };
    }
    if (status === 410 || answer === "CODE_EXPIRED") return { error: "expired" };
    if (status === 403 && answer === "APP_USER_DISABLED") return { error: "user_disabled" };
    if (status === 403 && answer === "APP_LOGIN_DISABLED") {
      forget(appId);
      return { error: "disabled" };
    }
    log.warn?.("busa-shop: sign-in not verified", status || "unreachable", answer);
    return { error: "unavailable" };
  };

  /** `{ user }`, `{ error: "invalid" }` (signed out, expired, disabled) or `{ error: "unavailable" }`. */
  const session = async ({ appId, token }) => {
    if (!token) return { error: "invalid" };
    const { status, body } = await call("GET", `/api/v1/app-users/session?appId=${encodeURIComponent(appId)}`, { session: token });
    if (status === 200 && body?.user && typeof body.user.id === "string" && body.user.id) {
      return { user: { id: body.user.id, email: text(body.user.email) } };
    }
    if (status === 401) return { error: "invalid" };
    log.warn?.("busa-shop: app-user session unreadable", status || "unreachable");
    return { error: "unavailable" };
  };

  const signOut = async ({ appId, token }) => {
    if (!token) return { ok: true };
    const { status } = await call("POST", "/api/v1/app-users/sign-out", { body: { appId }, session: token });
    return status === 200 || status === 401 ? { ok: true } : { error: "unavailable" };
  };

  /** The session user's rows of one Base, as Busabase filters them: `{ records, nextCursor }` or `{ error }`. */
  const queryRecords = async ({ appId, baseId, token, limit = ORDERS_PAGE, cursor }) => {
    const { status, body } = await call("POST", "/api/v1/app-users/records/query", {
      body: { appId, baseId, limit, ...(cursor ? { cursor } : {}) },
      session: token,
    });
    if (status === 200 && Array.isArray(body?.records)) {
      return { records: body.records, nextCursor: typeof body.nextCursor === "string" && CURSOR_PATTERN.test(body.nextCursor) ? body.nextCursor : null };
    }
    if (status === 401) return { error: "invalid" };
    if (status === 403 && errorCode(body) === "NO_OWNER_FIELD") {
      log.warn?.("busa-shop: buyer login is on, but no owner field is set for Orders (customer-account)");
      return { error: "no_owner_field" };
    }
    log.warn?.("busa-shop: buyer's orders unreadable", status || "unreachable", errorCode(body));
    return { error: "unavailable" };
  };

  return { settings, forget, sendCode, verify, session, signOut, queryRecords };
};
