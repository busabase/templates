import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyRollout } from "./apply-base-ui-rollout.mjs";

const fixture = ({ layered = false, accent = false } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "base-ui-rollout-"));
  const appDir = path.join(root, "templates", "fixture", "content", "fixture-app", "app");
  fs.mkdirSync(path.join(appDir, "styles"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "base-ui.css"), "@layer base-ui { :root { --text-xs: 11px; } }\n");
  const styles = layered ? ["./styles/layers.css", "./styles/base.css", "./styles/components.css"] : ["./styles.css"];
  if (accent) styles.splice(1, 0, "./accent-theme.css");
  fs.writeFileSync(
    path.join(appDir, "index.html"),
    `<head>\n  <meta name="viewport" content="width=device-width">\n${
      layered ? "" : '  <meta name="color-scheme" content="light">\n'
    }${styles.map((href) => `  <link rel="stylesheet" href="${href}">`).join("\n")}\n</head>\n`,
  );
  if (layered) {
    fs.writeFileSync(path.join(appDir, "styles", "layers.css"), "@layer base, components;\n");
  }
  return { root, appDir };
};

test("rolls base UI into a single-stylesheet AirApp idempotently", () => {
  const { root, appDir } = fixture({ accent: true });
  assert.ok(applyRollout({ root }).length > 0);
  assert.deepEqual(applyRollout({ root }), []);
  assert.deepEqual(applyRollout({ root, check: true }), []);

  const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
  assert.match(html, /content="light dark"/);
  assert.ok(html.indexOf("base-ui.css") < html.indexOf("styles.css"));
  assert.ok(html.indexOf("accent-theme.css") > html.indexOf("styles.css"));
});

test("registers base-ui before split CSS layers", () => {
  const { root, appDir } = fixture({ layered: true });
  applyRollout({ root });

  const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
  const layers = fs.readFileSync(path.join(appDir, "styles", "layers.css"), "utf8");
  assert.ok(html.indexOf("styles/base-ui.css") < html.indexOf("styles/layers.css"));
  assert.equal(
    fs.readFileSync(path.join(appDir, "styles", "base-ui.css"), "utf8"),
    "@layer base-ui { :root { --text-xs: 11px; } }\n",
  );
  assert.match(html, /^ {2}<meta name="color-scheme" content="light dark">$/m);
  assert.equal(layers, "@layer base-ui, base, components;\n");
});
