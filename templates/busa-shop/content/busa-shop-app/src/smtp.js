// A minimal SMTP client for the Website engine (a Cloudflare Worker), written
// against Cloudflare's TCP socket API, `connect()` from `cloudflare:sockets`:
// https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
//
// Why not a library: the one maintained Workers SMTP client (worker-mailer,
// MIT) imports `cloudflare:sockets` statically, and a static import cannot be
// in vendor/worker.js: the same bundle runs in the browser engine (Busabase
// Cloud Free) and in Node (npm run dev), where that module does not exist.
// Here `connect` is passed in: src/handler.js loads it lazily on the Website
// engine, scripts/node-sockets.mjs provides one for Node, the tests a mock.
//
// What it does, and nothing more (RFC 5321 / 3207 / 4954 / 2045 / 2047):
//   - `tls`      implicit TLS from the first byte (usually port 465);
//   - `starttls` plain connect, EHLO, STARTTLS, then everything over TLS
//                (usually port 587); refuses to go on if the server does not
//                offer STARTTLS;
//   - `none`     no encryption, for a local test mail catcher only: it then
//                never sends a password, even when one is configured.
//   AUTH PLAIN (or LOGIN when that is all the server offers), one session for
//   several messages, a UTF-8 text + HTML body in base64, a timeout on every
//   reply. Cloudflare blocks outbound port 25, so 587 or 465 it is.
//
// It never logs or returns the password; errors carry the server's reply text
// (cut short), which never echoes it.

export const SMTP_SECURITY = ["starttls", "tls", "none"];
export const DEFAULT_TIMEOUT_MS = 15_000;

export class SmtpError extends Error {
  constructor(message, { code = 0, stage = "" } = {}) {
    super(message);
    this.name = "SmtpError";
    this.code = code;
    this.stage = stage;
  }
}

const encoder = new TextEncoder();

const toBase64 = (text) => {
  const bytes = encoder.encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const wrap76 = (base64) => base64.replace(/.{1,76}/g, "$&\r\n").replace(/\r\n$/, "");

// eslint-disable-next-line no-control-regex
const UNSAFE_HEADER = /[\r\n\u0000]/;
const ADDRESS = /^[^\s<>()",;:\\@]+@[^\s<>()",;:\\@]+\.[^\s<>()",;:\\@]+$/;

/** An address that can go into `MAIL FROM:<…>` and a header without changing either. */
export const isSafeAddress = (address) => typeof address === "string" && address.length <= 254 && ADDRESS.test(address);

/** RFC 2047 encoded-words, each at most 75 characters, folded onto continuation lines. */
export const encodeHeaderWords = (value) => {
  const text = String(value ?? "");
  if (UNSAFE_HEADER.test(text)) throw new SmtpError("header value contains a line break");
  // Plain ASCII without specials and short enough stays readable.
  if (/^[\x20-\x7e]*$/.test(text) && text.length <= 70 && !/=\?/.test(text)) return text;
  const words = [];
  let chunk = "";
  for (const char of text) {
    if (encoder.encode(chunk + char).length > 45) {
      words.push(`=?UTF-8?B?${toBase64(chunk)}?=`);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(`=?UTF-8?B?${toBase64(chunk)}?=`);
  return words.join("\r\n ");
};

const mailbox = (address, name) => {
  if (!isSafeAddress(address)) throw new SmtpError(`not a usable email address: ${String(address).slice(0, 80)}`);
  if (!name) return `<${address}>`;
  const display = /^[A-Za-z0-9 !#$%&'*+\-/=?^_`{|}~.]*$/.test(name) && name.length <= 60 ? `"${name}"` : encodeHeaderWords(name);
  return `${display} <${address}>`;
};

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/**
 * One RFC 5322 message: UTF-8 text and HTML alternatives, base64, CRLF line
 * ends. `now` is for tests; the message id is random.
 */
export const buildMessage = ({ from, fromName, to, replyTo, subject, text, html, now = new Date() }) => {
  const domain = from.split("@")[1] ?? "localhost";
  const boundary = `busa-shop-${randomToken()}`;
  const headers = [
    `From: ${mailbox(from, fromName)}`,
    `To: ${mailbox(to)}`,
    ...(replyTo && replyTo !== from ? [`Reply-To: ${mailbox(replyTo)}`] : []),
    `Subject: ${encodeHeaderWords(subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomToken()}@${domain}>`,
    "MIME-Version: 1.0",
    // Automatic mail: no out-of-office replies to the shop (RFC 3834).
    "Auto-Submitted: auto-generated",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type, body) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", wrap76(toBase64(body))].join("\r\n");
  return [...headers, "", part("text/plain", text), part("text/html", html ?? ""), `--${boundary}--`, ""].join("\r\n");
};

/** DATA's body: lines that start with "." get another one, and the terminating dot line. */
export const dotStuff = (message) => `${message.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..")}\r\n.\r\n`;

const timeout = (ms, stage) => {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new SmtpError(`no answer from the mail server within ${Math.round(ms / 1000)} s`, { stage })), ms);
  });
  return { promise, clear: () => clearTimeout(timer) };
};

const withTimeout = async (work, ms, stage) => {
  const timer = timeout(ms, stage);
  try {
    return await Promise.race([work, timer.promise]);
  } finally {
    timer.clear();
  }
};

/** Line reader + writer over one socket. Released before STARTTLS replaces the socket. */
const channel = (socket, timeoutMs) => {
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  let buffer = "";
  const readReply = async (stage) => {
    const lines = [];
    const read = async () => {
      for (;;) {
        let index = buffer.indexOf("\n");
        while (index !== -1) {
          const line = buffer.slice(0, index).replace(/\r$/, "");
          buffer = buffer.slice(index + 1);
          lines.push(line);
          if (/^\d{3}(?: |$)/.test(line)) {
            return { code: Number(line.slice(0, 3)), lines, text: lines.map((item) => item.slice(4)).join(" ").trim() };
          }
          if (!/^\d{3}-/.test(line)) throw new SmtpError(`unexpected reply from the mail server: ${line.slice(0, 120)}`, { stage });
          index = buffer.indexOf("\n");
        }
        const { value, done } = await reader.read();
        if (done) throw new SmtpError("the mail server closed the connection", { stage });
        buffer += decoder.decode(value, { stream: true });
      }
    };
    return withTimeout(read(), timeoutMs, stage);
  };
  const write = (line) => withTimeout(writer.write(encoder.encode(line)), timeoutMs, "write");
  const release = () => {
    reader.releaseLock();
    writer.releaseLock();
  };
  return { readReply, write, release };
};

const expect = (reply, codes, stage) => {
  if (!codes.includes(reply.code)) {
    throw new SmtpError(`${stage}: the mail server answered ${reply.code} ${reply.text.slice(0, 160)}`.trim(), { code: reply.code, stage });
  }
  return reply;
};

const capabilities = (reply) => {
  const caps = new Map();
  for (const line of reply.lines.slice(1)) {
    const [name, ...rest] = line.slice(4).trim().split(/\s+/);
    if (name) caps.set(name.toUpperCase(), rest.map((item) => item.toUpperCase()));
  }
  return caps;
};

/**
 * Send `messages` (each `{ from, fromName, to, replyTo, subject, text, html, tag }`)
 * in one SMTP session. Resolves to one result per message,
 * `{ tag, to, ok: true }` or `{ tag, to, ok: false, error }`; rejects only
 * when the session itself could not be set up (connect, TLS, login), with an
 * SmtpError.
 */
export const sendMail = async ({
  connect,
  host,
  port,
  security = "starttls",
  username = "",
  password = "",
  heloName = "busa-shop.invalid",
  messages,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  if (typeof connect !== "function") throw new SmtpError("this engine cannot open a mail connection", { stage: "connect" });
  if (!SMTP_SECURITY.includes(security)) throw new SmtpError(`unknown SMTP security "${security}"`, { stage: "connect" });
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) throw new SmtpError("the mail server host or port is missing", { stage: "connect" });
  if (port === 25) throw new SmtpError("port 25 is blocked for websites: use 587 (STARTTLS) or 465 (TLS)", { stage: "connect" });
  const sendPassword = Boolean(username) && security !== "none";
  if (username && !password && security !== "none") throw new SmtpError("the SMTP password is missing from the Vault", { stage: "auth" });

  let socket = connect({ hostname: host, port }, { secureTransport: security === "tls" ? "on" : security === "starttls" ? "starttls" : "off", allowHalfOpen: false });
  const results = [];
  try {
    if (socket.opened) await withTimeout(socket.opened, timeoutMs, "connect");
    let io = channel(socket, timeoutMs);
    expect(await io.readReply("greeting"), [220], "greeting");
    await io.write(`EHLO ${heloName}\r\n`);
    let ehlo = expect(await io.readReply("EHLO"), [250], "EHLO");
    if (security === "starttls") {
      if (!capabilities(ehlo).has("STARTTLS")) throw new SmtpError("the mail server does not offer STARTTLS on this port", { stage: "STARTTLS" });
      await io.write("STARTTLS\r\n");
      expect(await io.readReply("STARTTLS"), [220], "STARTTLS");
      io.release();
      socket = socket.startTls();
      io = channel(socket, timeoutMs);
      await io.write(`EHLO ${heloName}\r\n`);
      ehlo = expect(await io.readReply("EHLO"), [250], "EHLO");
    }
    if (sendPassword) {
      const methods = capabilities(ehlo).get("AUTH") ?? [];
      if (methods.includes("PLAIN") || !methods.includes("LOGIN")) {
        await io.write(`AUTH PLAIN ${toBase64(`\u0000${username}\u0000${password}`)}\r\n`);
        expect(await io.readReply("AUTH"), [235], "login");
      } else {
        await io.write("AUTH LOGIN\r\n");
        expect(await io.readReply("AUTH"), [334], "login");
        await io.write(`${toBase64(username)}\r\n`);
        expect(await io.readReply("AUTH"), [334], "login");
        await io.write(`${toBase64(password)}\r\n`);
        expect(await io.readReply("AUTH"), [235], "login");
      }
    }
    for (const message of messages) {
      try {
        if (!isSafeAddress(message.from)) throw new SmtpError("the sender address in Settings is not usable", { stage: "MAIL FROM" });
        if (!isSafeAddress(message.to)) throw new SmtpError("the recipient address is not usable", { stage: "RCPT TO" });
        const data = dotStuff(buildMessage(message));
        await io.write(`MAIL FROM:<${message.from}>\r\n`);
        expect(await io.readReply("MAIL FROM"), [250], "sender refused");
        await io.write(`RCPT TO:<${message.to}>\r\n`);
        expect(await io.readReply("RCPT TO"), [250, 251], "recipient refused");
        await io.write("DATA\r\n");
        expect(await io.readReply("DATA"), [354], "DATA");
        await io.write(data);
        expect(await io.readReply("message"), [250], "message refused");
        results.push({ tag: message.tag, to: message.to, ok: true });
      } catch (error) {
        results.push({ tag: message.tag, to: message.to, ok: false, error: error?.message ?? String(error) });
        // A refused message leaves the session usable after RSET; a dead one does not.
        if (error?.code) {
          await io.write("RSET\r\n");
          await io.readReply("RSET").catch(() => null);
        } else {
          for (const rest of messages.slice(results.length)) {
            results.push({ tag: rest.tag, to: rest.to, ok: false, error: "not sent: the connection to the mail server was lost" });
          }
          break;
        }
      }
    }
    await io.write("QUIT\r\n").catch(() => null);
    await io.readReply("QUIT").catch(() => null);
  } finally {
    try {
      await socket.close?.();
    } catch {
      // already closed
    }
  }
  return results;
};
