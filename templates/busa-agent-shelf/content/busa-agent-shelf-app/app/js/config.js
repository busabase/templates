// Runtime binding: this is a template, so it carries no spaceId and no
// node/base ids. Each Base is found at run time by inspectProvisionedResources,
// which matches the node stamped with this app's resourceKey (`key`) inside the
// installed Folder. Every field below mirrors content/<key>/base.json exactly
// (test/config-matches-content.test.mjs enforces it); a relation's
// targetBaseSlug is the target Base's own prefixed slug, which is what
// provisionDeclaredResources resolves in a live Space.
export const appConfig = {
  appId: "busa-agent-shelf",
  appName: "Busa Agent Shelf",
  deployment: "cloud",
  locale: "auto",
  readOnly: false,
  spaceId: "",
  schemaVersion: 1,
  accent: "#8A5A2B",
  folder: {
    name: "Busa Agent Shelf",
    description:
      "Agent shelf desk for e-commerce sellers: track whether AI shopping agents (ChatGPT, Gemini, Meta Muse, Amazon Rufus, Perplexity) recommend your products for the questions buyers ask, who they pick instead and why, and a review queue of sourced listing fixes. The AirApp only records a person's decision on a fix; it never contacts a shopping agent or edits a store.",
    slug: "busa-agent-shelf",
  },
  airApp: { name: "Busa Agent Shelf", slug: "busa-agent-shelf-app", resourceKey: "busa-agent-shelf-app" },
  bases: [
    {
      key: "questions",
      name: "Buyer Questions",
      slug: "busa-agent-shelf-questions",
      description:
        "The shopping questions buyers ask an agent, in their words, with the products that should be the answer.",
      readLimit: 50,
      fields: [
        { slug: "question", name: "Question", type: "text", required: true },
        { slug: "market", name: "Market", type: "select", required: false, options: { choices: [{ id: "us", name: "US" }, { id: "uk", name: "UK" }, { id: "eu", name: "EU" }, { id: "global", name: "Global" }] } },
        { slug: "category", name: "Category", type: "text", required: false },
        { slug: "intent", name: "Intent", type: "select", required: false, options: { choices: [{ id: "discover", name: "Discover" }, { id: "compare", name: "Compare" }, { id: "buy", name: "Buy now" }] } },
        { slug: "priority", name: "Priority", type: "select", required: true, options: { choices: [{ id: "high", name: "High" }, { id: "medium", name: "Medium" }, { id: "low", name: "Low" }] } },
        { slug: "target-products", name: "Products that should answer it", type: "text", required: false },
        { slug: "status", name: "Status", type: "select", required: true, options: { choices: [{ id: "tracking", name: "Tracking" }, { id: "paused", name: "Paused" }] } },
        { slug: "notes", name: "Notes", type: "longtext", required: false },
      ],
    },
    {
      key: "observations",
      name: "Agent Answers",
      slug: "busa-agent-shelf-observations",
      description:
        "One row per question x shopping agent x check: what the agent recommended, where we ranked, and the reason it gave. Collected by an agent's own browsing, with the answer excerpt as evidence.",
      readLimit: 50,
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "question", name: "Question", type: "relation", required: true, options: { targetBaseSlug: "busa-agent-shelf-questions", multiple: false } },
        { slug: "agent", name: "Shopping agent", type: "select", required: true, options: { choices: [{ id: "chatgpt", name: "ChatGPT" }, { id: "gemini", name: "Gemini" }, { id: "meta-muse", name: "Meta Muse" }, { id: "amazon-rufus", name: "Amazon Rufus" }, { id: "perplexity", name: "Perplexity" }, { id: "other", name: "Other" }] } },
        { slug: "checked-on", name: "Checked on", type: "date", required: true },
        { slug: "our-position", name: "Our position (0 = not shown)", type: "number", required: true },
        { slug: "our-product", name: "Our product shown", type: "text", required: false },
        { slug: "picked-instead", name: "Recommended instead", type: "longtext", required: false },
        { slug: "reason-given", name: "Reason the agent gave", type: "longtext", required: false },
        { slug: "answer-excerpt", name: "Answer excerpt", type: "longtext", required: false },
        { slug: "evidence-url", name: "Evidence link", type: "url", required: false },
      ],
    },
    {
      key: "competitors",
      name: "Competitors",
      slug: "busa-agent-shelf-competitors",
      description:
        "Products the agents pick instead of ours, and what their listings have that ours do not.",
      readLimit: 50,
      fields: [
        { slug: "product", name: "Product", type: "text", required: true },
        { slug: "brand", name: "Brand", type: "text", required: false },
        { slug: "url", name: "Listing URL", type: "url", required: false },
        { slug: "price", name: "Price", type: "number", required: false },
        { slug: "times-picked", name: "Times recommended", type: "number", required: false },
        { slug: "what-they-have", name: "What their listing has", type: "longtext", required: false },
      ],
    },
    {
      key: "fixes",
      name: "Listing Fixes",
      slug: "busa-agent-shelf-fixes",
      description:
        "Review queue. Each row is one proposed change to product data that should close a gap an agent answer exposed, with its evidence and the source for the new value. Nothing here is applied to a store or catalog until a person approves it.",
      readLimit: 50,
      fields: [
        { slug: "title", name: "Title", type: "text", required: true },
        { slug: "question", name: "Question", type: "relation", required: false, options: { targetBaseSlug: "busa-agent-shelf-questions", multiple: false } },
        { slug: "product", name: "Product (SKU)", type: "text", required: true },
        { slug: "gap-type", name: "Gap", type: "select", required: true, options: { choices: [{ id: "missing-attribute", name: "Missing attribute" }, { id: "unsourced-claim", name: "Unsourced claim" }, { id: "price", name: "Price" }, { id: "availability", name: "Availability" }, { id: "reviews", name: "Reviews" }, { id: "shipping-returns", name: "Shipping & returns" }, { id: "copy", name: "Copy" }] } },
        { slug: "field-name", name: "Product field", type: "text", required: false },
        { slug: "current-value", name: "Current value", type: "longtext", required: false },
        { slug: "proposed-value", name: "Proposed value", type: "longtext", required: true },
        { slug: "source", name: "Source for the new value", type: "longtext", required: false },
        { slug: "evidence", name: "Why (agent answers)", type: "longtext", required: false },
        { slug: "risk", name: "Risk", type: "select", required: true, options: { choices: [{ id: "low", name: "Low" }, { id: "medium", name: "Medium" }, { id: "high", name: "High" }] } },
        { slug: "status", name: "Status", type: "select", required: true, options: { choices: [{ id: "proposed", name: "Proposed" }, { id: "approved", name: "Approved" }, { id: "changes-requested", name: "Changes requested" }, { id: "blocked", name: "Blocked" }, { id: "applied", name: "Applied" }] } },
        { slug: "decision-note", name: "Decision note", type: "longtext", required: false },
        { slug: "applied-on", name: "Applied on", type: "date", required: false },
      ],
    },
    {
      key: "settings",
      name: "Settings",
      slug: "busa-agent-shelf-settings",
      description:
        "One row: the brand being tracked, the shopping agents to check, the check cadence, and which fix types always need a person.",
      readLimit: 1,
      fields: [
        { slug: "brand", name: "Brand", type: "text", required: true },
        { slug: "agents", name: "Agents to check", type: "multiselect", required: false, options: { choices: [{ id: "chatgpt", name: "ChatGPT" }, { id: "gemini", name: "Gemini" }, { id: "meta-muse", name: "Meta Muse" }, { id: "amazon-rufus", name: "Amazon Rufus" }, { id: "perplexity", name: "Perplexity" }] } },
        { slug: "cadence", name: "Check cadence", type: "select", required: false, options: { choices: [{ id: "weekly", name: "Weekly" }, { id: "biweekly", name: "Every two weeks" }, { id: "monthly", name: "Monthly" }] } },
        { slug: "review-policy", name: "Review policy", type: "longtext", required: false },
      ],
    },
  ],
  permissions: {
    readProcedures: ["nodes.list", "nodes.get", "bases.get", "records.list", "records.count"],
    setupProcedures: ["nodes.createChangeRequest", "nodes.updateMetadata"],
    // The only write this app makes: a person's decision on one listing fix,
    // updating `status` and `decision-note` on that fix's own record. It never
    // creates a row, never touches questions/answers/competitors/settings, and
    // never contacts a shopping agent or a store.
    writeProcedures: ["records.changeRequest"],
  },
};
