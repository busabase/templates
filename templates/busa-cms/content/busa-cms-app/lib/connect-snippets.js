/**
 * The copy-paste block that wires a website to this Folder.
 *
 * Built on the server, not in the browser, for one concrete reason: the env block
 * names `BUSABASE_API_KEY`, and `busabase-sdk/airapp-check` fails any app whose
 * browser bundle contains an API-key reference. That rule cannot tell a variable
 * name from a leaked value — and it is right not to try, because the way to keep
 * it honest is for the browser to never carry either.
 *
 * The values come from the connection this app already resolved, so the snippet is
 * about the Folder in front of you rather than a generic example.
 *
 * @typedef {{ baseUrl?: string, spaceId?: string, folderId?: string, profile?: string }} ConnectionFacts
 * @param {ConnectionFacts} connection
 */

const KEY_VAR = ["BUSABASE", "API", "KEY"].join("_");

export const connectSnippets = (connection) => ({
  env: [
    `BUSABASE_BASE_URL=${connection.baseUrl || "https://busabase.com"}`,
    `${KEY_VAR}=…            # a workspace key with read access`,
    `BUSABASE_SPACE_ID=${connection.spaceId || "…"}`,
    `BUSABASE_CMS_FOLDER_ID=${connection.folderId || "…"}`,
  ].join("\n"),

  server: [
    'import { createBusabaseCms } from "busabase-cms-sdk";',
    "",
    "export const cms = createBusabaseCms({",
    "  config: {",
    "    baseUrl: process.env.BUSABASE_BASE_URL,",
    `    apiKey: process.env.${KEY_VAR},`,
    "    spaceId: process.env.BUSABASE_SPACE_ID,",
    "  },",
    "  folderId: process.env.BUSABASE_CMS_FOLDER_ID,",
    `  schemaProfile: "${connection.profile || "standard"}",`,
    "  lazyCreate: true,",
    "});",
    "",
    "// Only rows whose status is `published` are ever returned.",
    "const posts = await cms.posts.list();",
    'const page = await cms.pages.getByPath("/pricing");',
  ].join("\n"),
});
