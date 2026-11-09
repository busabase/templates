// /mcp: a small, stateless Model Context Protocol server over Streamable HTTP,
// written here rather than taken from the official TypeScript SDK. The SDK's
// web-standard transport runs on a Worker, but for four read-only tools it
// added about 590 kB to the bundle (+44%, measured with @modelcontextprotocol/server
// 2.4.0) and needed extra esbuild conditions; this file is what those tools need.
//
// Two protocol eras, one endpoint ("dual-era", as the spec calls it):
//
// - Revision 2026-07-28 (https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http):
//   no handshake and no session. Every request carries its version in
//   params._meta["io.modelcontextprotocol/protocolVersion"] and mirrors it
//   in headers (MCP-Protocol-Version, Mcp-Method, Mcp-Name), which must match
//   the body (400, HeaderMismatch -32020). Results carry resultType "complete".
//   server/discover is answered. An unknown method is a 404.
// - Revisions 2024-11-05 to 2025-11-25 (https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
//   initialize → notifications/initialized → tools/list, tools/call. Served
//   statelessly: no Mcp-Session-Id is minted (sessions are optional there),
//   every POST stands alone, a missing MCP-Protocol-Version means 2025-03-26.
//
// Both: POST only (GET, HEAD and DELETE are 405: no server-to-client stream,
// no session to end), one JSON-RPC message per POST (no batches), a
// notification or response is 202 with no body, every answer is a single
// application/json object. CORS is open: the data is public and no cookie or
// credential is involved. Every Origin header is accepted for the same
// reason; the spec's Origin check guards servers on localhost against DNS
// rebinding, and this one is a public website.

export const MODERN_VERSIONS = ["2026-07-28"];
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SUPPORTED_VERSIONS = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];
export const MAX_MCP_BODY_BYTES = 64 * 1024;

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

export const ERRORS = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  HEADER_MISMATCH: -32020,
  UNSUPPORTED_VERSION: -32022,
  RATE_LIMITED: -32000,
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "mcp-protocol-version, retry-after",
};

const DEFAULT_ALLOWED_HEADERS = "content-type, accept, authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id";

const jsonResponse = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...CORS,
      ...extra,
    },
  });

const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), error: { code, message, ...(data === undefined ? {} : { data }) } });

const accepted = () => new Response(null, { status: 202, headers: { ...CORS, "cache-control": "no-store" } });

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** `=?base64?…?=` (the spec's header encoding for non-ASCII names) → the plain value. */
export const decodeHeaderValue = (value) => {
  const match = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(value ?? "");
  if (!match) return value;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
};

/** A per-isolate fixed-window limit per key (the caller's IP). Approximate on purpose: each Worker isolate counts alone. */
export const createRateLimiter = ({ limit = 120, windowMs = 60_000, maxKeys = 5000, now = () => Date.now() } = {}) => {
  const windows = new Map();
  return (key) => {
    const at = now();
    let entry = windows.get(key);
    if (!entry || at - entry.start >= windowMs) {
      if (!entry && windows.size >= maxKeys) {
        for (const [oldKey, old] of windows) if (at - old.start >= windowMs) windows.delete(oldKey);
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value);
      }
      entry = { start: at, count: 0 };
      windows.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= limit ? { ok: true } : { ok: false, retryAfter: Math.max(1, Math.ceil((entry.start + windowMs - at) / 1000)) };
  };
};

const validOrigin = (origin) => {
  if (origin === null || origin === "null") return true;
  try {
    return ["http:", "https:"].includes(new URL(origin).protocol);
  } catch {
    return false;
  }
};

const readBody = async (request) => {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_MCP_BODY_BYTES) return null;
  const body = await request.text();
  return new TextEncoder().encode(body).length > MAX_MCP_BODY_BYTES ? null : body;
};

/**
 * Handle one request to the MCP endpoint. `server` provides:
 *   info()                       → { name, title, version }
 *   instructions()               → Promise<string>
 *   listTools()                  → Promise<Tool[]>
 *   callTool(name, args)         → Promise<CallToolResult | null> (null: no such tool;
 *                                  `{ invalidParams: message }` for arguments it cannot use)
 *   limit(request)               → { ok } | { ok: false, retryAfter } (optional)
 */
export const handleMcp = async (request, server) => {
  const method = request.method;
  if (method === "OPTIONS") {
    const asked = request.headers.get("access-control-request-headers") ?? "";
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS,
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": /^[A-Za-z0-9\-_, ]{1,1000}$/.test(asked) ? asked : DEFAULT_ALLOWED_HEADERS,
        "access-control-max-age": "86400",
      },
    });
  }
  if (method !== "POST") {
    return new Response(
      "This is the shop's MCP endpoint for AI assistants (Model Context Protocol, Streamable HTTP). Add this address as a custom connector in Claude or ChatGPT; it answers POST requests only.\n",
      { status: 405, headers: { ...CORS, allow: "POST, OPTIONS", "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  if (!validOrigin(request.headers.get("origin"))) return jsonResponse(rpcError(undefined, ERRORS.INVALID_REQUEST, "Invalid Origin header"), 403);

  const limited = server.limit?.(request);
  if (limited && !limited.ok) {
    return jsonResponse(rpcError(undefined, ERRORS.RATE_LIMITED, `Too many requests: try again in ${limited.retryAfter} seconds.`), 429, { "retry-after": String(limited.retryAfter) });
  }

  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return jsonResponse(rpcError(undefined, ERRORS.INVALID_REQUEST, "Content-Type must be application/json"), 415);
  const accept = request.headers.get("accept");
  if (accept && !/application\/json|application\/\*|\*\/\*/i.test(accept)) {
    return jsonResponse(rpcError(undefined, ERRORS.INVALID_REQUEST, "Accept must include application/json"), 406);
  }
  const raw = await readBody(request);
  if (raw === null) return jsonResponse(rpcError(undefined, ERRORS.INVALID_REQUEST, "Request body too large"), 413);
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return jsonResponse(rpcError(null, ERRORS.PARSE, "Parse error"), 400);
  }
  if (Array.isArray(message)) return jsonResponse(rpcError(null, ERRORS.INVALID_REQUEST, "Batches are not supported: send one JSON-RPC message per request"), 400);
  if (!isObject(message) || message.jsonrpc !== "2.0") return jsonResponse(rpcError(null, ERRORS.INVALID_REQUEST, "Not a JSON-RPC 2.0 message"), 400);
  if (typeof message.method !== "string") {
    // A JSON-RPC response from the client (an older revision allowed them): accepted, nothing to do.
    if ("result" in message || "error" in message) return accepted();
    return jsonResponse(rpcError(null, ERRORS.INVALID_REQUEST, "Missing method"), 400);
  }
  if (!("id" in message)) return accepted(); // a notification (notifications/initialized, cancelled…)
  const { id } = message;
  if (!(typeof id === "string" || (typeof id === "number" && Number.isFinite(id)))) {
    return jsonResponse(rpcError(null, ERRORS.INVALID_REQUEST, "The id must be a string or a number"), 400);
  }
  const params = isObject(message.params) ? message.params : {};
  const meta = isObject(params._meta) ? params._meta : {};
  const headerVersion = request.headers.get("mcp-protocol-version");

  // ---- Revision 2026-07-28: per-request metadata ----
  if (typeof meta[META_VERSION] === "string") {
    const version = meta[META_VERSION];
    if (!MODERN_VERSIONS.includes(version)) {
      return jsonResponse(rpcError(id, ERRORS.UNSUPPORTED_VERSION, "Unsupported protocol version", { supported: SUPPORTED_VERSIONS, requested: version }), 400);
    }
    const mismatch = (header, expected) => {
      const value = request.headers.get(header);
      if (value === null) return `Missing ${header} header`;
      const decoded = header === "mcp-name" ? decodeHeaderValue(value) : value;
      return decoded === expected ? "" : `Header mismatch: ${header} header value does not match the request body`;
    };
    const problem =
      mismatch("mcp-protocol-version", version) ||
      mismatch("mcp-method", message.method) ||
      (["tools/call", "prompts/get"].includes(message.method) ? mismatch("mcp-name", String(params.name ?? "")) : "") ||
      (message.method === "resources/read" ? mismatch("mcp-name", String(params.uri ?? "")) : "");
    if (problem) return jsonResponse(rpcError(id, ERRORS.HEADER_MISMATCH, problem), 400);
    return dispatch({ id, method: message.method, params, server, modern: true });
  }

  // ---- Revisions up to 2025-11-25: initialize, then plain requests ----
  if (message.method !== "initialize" && headerVersion !== null && !LEGACY_VERSIONS.includes(headerVersion)) {
    if (MODERN_VERSIONS.includes(headerVersion)) {
      return jsonResponse(rpcError(id, ERRORS.HEADER_MISMATCH, `MCP-Protocol-Version ${headerVersion} needs params._meta["${META_VERSION}"]`), 400);
    }
    return jsonResponse(rpcError(id, ERRORS.UNSUPPORTED_VERSION, "Unsupported protocol version", { supported: SUPPORTED_VERSIONS, requested: headerVersion }), 400);
  }
  return dispatch({ id, method: message.method, params, server, modern: false });
};

const dispatch = async ({ id, method, params, server, modern }) => {
  const ok = (result) => jsonResponse({ jsonrpc: "2.0", id, result: modern ? { resultType: "complete", ...result } : result });
  const fail = (code, text, status = 200) => jsonResponse(rpcError(id, code, text), status);
  try {
    if (method === "initialize" && !modern) {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok({
        protocolVersion: LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: server.info(),
        instructions: await server.instructions(),
      });
    }
    if (method === "server/discover") {
      return ok({
        supportedVersions: SUPPORTED_VERSIONS,
        capabilities: { tools: {} },
        _meta: { [META_SERVER_INFO]: server.info() },
        instructions: await server.instructions(),
      });
    }
    if (method === "ping") return ok({});
    if (method === "tools/list") return ok({ tools: await server.listTools() });
    if (method === "tools/call") {
      if (typeof params.name !== "string" || !params.name) return fail(ERRORS.INVALID_PARAMS, "params.name (the tool) is required");
      if (params.arguments !== undefined && !isObject(params.arguments)) return fail(ERRORS.INVALID_PARAMS, "params.arguments must be an object");
      const result = await server.callTool(params.name, params.arguments ?? {});
      if (result === null) return fail(ERRORS.INVALID_PARAMS, `Unknown tool: ${params.name.slice(0, 100)}`);
      if (result.invalidParams) return fail(ERRORS.INVALID_PARAMS, result.invalidParams);
      return ok(result);
    }
    return fail(ERRORS.METHOD_NOT_FOUND, `Method not found: ${method.slice(0, 100)}`, modern ? 404 : 200);
  } catch {
    return fail(ERRORS.INTERNAL, "Internal error", modern ? 500 : 200);
  }
};
