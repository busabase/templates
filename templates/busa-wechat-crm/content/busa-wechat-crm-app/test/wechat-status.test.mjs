import assert from "node:assert/strict";
import test from "node:test";
import { readWechatStatus, searchWechatContacts } from "../wechat-status.mjs";

test("returns only sanitized readiness for a healthy connector", async () => {
  let contactArgs;
  const execute = async (_bin, args) => {
    if (args[0] === "--version") return { stdout: "wechat-cli-rs 0.1.3\n", stderr: "" };
    if (args[0] === "sessions") {
      return { stdout: JSON.stringify([{ chat: "private chat", last_message: "private message" }]), stderr: "" };
    }
    contactArgs = args;
    return {
      stdout: JSON.stringify([
        { username: "wxid_private", nick_name: "Private name" },
        { username: "room@chatroom", nick_name: "Private group" },
      ]),
      stderr: "",
    };
  };
  const status = await readWechatStatus({ execute });
  assert.equal(status.ready, true);
  assert.equal(status.state, "ready");
  assert.equal(status.version, "0.1.3");
  assert.equal(status.contactsCount, 2);
  assert.equal(status.sessionsReadable, true);
  assert.deepEqual(contactArgs, ["contacts", "--limit", "500", "--format", "json"]);
  assert.equal(JSON.stringify(status).includes("Private"), false);
});

test("distinguishes an installed but uninitialized connector", async () => {
  const execute = async (_bin, args) => {
    if (args[0] === "--version") return { stdout: "wechat-cli-rs 0.1.3\n", stderr: "" };
    const error = Object.assign(new Error("failed"), {
      stderr: "缺少配置文件，请先运行 wechat-cli-rs init",
    });
    throw error;
  };
  const status = await readWechatStatus({ execute });
  assert.equal(status.ready, false);
  assert.equal(status.state, "not_initialized");
  assert.equal(status.installed, true);
  assert.equal(status.initialized, false);
});

test("searches people locally without returning groups or unrelated contacts", async () => {
  let contactArgs;
  const execute = async (_bin, args) => {
    contactArgs = args;
    return {
      stdout: JSON.stringify([
        { username: "wxid_chen", nick_name: "陈老板", remark: "连锁餐饮" },
        { username: "wxid_other", nick_name: "小雨", remark: "摄影" },
        { username: "growth@chatroom", nick_name: "餐饮增长群", remark: "" },
      ]),
      stderr: "",
    };
  };
  const result = await searchWechatContacts("餐饮", { execute });
  assert.equal(result.totalMatches, 1);
  assert.deepEqual(contactArgs, ["contacts", "--query", "餐饮", "--limit", "20", "--format", "json"]);
  assert.deepEqual(result.results, [{ username: "wxid_chen", displayName: "陈老板", remark: "连锁餐饮" }]);
});

test("an empty query never enumerates the address book", async () => {
  let called = false;
  const result = await searchWechatContacts("", {
    execute: async () => {
      called = true;
      return { stdout: "[]", stderr: "" };
    },
  });
  assert.deepEqual(result, { query: "", totalMatches: 0, results: [] });
  assert.equal(called, false);
});
