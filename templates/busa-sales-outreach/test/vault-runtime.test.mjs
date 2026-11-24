import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { resolveSmtpSettings } from "../scripts/lib.mjs";

const smtp = { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "sender@example.test", SMTP_PASS: "fixture-pass" };
const envNames = ["BUSABASE_BASE_URL", "BUSABASE_API_KEY", "BUSABASE_SPACE_ID", ...Object.keys(smtp)];

async function withVault({ metadataStatus = 200, runtimeStatus = 200, environment = {} }, run) {
  const saved = new Map(envNames.map((key) => [key, process.env[key]]));
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    const runtime = request.url === "/api/v1/vault/runtime";
    const status = runtime ? runtimeStatus : metadataStatus;
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(status === 200 ? runtime ? smtp : { items: [] } : { message: "private-response-marker" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const key of envNames) delete process.env[key];
    process.env.BUSABASE_BASE_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.BUSABASE_API_KEY = "fixture-key";
    process.env.BUSABASE_SPACE_ID = "fixture-space";
    Object.assign(process.env, environment);
    await run(requests);
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

test("an authorized ordinary client resolves SMTP through real HTTP without exposing values in readiness", async () => {
  await withVault({}, async (requests) => {
    const result = await resolveSmtpSettings();
    assert.equal(result.ready, true);
    assert.deepEqual(result.values, smtp);
    assert.ok(requests.includes("/api/v1/vault/runtime"));
    assert.equal(JSON.stringify(result.status).includes(smtp.SMTP_PASS), false);
    assert.ok(result.status.every((item) => item.ready && item.source === "vault-runtime"));
  });
});

test("runtime 403 is a permission error, never missing configuration or an echoed server body", async () => {
  await withVault({ runtimeStatus: 403 }, async (requests) => {
    await assert.rejects(resolveSmtpSettings(), (error) => {
      assert.match(error.message, /^VAULT_RUNTIME_HTTP_403/);
      assert.equal(error.code, "VAULT_RUNTIME_FORBIDDEN");
      assert.equal(error.status, 403);
      assert.equal(error.message.includes("private-response-marker"), false);
      return true;
    });
    assert.equal(requests.filter((path) => path === "/api/v1/vault/runtime").length, 1);
  });
});

test("unsupported Vault routes preserve missing readiness and environment fallback", async () => {
  await withVault({ metadataStatus: 404, runtimeStatus: 404 }, async () => {
    const result = await resolveSmtpSettings();
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing, Object.keys(smtp));
  });
  await withVault({ metadataStatus: 403, runtimeStatus: 403, environment: smtp }, async (requests) => {
    const result = await resolveSmtpSettings();
    assert.equal(result.ready, true);
    assert.deepEqual(result.values, smtp);
    assert.deepEqual(requests, []);
  });
});

test("metadata permission does not prevent an independently authorized runtime read", async () => {
  await withVault({ metadataStatus: 403 }, async (requests) => {
    const result = await resolveSmtpSettings();
    assert.equal(result.ready, true);
    assert.deepEqual(result.values, smtp);
    assert.ok(requests.includes("/api/v1/vault/runtime"));
  });
});
