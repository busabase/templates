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
//   POST /api/v1/app-users/send-code             { appId, email, locale } + x-busabase-app-user-ip: the buyer's IP
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

// ---- Keeping bots off the email form ----
//
// Every code Busabase sends is a real email from the platform's address, so a
// script filling the form with random addresses costs the shop its daily
// quota and the platform its sender reputation. Busabase limits per email,
// per space and (from the IP this site forwards) per network. The form adds
// two cheap checks of its own that need no JavaScript and no third party:
//
// - a honeypot: a text field a person never sees (off-screen, aria-hidden,
//   out of the tab order, autocomplete off). Bots that fill every field fill it.
// - a signed render time: the page carries `<ms>.<HMAC>` in a hidden field,
//   and a post less than FORM_MIN_AGE_MS after it was rendered is a script.
//
// Either one gets exactly the answer a real request gets (the redirect to
// "check your email"), with no call to Busabase, so a bot learns nothing.

export const HONEYPOT_FIELD = "referral";
export const FORM_TIME_FIELD = "form_time";
export const FORM_MIN_AGE_MS = 1500;
// Long enough for a tab left open over lunch; a stale page is shown again with a fresh time, not refused.
export const FORM_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FORM_TIME_LABEL = "busa-shop/account-form/v1";

const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Signs and checks the render time. The HMAC key is the site's Busabase API
 * key (the one secret every deployed Worker has; HMAC output does not reveal
 * it, and the label keeps these signatures from meaning anything elsewhere).
 * Without a key (the browser engine, where accounts are off anyway) a random
 * key per isolate is used: signatures then only hold within one isolate.
 */
export const createFormGuard = ({ secret, now = () => Date.now() } = {}) => {
  const keyBytes = secret ? new TextEncoder().encode(String(secret)) : crypto.getRandomValues(new Uint8Array(32));
  let keyPromise;
  const key = () => {
    keyPromise ??= crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return keyPromise;
  };
  const sign = async (ms) => base64url(await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(`${FORM_TIME_LABEL}:${ms}`)));

  /** The hidden field's value for a form rendered now. */
  const stamp = async () => {
    const ms = Math.trunc(now());
    return `${ms}.${await sign(ms)}`;
  };

  /** "ok", "too_fast", "expired" or "invalid" (missing, forged, from the future). */
  const check = async (value) => {
    const match = /^(\d{1,16})\.([A-Za-z0-9_-]{43})$/.exec(typeof value === "string" ? value : "");
    if (!match) return "invalid";
    const expected = await sign(Number(match[1]));
    // Compare in full, whatever differs first.
    let diff = expected.length ^ match[2].length;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ match[2].charCodeAt(i);
    if (diff) return "invalid";
    const age = now() - Number(match[1]);
    if (age < 0) return "invalid";
    if (age < FORM_MIN_AGE_MS) return "too_fast";
    if (age > FORM_MAX_AGE_MS) return "expired";
    return "ok";
  };

  return { stamp, check };
};

const IP_PATTERN = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * The buyer's IP for Busabase's per-network limits: Cloudflare's
 * CF-Connecting-IP, else the first X-Forwarded-For hop, else "" (not sent).
 * Only request headers set on the way in; never anything from the form.
 */
export const clientIpOf = (request) => {
  const cf = (request.headers.get("cf-connecting-ip") ?? "").trim();
  if (IP_PATTERN.test(cf)) return cf;
  const first = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return IP_PATTERN.test(first) ? first : "";
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

// Busabase's 429 reasons for send-code, in the order it checks them. Anything else reads as "cooldown".
export const SEND_CODE_LIMITS = ["cooldown", "ip_hourly_limit", "ip_daily_limit", "email_daily_limit", "space_daily_limit"];

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

  const call = async (method, path, { body, session, ip } = {}) => {
    const headers = {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(spaceId ? { "x-busabase-space": spaceId } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...(session ? { "x-busabase-app-user-session": session } : {}),
      ...(ip ? { "x-busabase-app-user-ip": ip } : {}),
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

  /** `ip` is the buyer's (clientIpOf), for Busabase's per-network limits; without it they are skipped. */
  const sendCode = async ({ appId, email, locale, ip }) => {
    const { status, body } = await call("POST", "/api/v1/app-users/send-code", { body: { appId, email, ...(locale ? { locale } : {}) }, ip });
    if (status === 200) return { ok: true, resendAfterSeconds: wholeSeconds(body?.resendAfterSeconds, 60) };
    if (status === 429) {
      const reason = SEND_CODE_LIMITS.includes(body?.reason) ? body.reason : "cooldown";
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
