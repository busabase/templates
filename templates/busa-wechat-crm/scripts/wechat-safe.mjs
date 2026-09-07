#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { redactSensitive } from "./lib/sensitive-content.mjs";

const execute = promisify(execFile);
const [command, ...args] = process.argv.slice(2);
const allowed = new Set(["contacts", "sessions", "history", "search", "stats", "unread"]);

if (!allowed.has(command)) {
  console.error(`Command must be one of: ${[...allowed].join(", ")}`);
  process.exitCode = 2;
} else {
  const bin = process.env.WECHAT_CLI_BIN || "wechat-cli-rs";
  try {
    const { stdout } = await execute(bin, [command, ...args], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = stdout;
    }
    const redacted = redactSensitive(parsed);
    process.stdout.write(
      `${JSON.stringify(
        {
          command,
          has_sensitive_content: redacted.hasSensitiveContent,
          redaction_count: redacted.redactionCount,
          data: redacted.data,
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    const redacted = redactSensitive(error?.stderr || error?.message || "WECHAT_CLI_FAILED");
    console.error(JSON.stringify({ error: "WECHAT_CLI_FAILED", detail: redacted.data }));
    process.exitCode = Number.isInteger(error?.code) ? error.code : 1;
  }
}
