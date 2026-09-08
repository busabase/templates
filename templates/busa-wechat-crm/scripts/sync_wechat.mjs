#!/usr/bin/env node
// Trusted local adapter: reads the operator's own WeChat through wechat-cli-rs
// and proposes Busabase changes. It cannot send messages or modify WeChat.
import { execFileSync } from "node:child_process";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/busa-wechat-crm-app/app/js/config.js";

const WECHAT_BIN = process.env.WECHAT_CLI_BIN || "wechat-cli-rs";
const DEFAULT_STALE_DAYS = 7;

function help() {
  console.log(`Usage: node scripts/sync_wechat.mjs [--apply]

Reads contacts and recent sessions from the local WeChat database, then refreshes
only people already promoted into the Busabase People Base. Untracked contacts
stay local. Existing relationship notes, goals, analyses, and worklogs are never
overwritten. Without --apply this is a dry run. The script never sends or
modifies anything in WeChat.`);
}

function runWechatCli(args) {
  try {
    return JSON.parse(execFileSync(WECHAT_BIN, [...args, "--format", "json"], { encoding: "utf8" }));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`"${WECHAT_BIN}" is not on PATH. Install it from https://wechat-cli.com/.`);
    }
    const stderr = (error.stderr || "").toString().trim();
    if (error.status === 1 && /请先运行.*init|缺少配置文件/.test(stderr)) {
      throw new Error(`wechat-cli-rs is not initialized. Ask the operator to run explicitly: ${WECHAT_BIN} init`);
    }
    throw new Error(`${WECHAT_BIN} ${args.join(" ")} failed (exit ${error.status}): ${stderr || error.message}`);
  }
}

const fieldValue = (record, slug) =>
  record?.headCommit?.payload?.[slug] ?? record?.headCommit?.fields?.[slug] ?? record?.fields?.[slug];
const isGroup = (username) => username.includes("@chatroom");
const daysSince = (isoDate) =>
  isoDate ? (Date.now() - new Date(isoDate).getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;

async function listAll(client, baseId) {
  const records = [];
  let cursor;
  do {
    const page = await client.records.list({ baseId, limit: 100, ...(cursor ? { cursor } : {}) });
    records.push(...(page.records || (Array.isArray(page) ? page : [])));
    cursor = page.nextCursor;
  } while (cursor);
  return records;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");
  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    const missing = resources.missing.map((base) => base.key).join(", ");
    throw new Error(`微信关系攻略尚未安装完整。缺少：${missing || appConfig.folder.slug}`);
  }
  const bases = new Map(resources.bases.map((base) => [base.key, base]));
  const baseId = (key) => {
    const value = bases.get(key)?.baseId;
    if (!value) throw new Error(`Base "${key}" is not materialized`);
    return value;
  };

  console.log(`Reading local WeChat data via ${WECHAT_BIN}...`);
  const contacts = runWechatCli(["contacts"]);
  const sessions = runWechatCli(["sessions", "--limit", "200"]);
  const sessionByUsername = new Map(sessions.map((session) => [session.username, session]));
  const people = contacts.filter((contact) => !isGroup(contact.username));
  console.log(`  ${people.length} local contacts, ${sessions.length} recent sessions`);

  const [peopleRows, actionRows, settingsRows] = await Promise.all([
    listAll(client, baseId("people")),
    listAll(client, baseId("actions")),
    listAll(client, baseId("settings")),
  ]);
  const peopleByUsername = new Map(peopleRows.map((record) => [fieldValue(record, "username"), record]));
  const openPersonIds = new Set(
    actionRows
      .filter((record) =>
        ["needs-review", "changes-requested", "approved", "snoozed"].includes(fieldValue(record, "status")),
      )
      .flatMap((record) => fieldValue(record, "person") || []),
  );
  const rules = settingsRows.find((record) => fieldValue(record, "kind") === "followup-rules");
  const staleDays = Number(fieldValue(rules, "value")) || DEFAULT_STALE_DAYS;
  const now = new Date().toISOString();
  const proposedActions = [];
  let updates = 0;
  let untracked = 0;

  for (const contact of people) {
    const session = sessionByUsername.get(contact.username);
    const existing = peopleByUsername.get(contact.username);
    const fields = {
      "display-name": contact.nick_name || contact.username,
      username: contact.username,
      "wechat-remark": contact.remark || "",
      ...(session
        ? {
            "last-message-at": new Date(session.timestamp * 1000).toISOString(),
            "last-message-summary": session.last_message || "",
            "unread-count": session.unread || 0,
          }
        : {}),
      "last-synced-at": now,
    };
    if (!existing) {
      untracked += 1;
      continue;
    }
    updates += 1;
    if (apply) {
      await client.records.changeRequest({
        recordId: existing.id,
        operation: "update",
        fields,
        message: `Refresh focused WeChat person ${fields["display-name"]}`,
        author: appConfig.appId,
        baseCommitId: existing.headCommitId || existing.headCommit?.id,
        autoMerge: true,
      });
    }

    const lastMessageAt = session ? new Date(session.timestamp * 1000).toISOString() : null;
    const silentDays = Math.floor(daysSince(lastMessageAt));
    const muted =
      fieldValue(existing, "relationship-type") === "other" && fieldValue(existing, "relationship-strength") === 0;
    if (existing && !muted && !openPersonIds.has(existing.id) && silentDays >= staleDays) {
      proposedActions.push({ existing, contact, silentDays, lastMessageAt });
    }
  }

  for (const candidate of proposedActions) {
    const title = `重新联系 ${candidate.contact.nick_name || candidate.contact.username}`;
    console.log(`  action: ${title} (${candidate.silentDays} days)`);
    if (apply) {
      await client.bases.createChangeRequest({
        baseId: baseId("actions"),
        fields: {
          title,
          person: [candidate.existing.id],
          "action-type": "reconnect",
          rationale: `${candidate.silentDays} 天未互动，建议先恢复自然交流。`,
          "suggested-message": "最近怎么样？想到你了，来问候一下。",
          "evidence-summary": candidate.lastMessageAt
            ? `最近消息时间：${candidate.lastMessageAt}`
            : "近期会话中没有找到互动。",
          priority: "medium",
          confidence: 0.55,
          status: "needs-review",
        },
        message: `Suggest reconnecting with ${candidate.contact.nick_name || candidate.contact.username}`,
        submittedBy: appConfig.appId,
        idempotencyKey: `wechat-reconnect:${candidate.contact.username}:${candidate.lastMessageAt || "none"}`,
        autoMerge: true,
      });
    }
  }

  const syncState = settingsRows.find((record) => fieldValue(record, "kind") === "sync-state");
  const syncFields = {
    kind: "sync-state",
    status: "ready",
    value: "focused contacts refreshed from local WeChat",
    "last-sync-at": now,
    "people-count": peopleRows.length,
  };
  if (apply) {
    if (syncState) {
      await client.records.changeRequest({
        recordId: syncState.id,
        operation: "update",
        fields: syncFields,
        message: "Update WeChat connector sync state",
        author: appConfig.appId,
        baseCommitId: syncState.headCommitId || syncState.headCommit?.id,
        autoMerge: true,
      });
    } else {
      await client.bases.createChangeRequest({
        baseId: baseId("settings"),
        fields: syncFields,
        message: "Create WeChat connector sync state",
        submittedBy: appConfig.appId,
        idempotencyKey: "wechat-sync-state",
        autoMerge: true,
      });
    }
  }

  console.log(
    `${updates} focused people to refresh, ${untracked} contacts kept local, ${proposedActions.length} actions to add${apply ? "" : " (dry run)"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
