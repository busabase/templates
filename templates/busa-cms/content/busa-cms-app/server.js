import { serve } from "@hono/node-server";
import { app } from "./server/hono.js";

const hostname = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, hostname, port }, (info) => {
  // Wording matters: the Local Node engine discovers which port to reverse-proxy
  // by matching this line against READY_PORT_PATTERNS in busabase-core's
  // local-node-runtime.ts. Keep "listening on port <n>" in it.
  console.log(`Busa CMS AirApp listening on port ${info.port} (http://${hostname}:${info.port})`);
});
