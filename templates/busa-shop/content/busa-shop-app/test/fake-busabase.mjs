// A small stand-in for the Busabase REST API, enough for the routes the site
// calls: GET /api/v1/nodes, GET /api/v1/records, POST
// /api/v1/bases/{baseId}/change-requests, GET /api/v1/file-trees/{nodeId}/files/{path},
// plus a private asset path. It records every request so tests can assert what
// the Worker asked for and which requests carried the key.
import { readFile } from "node:fs/promises";
import http from "node:http";

export const TEST_KEY = "test-key";

/** Parse oRPC's bracket query notation (`types[0]=base`, `sort[fieldSlug]=ref`) into plain values. */
export const parseQuery = (searchParams) => {
  const out = {};
  for (const [rawKey, value] of searchParams) {
    const parts = rawKey.split(/\[|\]/).filter(Boolean);
    let target = out;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        if (target[part] === undefined) target[part] = value;
        else if (Array.isArray(target[part])) target[part].push(value);
        else target[part] = [target[part], value];
      } else {
        target[part] ??= {};
        target = target[part];
      }
    });
  }
  return out;
};

const asList = (value) => {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [value];
};

/**
 * @param {object} state
 * @param {Array} state.nodes node summaries ({ id, type, slug, parentId, baseId, metadata })
 * @param {Record<string, Array>} state.records baseId → [{ id, fields }]
 * @param {Record<string, Record<string, object>>} [state.files] nodeId → path → readFile response
 * @param {Record<string, {type: string, path?: string, body?: string}>} [state.assets] /assets/<name> → bytes (key required)
 */
export const startFakeBusabase = async (state) => {
  const log = [];
  const idempotency = new Map();
  let nextId = 1;
  const options = { failCreates: false, queueCreates: false, failReads: false, ...state.options };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const auth = req.headers.authorization ?? "";
    let body = "";
    for await (const chunk of req) body += chunk;
    const entry = { method: req.method, path: url.pathname, query: parseQuery(url.searchParams), auth, space: req.headers["x-busabase-space"] ?? "", body };
    log.push(entry);
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(typeof data === "string" ? data : JSON.stringify(data));
    };
    if (auth !== `Bearer ${TEST_KEY}`) return send(401, { code: "UNAUTHORIZED", message: "Unauthorized" });

    if (url.pathname.startsWith("/assets/")) {
      const asset = state.assets?.[decodeURIComponent(url.pathname.slice("/assets/".length))];
      if (!asset) return send(404, { code: "NOT_FOUND" });
      const bytes = asset.path ? await readFile(asset.path) : Buffer.from(asset.body ?? "");
      res.writeHead(200, { "content-type": asset.type, "content-length": String(bytes.length) });
      return res.end(bytes);
    }
    if (options.failReads && req.method === "GET") return send(500, { code: "INTERNAL", message: "boom" });

    if (req.method === "GET" && url.pathname === "/api/v1/nodes") {
      const types = asList(entry.query.types);
      return send(200, state.nodes.filter((node) => !types.length || types.includes(node.type)).map((node) => ({ children: [], description: "", name: node.slug, metadata: {}, ...node })));
    }
    if (req.method === "GET" && url.pathname === "/api/v1/records") {
      const ref = entry.query.baseId;
      const node = state.nodes.find((candidate) => candidate.type === "base" && (candidate.baseId === ref || candidate.slug === ref));
      if (!node) return send(404, { code: "NOT_FOUND", message: "Base not found" });
      let rows = [...(state.records[node.baseId] ?? [])];
      const sortField = entry.query.sort?.fieldSlug;
      if (sortField) rows.sort((a, b) => Number(a.fields[sortField] ?? Infinity) - Number(b.fields[sortField] ?? Infinity));
      const limit = Number(entry.query.limit ?? 50);
      const page = rows.slice(0, limit).map((row) => ({
        id: row.id,
        baseId: node.baseId,
        headCommitId: `cmt_${row.id}`,
        status: "active",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
        headCommit: { id: `cmt_${row.id}`, payload: row.fields },
      }));
      return send(200, { records: page, nextCursor: rows.length > limit ? "next" : null });
    }
    const create = /^\/api\/v1\/bases\/([^/]+)\/change-requests$/.exec(url.pathname);
    if (req.method === "POST" && create) {
      const baseId = decodeURIComponent(create[1]);
      const input = JSON.parse(body || "{}");
      const key = input.idempotencyKey ? `${baseId}|${input.submittedBy}|${input.idempotencyKey}` : "";
      if (key && idempotency.has(key)) return send(200, idempotency.get(key));
      if (options.failCreates) return send(503, { code: "SERVICE_UNAVAILABLE", message: "down" });
      const id = `rec_${nextId++}`;
      let response;
      if (options.queueCreates) {
        response = { id: `cr_${id}`, status: "in_review", materialized: false };
      } else {
        (state.records[baseId] ??= []).push({ id, fields: input.fields });
        response = { id, baseId, materialized: true, headCommitId: `cmt_${id}`, headCommit: { payload: input.fields } };
      }
      if (key) idempotency.set(key, response);
      return send(200, response);
    }
    const file = /^\/api\/v1\/file-trees\/([^/]+)\/files\/(.+)$/.exec(url.pathname);
    if (req.method === "GET" && file) {
      const found = state.files?.[decodeURIComponent(file[1])]?.[decodeURIComponent(file[2])];
      return found ? send(200, found) : send(404, { code: "NOT_FOUND" });
    }
    return send(404, { code: "NOT_FOUND", message: `no route ${req.method} ${url.pathname}` });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    log,
    options,
    state,
    /** Forget every idempotency key, as a fresh workspace would. */
    reset: () => idempotency.clear(),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
