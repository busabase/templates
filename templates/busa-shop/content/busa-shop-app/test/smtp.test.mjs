// The SMTP client (src/smtp.js) against a scripted socket that behaves like
// Cloudflare's `connect()` (STARTTLS, a refused login, a lost connection),
// and through scripts/node-sockets.mjs against a real SMTP server on
// localhost (test/fake-smtp.mjs).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createNodeSockets } from "../scripts/node-sockets.mjs";
import { buildMessage, dotStuff, encodeHeaderWords, isSafeAddress, sendMail, SmtpError } from "../src/smtp.js";
import { startFakeSmtp } from "./fake-smtp.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A Cloudflare-style socket driven by a script: `reply(line)` decides what the
 * server says to each line the client writes. `startTls()` returns a second
 * socket ("TLS") with the same script, and records that it happened.
 */
const scriptedConnect = (reply, record = { connects: [], written: [], tls: 0 }) => {
  const make = (secure) => {
    let push;
    const readable = new ReadableStream({
      start(controller) {
        push = (text) => controller.enqueue(encoder.encode(text));
      },
    });
    const writable = new WritableStream({
      write(chunk) {
        const text = decoder.decode(chunk);
        record.written.push({ secure, text });
        for (const line of text.split("\r\n").filter(Boolean)) {
          const answer = reply(line, { secure, record });
          if (answer) push(`${answer}\r\n`);
        }
      },
    });
    return {
      readable,
      writable,
      opened: Promise.resolve({}),
      close: async () => {},
      startTls: () => {
        record.tls += 1;
        return make(true);
      },
      greet: () => push("220 mail.test ESMTP\r\n"),
    };
  };
  const connect = (address, options) => {
    record.connects.push({ address, options });
    const socket = make(options.secureTransport === "on");
    queueMicrotask(socket.greet);
    return socket;
  };
  return { connect, record };
};

const message = (overrides = {}) => ({
  tag: "payment-receipt",
  from: "shop@tumbleberry.example",
  fromName: "Tumbleberry Toys",
  to: "mia.jensen@example.com",
  replyTo: "hello@tumbleberry.example",
  subject: "Order ORD-7K2M9QX4PT confirmed: payment received",
  text: "Hello Mia,\n.\nThank you.",
  html: "<p>Hello Mia</p>",
  ...overrides,
});

// A well-behaved server: STARTTLS only before TLS, AUTH PLAIN after it.
const goodServer = (line, { secure }) => {
  const verb = line.split(" ")[0].toUpperCase();
  if (verb === "EHLO") return secure ? "250-mail.test\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME" : "250-mail.test\r\n250-STARTTLS\r\n250 8BITMIME";
  if (verb === "STARTTLS") return "220 2.0.0 Ready to start TLS";
  if (verb === "AUTH") return Buffer.from(line.split(" ")[2] ?? "", "base64").toString() === "\u0000shop@tumbleberry.example\u0000app-password" ? "235 ok" : "535 5.7.8 bad credentials";
  if (verb === "MAIL" || verb === "RCPT" || verb === "RSET") return "250 ok";
  if (verb === "DATA") return "354 go ahead";
  if (line === ".") return "250 queued as 1";
  if (verb === "QUIT") return "221 bye";
  return null;
};

describe("sendMail on a Cloudflare-style socket", () => {
  it("STARTTLS: plain connect, EHLO, STARTTLS, EHLO again over TLS, then the login and the message", async () => {
    const { connect, record } = scriptedConnect(goodServer);
    const results = await sendMail({
      connect,
      host: "smtp.example.com",
      port: 587,
      security: "starttls",
      username: "shop@tumbleberry.example",
      password: "app-password",
      heloName: "shop.example",
      messages: [message(), message({ tag: "owner-paid", to: "owner@tumbleberry.example" })],
    });
    assert.deepEqual(results, [
      { tag: "payment-receipt", to: "mia.jensen@example.com", ok: true },
      { tag: "owner-paid", to: "owner@tumbleberry.example", ok: true },
    ]);
    assert.deepEqual(record.connects[0], { address: { hostname: "smtp.example.com", port: 587 }, options: { secureTransport: "starttls", allowHalfOpen: false } });
    assert.equal(record.tls, 1);
    const plain = record.written.filter((entry) => !entry.secure).map((entry) => entry.text.trim());
    assert.deepEqual(plain, ["EHLO shop.example", "STARTTLS"], "nothing but EHLO and STARTTLS before TLS: no password in the clear");
    const secure = record.written.filter((entry) => entry.secure).map((entry) => entry.text);
    assert.equal(secure[0], "EHLO shop.example\r\n");
    assert.match(secure[1], /^AUTH PLAIN /);
    assert.ok(secure.some((text) => text === "MAIL FROM:<shop@tumbleberry.example>\r\n"));
    const data = secure.find((text) => text.includes("Subject:"));
    assert.match(data, /\r\n\.\r\n$/, "ends with the terminating dot line");
  });

  it("implicit TLS on 465 connects secure from the first byte and never calls STARTTLS", async () => {
    const { connect, record } = scriptedConnect((line, context) => goodServer(line, { ...context, secure: true }));
    const results = await sendMail({ connect, host: "smtp.example.com", port: 465, security: "tls", username: "shop@tumbleberry.example", password: "app-password", messages: [message()] });
    assert.equal(results[0].ok, true);
    assert.equal(record.connects[0].options.secureTransport, "on");
    assert.equal(record.tls, 0);
  });

  it("refuses to go on when the server offers no STARTTLS, before any password is sent", async () => {
    const { connect, record } = scriptedConnect((line, context) => (line.startsWith("EHLO") ? "250-mail.test\r\n250 AUTH PLAIN" : goodServer(line, context)));
    await assert.rejects(
      sendMail({ connect, host: "smtp.example.com", port: 587, security: "starttls", username: "u@x.example", password: "pw", messages: [message()] }),
      (error) => error instanceof SmtpError && /does not offer STARTTLS/.test(error.message),
    );
    assert.ok(!record.written.some((entry) => /AUTH/.test(entry.text)));
  });

  it("a refused login rejects with the server's answer and never repeats the password", async () => {
    const { connect } = scriptedConnect(goodServer);
    await assert.rejects(
      sendMail({ connect, host: "smtp.example.com", port: 587, security: "starttls", username: "shop@tumbleberry.example", password: "wrong", messages: [message()] }),
      (error) => /login: the mail server answered 535 5\.7\.8 bad credentials/.test(error.message) && !error.message.includes("wrong"),
    );
  });

  it("one refused recipient does not stop the next message", async () => {
    const { connect } = scriptedConnect((line, context) => (line === "RCPT TO:<bounce@example.com>" ? "550 5.1.1 no such user" : goodServer(line, context)));
    const results = await sendMail({
      connect,
      host: "smtp.example.com",
      port: 587,
      security: "starttls",
      username: "shop@tumbleberry.example",
      password: "app-password",
      messages: [message({ to: "bounce@example.com" }), message()],
    });
    assert.equal(results[0].ok, false);
    assert.match(results[0].error, /recipient refused: the mail server answered 550/);
    assert.equal(results[1].ok, true);
  });

  it("times out instead of hanging on a silent server", async () => {
    const { connect } = scriptedConnect(() => null);
    await assert.rejects(
      sendMail({ connect, host: "smtp.example.com", port: 587, security: "starttls", messages: [message()], timeoutMs: 50 }),
      /no answer from the mail server/,
    );
  });

  it("never sends a password without encryption, refuses port 25, and needs a connect()", async () => {
    const { connect, record } = scriptedConnect((line, context) => (line.startsWith("EHLO") ? "250 mail.test" : goodServer(line, context)));
    const results = await sendMail({ connect, host: "127.0.0.1", port: 1025, security: "none", username: "u@x.example", password: "pw", messages: [message()] });
    assert.equal(results[0].ok, true);
    assert.ok(!record.written.some((entry) => /AUTH/.test(entry.text)), "security none: no AUTH at all");
    await assert.rejects(sendMail({ connect, host: "h", port: 25, messages: [] }), /port 25 is blocked/);
    await assert.rejects(sendMail({ connect: null, host: "h", port: 587, messages: [] }), /cannot open a mail connection/);
    await assert.rejects(sendMail({ connect, host: "h", port: 587, username: "u@x.example", password: "", messages: [] }), /password is missing/);
  });
});

describe("the message", () => {
  it("is UTF-8 text and HTML in base64, with encoded headers that cannot be split", () => {
    const raw = buildMessage({ ...message({ subject: "Bestellung ORD-7K2M9QX4PT bestätigt: Zahlung erhalten", fromName: "Tumbleberry Spielwaren" }), now: new Date("2026-11-07T10:00:00Z") });
    assert.match(raw, /^From: "Tumbleberry Spielwaren" <shop@tumbleberry\.example>\r\n/);
    assert.match(raw, /\r\nTo: <mia\.jensen@example\.com>\r\n/);
    assert.match(raw, /\r\nReply-To: <hello@tumbleberry\.example>\r\n/);
    assert.match(raw, /\r\nSubject: =\?UTF-8\?B\?/);
    assert.match(raw, /\r\nDate: Sat, 07 Nov 2026 10:00:00 \+0000\r\n/);
    assert.match(raw, /\r\nMessage-ID: <[0-9a-f]{24}@tumbleberry\.example>\r\n/);
    assert.match(raw, /\r\nAuto-Submitted: auto-generated\r\n/);
    assert.ok(raw.split("\r\n").every((line) => line.length <= 998));
    const subject = /Subject: ([^]*?)\r\n(?=\S)/.exec(raw)[1];
    const decoded = subject.replace(/\r\n /g, "").replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (match, data) => Buffer.from(data, "base64").toString());
    assert.equal(decoded, "Bestellung ORD-7K2M9QX4PT bestätigt: Zahlung erhalten");
    assert.throws(() => encodeHeaderWords("Hi\r\nBcc: victim@example.com"), /line break/);
    assert.throws(() => buildMessage(message({ to: "a@b.example>\r\nBcc: <c@d.example" })), /not a usable email address/);
    assert.ok(isSafeAddress("mia.jensen@example.com") && !isSafeAddress("mia <x>@example.com") && !isSafeAddress("a@b"));
    assert.equal(dotStuff(".a\n..b\nc"), "..a\r\n...b\r\nc\r\n.\r\n");
  });
});

describe("through Node sockets to a real SMTP server", () => {
  let smtp;
  before(async () => {
    smtp = await startFakeSmtp({ requireAuth: null });
  });
  after(async () => smtp.close());

  it("delivers two messages in one session, readable on the other side", async () => {
    const { connect } = createNodeSockets();
    const results = await sendMail({
      connect,
      host: smtp.host,
      port: smtp.port,
      security: "none",
      heloName: "shop.test",
      messages: [message(), message({ tag: "owner-paid", to: "owner@tumbleberry.example", subject: "New paid order ORD-7K2M9QX4PT · $78.40", text: "New order", html: "<p>New</p>" })],
    });
    assert.deepEqual(results.map((result) => result.ok), [true, true]);
    assert.equal(smtp.messages.length, 2);
    assert.deepEqual(smtp.messages[0].envelope, { from: "shop@tumbleberry.example", to: ["mia.jensen@example.com"] });
    assert.equal(smtp.messages[0].subject, "Order ORD-7K2M9QX4PT confirmed: payment received");
    assert.equal(smtp.messages[0].text, "Hello Mia,\r\n.\r\nThank you.".replace(/\r\n/g, "\n"), "a line that is only a dot survives");
    assert.equal(smtp.messages[1].to, "<owner@tumbleberry.example>");
    assert.equal(smtp.sessions.length, 1);
  });
});
