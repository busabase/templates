// A small SMTP server for tests (plain TCP, like a local mail catcher):
// EHLO, AUTH PLAIN / LOGIN, MAIL, RCPT, DATA, RSET, QUIT. It keeps every
// message it accepted, decoded enough to assert on (headers, the base64 text
// and HTML parts). `requireAuth` refuses mail without the right login,
// `rejectRecipients` answers 550 for those addresses.
import net from "node:net";

const decodeMessage = (raw) => {
  const [head, ...rest] = raw.split("\r\n\r\n");
  const headers = {};
  let last = "";
  for (const line of head.split("\r\n")) {
    if (/^\s/.test(line) && last) headers[last] += line.trim();
    else {
      const index = line.indexOf(":");
      last = line.slice(0, index).toLowerCase();
      headers[last] = line.slice(index + 1).trim();
    }
  }
  const decodeWords = (value) =>
    String(value ?? "").replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (match, data) => Buffer.from(data, "base64").toString("utf8")).replace(/\?=\s*=\?/g, "");
  const body = rest.join("\r\n\r\n");
  const parts = {};
  for (const block of body.split(/--busa-shop-[0-9a-f]+/)) {
    const type = /Content-Type: (text\/\w+)/.exec(block)?.[1];
    if (!type) continue;
    const data = block.split("\r\n\r\n").slice(1).join("").replace(/\s+/g, "");
    parts[type] = Buffer.from(data, "base64").toString("utf8");
  }
  return { headers, subject: decodeWords(headers.subject), from: headers.from, to: headers.to, replyTo: headers["reply-to"] ?? "", text: parts["text/plain"] ?? "", html: parts["text/html"] ?? "", raw };
};

export const startFakeSmtp = async ({ requireAuth = null, rejectRecipients = [], authMethods = "PLAIN LOGIN" } = {}) => {
  const messages = [];
  const sessions = [];
  const server = net.createServer((socket) => {
    const session = { lines: [], auth: null };
    sessions.push(session);
    let buffer = "";
    let mode = "command";
    let envelope = { from: "", to: [] };
    let data = "";
    let loginStep = 0;
    let loginUser = "";
    const say = (line) => socket.write(`${line}\r\n`);
    say("220 fake-smtp.test ESMTP ready");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (mode === "data") {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          const raw = data.replace(/^\.\./gm, ".");
          messages.push({ envelope, ...decodeMessage(raw) });
          envelope = { from: "", to: [] };
          data = "";
          mode = "command";
          say("250 2.0.0 queued");
          continue;
        }
        const index = buffer.indexOf("\r\n");
        if (index === -1) return;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        session.lines.push(line);
        if (loginStep === 1) {
          loginUser = Buffer.from(line, "base64").toString("utf8");
          loginStep = 2;
          say("334 UGFzc3dvcmQ6");
          continue;
        }
        if (loginStep === 2) {
          const pass = Buffer.from(line, "base64").toString("utf8");
          loginStep = 0;
          if (requireAuth && loginUser === requireAuth.user && pass === requireAuth.pass) {
            session.auth = loginUser;
            say("235 2.7.0 Authentication successful");
          } else say("535 5.7.8 Authentication credentials invalid");
          continue;
        }
        const verb = line.split(" ")[0].toUpperCase();
        if (verb === "EHLO" || verb === "HELO") {
          say("250-fake-smtp.test greets you");
          say(`250-AUTH ${authMethods}`);
          say("250-8BITMIME");
          say("250 SIZE 10485760");
        } else if (verb === "AUTH") {
          const [, method, initial] = line.split(" ");
          if (method.toUpperCase() === "PLAIN") {
            const [, user, pass] = Buffer.from(initial ?? "", "base64").toString("utf8").split("\u0000");
            if (requireAuth && user === requireAuth.user && pass === requireAuth.pass) {
              session.auth = user;
              say("235 2.7.0 Authentication successful");
            } else say("535 5.7.8 Authentication credentials invalid");
          } else if (method.toUpperCase() === "LOGIN") {
            loginStep = 1;
            say("334 VXNlcm5hbWU6");
          } else say("504 5.5.4 Unrecognized authentication type");
        } else if (verb === "MAIL") {
          if (requireAuth && !session.auth) say("530 5.7.0 Authentication required");
          else {
            envelope.from = /<([^>]*)>/.exec(line)?.[1] ?? "";
            say("250 2.1.0 Ok");
          }
        } else if (verb === "RCPT") {
          const to = /<([^>]*)>/.exec(line)?.[1] ?? "";
          if (rejectRecipients.includes(to)) say("550 5.1.1 Recipient address rejected");
          else {
            envelope.to.push(to);
            say("250 2.1.5 Ok");
          }
        } else if (verb === "DATA") {
          mode = "data";
          say("354 End data with <CR><LF>.<CR><LF>");
        } else if (verb === "RSET") {
          envelope = { from: "", to: [] };
          say("250 2.0.0 Ok");
        } else if (verb === "QUIT") {
          say("221 2.0.0 Bye");
          socket.end();
          return;
        } else say("502 5.5.2 Command not recognized");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    host: "127.0.0.1",
    port: server.address().port,
    messages,
    sessions,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
