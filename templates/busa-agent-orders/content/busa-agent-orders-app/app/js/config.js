// Runtime binding: this is a template, so it carries no spaceId and no
// node/base ids. Each Base is found at run time by inspectProvisionedResources,
// which matches the node stamped with this app's resourceKey (`key`) inside the
// installed Folder. Every field below mirrors content/<key>/base.json exactly
// (test/config-matches-content.test.mjs enforces it); a relation's
// targetBaseSlug is the target Base's own prefixed slug, which is what
// provisionDeclaredResources resolves in a live Space.
export const appConfig = {
  appId: "busa-agent-orders",
  appName: "Busa Agent Orders",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  accent: "#3E6B5A",
  folder: {
    name: "Busa Agent Orders",
    description:
      "Agent-channel orders and price guardrails for e-commerce sellers: orders that AI shopping agents (Meta Muse, ChatGPT, Gemini, Perplexity) bring in, with the price paid versus the price listed; per-SKU guardrails; a review queue for agent-proposed price changes; and order exceptions. The AirApp only records a person's decision; it never touches a store, a payment or a price.",
    slug: "busa-agent-orders",
  },
  airApp: { name: "Busa Agent Orders", slug: "busa-agent-orders-app", resourceKey: "busa-agent-orders-app" },
  bases: [
    {
      key: "orders",
      name: "Agent Orders",
      slug: "busa-agent-orders-orders",
      description:
        "One row per order that arrived through an AI shopping agent, with the price the agent paid and the price listed at that moment.",
      readLimit: 50,
      fields: [
        { slug: "order-no", name: "Order number", type: "text", required: true },
        { slug: "agent", name: "Agent channel", type: "select", required: true, options: { choices: [{ id: "meta-muse", name: "Meta Muse" }, { id: "chatgpt", name: "ChatGPT" }, { id: "gemini", name: "Gemini" }, { id: "perplexity", name: "Perplexity" }, { id: "other", name: "Other agent" }] } },
        { slug: "store", name: "Store", type: "select", required: false, options: { choices: [{ id: "shopify", name: "Shopify" }, { id: "own-site", name: "Own site" }, { id: "marketplace", name: "Marketplace" }] } },
        { slug: "sku", name: "SKU", type: "text", required: true },
        { slug: "quantity", name: "Quantity", type: "number", required: true },
        { slug: "paid-price", name: "Unit price paid", type: "number", required: true },
        { slug: "listed-price", name: "Price listed at order time", type: "number", required: false },
        { slug: "currency", name: "Currency", type: "text", required: false },
        { slug: "ordered-on", name: "Ordered on", type: "date", required: true },
        { slug: "status", name: "Status", type: "select", required: true, options: { choices: [{ id: "paid", name: "Paid" }, { id: "fulfilled", name: "Fulfilled" }, { id: "refunded", name: "Refunded" }, { id: "disputed", name: "Disputed" }] } },
      ],
    },
    {
      key: "guardrails",
      name: "Price Guardrails",
      slug: "busa-agent-orders-guardrails",
      description:
        "Per-SKU limits an agent-proposed price must stay inside: floor, ceiling, maximum change per step, and whether all agent channels must show the same price.",
      readLimit: 50,
      fields: [
        { slug: "sku", name: "SKU", type: "text", required: true },
        { slug: "floor-price", name: "Floor price", type: "number", required: true },
        { slug: "ceiling-price", name: "Ceiling price", type: "number", required: false },
        { slug: "max-change-pct", name: "Max change per step (%)", type: "number", required: false },
        { slug: "same-price-everywhere", name: "Same price on every channel", type: "checkbox", required: false },
        { slug: "owner", name: "Owner", type: "text", required: false },
      ],
    },
    {
      key: "proposals",
      name: "Price Proposals",
      slug: "busa-agent-orders-proposals",
      description:
        "Review queue for price changes proposed by a repricing agent. Each row states the guardrails it breaches, if any. Nothing is changed in a store until a person approves.",
      readLimit: 50,
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "sku", name: "SKU", type: "text", required: true },
        { slug: "channels", name: "Channels", type: "text", required: false },
        { slug: "current-price", name: "Current price", type: "number", required: true },
        { slug: "proposed-price", name: "Proposed price", type: "number", required: true },
        { slug: "reason", name: "Reason", type: "longtext", required: false },
        { slug: "source", name: "Source", type: "longtext", required: false },
        { slug: "breaches", name: "Guardrails breached", type: "longtext", required: false },
        { slug: "status", name: "Status", type: "select", required: true, options: { choices: [{ id: "proposed", name: "Proposed" }, { id: "approved", name: "Approved" }, { id: "changes-requested", name: "Changes requested" }, { id: "blocked", name: "Blocked" }, { id: "applied", name: "Applied" }] } },
        { slug: "decision-note", name: "Decision note", type: "longtext", required: false },
        { slug: "applied-on", name: "Applied on", type: "date", required: false },
      ],
    },
    {
      key: "exceptions",
      name: "Order Exceptions",
      slug: "busa-agent-orders-exceptions",
      description:
        "Orders an agent completed that should not have gone through as they did: sold below floor, sold out of stock, a price that differed by channel, a refund or dispute pattern.",
      readLimit: 50,
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "order", name: "Order", type: "relation", required: false, options: { targetBaseSlug: "busa-agent-orders-orders", multiple: false } },
        { slug: "type", name: "Type", type: "select", required: true, options: { choices: [{ id: "below-floor", name: "Sold below floor" }, { id: "channel-mismatch", name: "Channel price mismatch" }, { id: "out-of-stock", name: "Sold out of stock" }, { id: "refund-dispute", name: "Refund or dispute" }] } },
        { slug: "sku", name: "SKU", type: "text", required: false },
        { slug: "detected-on", name: "Detected on", type: "date", required: true },
        { slug: "impact", name: "Impact (currency)", type: "number", required: false },
        { slug: "status", name: "Status", type: "select", required: true, options: { choices: [{ id: "open", name: "Open" }, { id: "resolved", name: "Resolved" }, { id: "accepted", name: "Accepted as is" }] } },
        { slug: "resolution", name: "Resolution", type: "longtext", required: false },
      ],
    },
    {
      key: "settings",
      name: "Settings",
      slug: "busa-agent-orders-settings",
      description:
        "One row: store name, agent channels in use, currency, and which changes always need a person.",
      readLimit: 1,
      fields: [
        { slug: "store-name", name: "Store name", type: "text", required: true },
        { slug: "agent-channels", name: "Agent channels", type: "multiselect", required: false, options: { choices: [{ id: "meta-muse", name: "Meta Muse" }, { id: "chatgpt", name: "ChatGPT" }, { id: "gemini", name: "Gemini" }, { id: "perplexity", name: "Perplexity" }] } },
        { slug: "currency", name: "Currency", type: "text", required: false },
        { slug: "review-policy", name: "Review policy", type: "longtext", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list", "records.count"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    // The only writes this app makes are a person's decisions, each through a
    // ChangeRequest on that record alone: on a price proposal it updates only
    // `status` and `decision-note`; on an order exception only `status` and
    // `resolution`. It never creates a row, never touches orders, guardrails
    // or settings, and never changes a price in a store.
    writeProcedures: ["records.changeRequest"],
  },
};
