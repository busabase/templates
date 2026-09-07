import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const commandOptions = {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
  timeout: 30_000,
};

const parseArray = (value) => {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("EXPECTED_JSON_ARRAY");
  return parsed;
};

const failedState = (error) => {
  if (error?.code === "ENOENT") return "missing";
  const stderr = String(error?.stderr || "");
  if (/请先运行.*init|缺少配置文件/.test(stderr)) return "not_initialized";
  if (error?.killed || error?.signal === "SIGTERM") return "timed_out";
  return "data_access_failed";
};

/**
 * @param {{
 *   bin?: string;
 *   execute?: (file: string, args: string[], options: typeof commandOptions) => Promise<{ stdout: string; stderr: string }>;
 * }} options
 */
export async function readWechatStatus(options = {}) {
  const bin = options.bin || process.env.WECHAT_CLI_BIN || "wechat-cli-rs";
  const execute =
    options.execute ||
    (async (file, args, execOptions) => {
      const result = await execFile(file, args, execOptions);
      return { stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
    });
  const checkedAt = new Date().toISOString();
  let version = "";

  try {
    const result = await execute(bin, ["--version"], commandOptions);
    version = String(result.stdout || "")
      .trim()
      .replace(/^wechat-cli-rs\s+/, "");
  } catch (error) {
    return {
      ready: false,
      state: failedState(error),
      installed: false,
      initialized: false,
      version: "",
      contactsCount: 0,
      sessionsReadable: false,
      checkedAt,
    };
  }

  try {
    const sessionsResult = await execute(bin, ["sessions", "--limit", "1", "--format", "json"], commandOptions);
    parseArray(sessionsResult.stdout);
  } catch (error) {
    const state = failedState(error);
    return {
      ready: false,
      state,
      installed: true,
      initialized: state !== "not_initialized",
      version,
      contactsCount: 0,
      sessionsReadable: false,
      checkedAt,
    };
  }

  try {
    const contactsResult = await execute(bin, ["contacts", "--limit", "500", "--format", "json"], commandOptions);
    const contacts = parseArray(contactsResult.stdout);
    return {
      ready: true,
      state: "ready",
      installed: true,
      initialized: true,
      version,
      contactsCount: contacts.length,
      sessionsReadable: true,
      checkedAt,
    };
  } catch (error) {
    return {
      ready: false,
      state: failedState(error),
      installed: true,
      initialized: true,
      version,
      contactsCount: 0,
      sessionsReadable: true,
      checkedAt,
    };
  }
}

/**
 * Search stays local and deliberately returns only the identity fields needed
 * for an explicit People promotion. An empty query never enumerates the full
 * address book.
 *
 * @param {string} query
 * @param {{
 *   bin?: string;
 *   execute?: (file: string, args: string[], options: typeof commandOptions) => Promise<{ stdout: string; stderr: string }>;
 * }} options
 */
export async function searchWechatContacts(query, options = {}) {
  const normalizedQuery = String(query || "")
    .trim()
    .toLocaleLowerCase();
  if (!normalizedQuery) return { query: "", totalMatches: 0, results: [] };

  const bin = options.bin || process.env.WECHAT_CLI_BIN || "wechat-cli-rs";
  const execute =
    options.execute ||
    (async (file, args, execOptions) => {
      const result = await execFile(file, args, execOptions);
      return { stdout: String(result.stdout || ""), stderr: String(result.stderr || "") };
    });
  const result = await execute(
    bin,
    ["contacts", "--query", String(query).trim(), "--limit", "20", "--format", "json"],
    commandOptions,
  );
  const contacts = parseArray(result.stdout)
    .filter((contact) => !String(contact.username || "").includes("@chatroom"))
    .filter((contact) =>
      [contact.nick_name, contact.remark, contact.username]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery)),
    );

  return {
    query: String(query).trim(),
    totalMatches: contacts.length,
    results: contacts.slice(0, 20).map((contact) => ({
      username: String(contact.username || ""),
      displayName: String(contact.nick_name || contact.remark || contact.username || ""),
      remark: String(contact.remark || ""),
    })),
  };
}
