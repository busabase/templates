// Opt-in conformance test: exercises the real Hono app against a live local
// Busabase server (not the demo mode, not a fake in-process client).
//
// Requires a running `busabase server` (busabase-cli >= 0.11.0 to match this
// app's busabase-sdk version skew-free) reachable at BUSABASE_LIVE_TEST_URL, e.g.:
//
//   npx busabase@latest server --port 15420 --data /tmp/busabase-conformance-data
//   BUSABASE_LIVE_TEST_URL=http://127.0.0.1:15420 node --test test/busabase-conformance.test.mjs
//
// Skips itself (not a failure) when BUSABASE_LIVE_TEST_URL is unset, so it never
// blocks `npm run check` / CI, which has no Busabase server available.
import assert from "node:assert/strict";
import test from "node:test";

const LIVE_URL = process.env.BUSABASE_LIVE_TEST_URL;

test(
  "busabase conformance (live local server)",
  { skip: !LIVE_URL && "set BUSABASE_LIVE_TEST_URL to run" },
  async (t) => {
    process.env.BUSABASE_BASE_URL = LIVE_URL;
    process.env.BUSABASE_SPACE_ID = process.env.BUSABASE_SPACE_ID || "local";

    // createBusabaseClient() talks to `runtimeOrigin()` (this server's own
    // request URL, same-origin design so the ambient AirApp session cookie
    // works) and relies on the /api/v1/* proxy in server/local-auth.ts to reach
    // BUSABASE_BASE_URL. That proxy issues a *real* network fetch back to this
    // process, so the app must be listening on a real socket — app.request()
    // in-process dispatch is not enough here.
    const { serve } = await import("@hono/node-server");
    const { app } = await import("../server/hono.ts");
    const server = await new Promise((resolve) => {
      const instance = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (info) =>
        resolve({ instance, port: info.port }),
      );
    });
    t.after(() => server.instance.close());
    const origin = `http://127.0.0.1:${server.port}`;

    await t.test("provisions declared Busabase resources on first contact", async () => {
      const res = await fetch(`${origin}/api/state`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.provider_status.ok, true, JSON.stringify(body.provider_status));
      assert.deepEqual(body.provider_status.connection, {
        folder_exists: true,
        base_exists: true,
        contacts_base_exists: true,
        settings_base_exists: true,
        drive_exists: true,
      });
    });

    await t.test("review item saved through the provider surfaces in /api/state", async () => {
      // Go through createBusabaseProvider().saveBatch — the same path the
      // trusted skill process uses after scanning IMAP — rather than
      // hand-crafting Base fields, so this stays correct if the field mapping
      // in email-records.ts changes shape.
      const { createBusabaseProvider } = await import("../lib/data-provider/busabase-provider.ts");
      const { normalizeBatch } = await import("../lib/data-provider/provider-utils.ts");
      const provider = createBusabaseProvider();
      await provider.saveBatch(
        normalizeBatch({
          batch_id: "conformance-batch",
          generated_at: new Date().toISOString(),
          source: "conformance-test",
          items: [
            {
              id: "conformance-item-1",
              uid: "conformance-item-1",
              subject: "Conformance test subject",
              from: "Someone <someone@example.test>",
              category: "other",
              status: "needs_review",
            },
          ],
        }),
      );

      const res = await fetch(`${origin}/api/state`);
      const body = await res.json();
      const item = body.items.find((entry) => entry.id === "conformance-item-1");
      assert.ok(item, `expected seeded item in ${JSON.stringify(body.items.map((i) => i.id))}`);
      assert.equal(item.subject, "Conformance test subject");
      assert.equal(item.status, "needs_review");
    });

    await t.test("POST /api/decision approves an item and persists the decision to Busabase", async () => {
      const res = await fetch(`${origin}/api/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ["conformance-item-1"], action: "approve_archive" }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.changed, ["conformance-item-1"]);
      assert.equal(body.decisions, 1);

      const after = await fetch(`${origin}/api/state`);
      const afterBody = await after.json();
      const item = afterBody.items.find((entry) => entry.id === "conformance-item-1");
      assert.equal(item.decision.action, "approve_archive");
      assert.equal(item.status, "approved");
    });

    await t.test("gated-write boundary: AirApp route never touches IMAP/SMTP", async () => {
      // The AirApp only ever calls busabase-sdk (reviews/contacts/settings Bases,
      // files Drive). It has no IMAP/SMTP client at all — the trusted skill
      // process owns mailbox side effects. Assert that invariant structurally:
      // no imap/smtp import reachable from the AirApp's HTTP entrypoint.
      const fs = await import("node:fs/promises");
      const src = await fs.readFile(new URL("../server/hono.ts", import.meta.url), "utf8");
      assert.doesNotMatch(src, /imap|nodemailer|smtp/i);
    });
  },
);
