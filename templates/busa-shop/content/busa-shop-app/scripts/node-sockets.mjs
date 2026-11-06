// Cloudflare's `connect()` (cloudflare:sockets), rebuilt on Node's net and tls,
// so the website's SMTP client (src/smtp.js) runs unchanged in a local
// preview (`npm run dev`) and in tests against a real mail server. Busabase
// never uses this: on the Website engine the Worker gets Cloudflare's own.
//
//   connect({ hostname, port }, { secureTransport: "off" | "on" | "starttls" })
//     → { readable, writable, opened, closed, close(), startTls() }
//
// `ca` (PEM) adds a certificate authority to trust, for a local test server
// with its own certificate. Certificates are always verified.
import net from "node:net";
import tls from "node:tls";

const wrap = (nodeSocket, { hostname, ca, secureTransport, connectEvent }) => {
  let onData;
  let onEnd;
  let onError;
  const readable = new ReadableStream({
    start(controller) {
      onData = (chunk) => controller.enqueue(new Uint8Array(chunk));
      onEnd = () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      onError = (error) => {
        try {
          controller.error(error);
        } catch {
          // already errored
        }
      };
      nodeSocket.on("data", onData);
      nodeSocket.on("end", onEnd);
      nodeSocket.on("error", onError);
    },
    cancel() {
      nodeSocket.destroy();
    },
  });
  const writable = new WritableStream({
    write(chunk) {
      return new Promise((resolve, reject) => nodeSocket.write(chunk, (error) => (error ? reject(error) : resolve())));
    },
    close() {
      nodeSocket.end();
    },
  });
  const opened = new Promise((resolve, reject) => {
    nodeSocket.once(connectEvent, () => resolve({}));
    nodeSocket.once("error", reject);
  });
  opened.catch(() => {});
  const closed = new Promise((resolve) => nodeSocket.once("close", resolve));
  return {
    readable,
    writable,
    opened,
    closed,
    close: async () => {
      nodeSocket.destroy();
    },
    startTls: () => {
      if (secureTransport !== "starttls") throw new Error("startTls() needs secureTransport: \"starttls\"");
      nodeSocket.off("data", onData);
      nodeSocket.off("end", onEnd);
      nodeSocket.off("error", onError);
      const secure = tls.connect({ socket: nodeSocket, servername: hostname, ca });
      return wrap(secure, { hostname, ca, secureTransport: "on", connectEvent: "secureConnect" });
    },
  };
};

export const createNodeSockets = ({ ca } = {}) => ({
  connect: ({ hostname, port }, { secureTransport = "off" } = {}) => {
    if (secureTransport === "on") {
      const socket = tls.connect({ host: hostname, port, servername: hostname, ca });
      return wrap(socket, { hostname, ca, secureTransport, connectEvent: "secureConnect" });
    }
    const socket = net.connect({ host: hostname, port });
    return wrap(socket, { hostname, ca, secureTransport, connectEvent: "connect" });
  },
});
