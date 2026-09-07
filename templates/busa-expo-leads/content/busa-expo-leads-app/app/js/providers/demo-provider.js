// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Busa App-in-Skills.
// All companies and people below are entirely fictional.
import { buildSnapshot } from "../expo-leads-model.js?v=0.1.0";
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";

const NOW = "2026-09-08T12:00:00.000Z";

const batch = (id, name, location, start_date, end_date, notes = "") => ({
  __recordId: id,
  name,
  location,
  start_date,
  end_date,
  notes,
});

const lead = (id, batch_id, name, company, country, language, product_interest, contact_channel, contact_handle, met_at, stage) => ({
  __recordId: id,
  batch: [batch_id],
  name,
  company,
  country,
  language,
  card_photo: null,
  product_interest,
  contact_channel,
  contact_handle,
  met_at,
  stage,
});

const followup = (id, lead_id, language, channel, draft_text, status, created_at, decision) => ({
  __recordId: id,
  lead: [lead_id],
  language,
  draft_text,
  channel,
  status,
  created_at,
  updated_at: decision?.decided_at || created_at,
  decision_action: decision?.action || "",
  decision_comment: decision?.comment || "",
  decided_at: decision?.decided_at || "",
  execution_status: decision?.execution_status || "",
  execution_detail: decision?.execution_detail || "",
  executed_at: decision?.executed_at || "",
});

function demoSnapshot() {
  const batches = [
    batch(
      "b-hk",
      "Global Sources Hong Kong Electronics Show",
      "Hong Kong, CN",
      "2026-10-17",
      "2026-10-19",
      "Flagship consumer electronics show; booth 3B-42.",
    ),
    batch(
      "b-dxb",
      "Gulfood Manufacturing Dubai",
      "Dubai, AE",
      "2026-11-03",
      "2026-11-05",
      "Regional distributor push for the Middle East and Africa.",
    ),
  ];

  const leads = [
    // Green: met less than 24h ago.
    lead(
      "lead-bellini",
      "b-hk",
      "Marco Bellini",
      "Bellini Import Trading srl",
      "Italy",
      "other",
      "Matter-compatible smart home hubs",
      "whatsapp",
      "+39 345 555 0142",
      "2026-09-08T06:00:00.000Z",
      "new",
    ),
    lead(
      "lead-alsayed",
      "b-dxb",
      "Fatima Al-Sayed",
      "Al-Sayed Trading LLC",
      "United Arab Emirates",
      "ar",
      "LED lighting fixtures",
      "whatsapp",
      "+971 50 555 0199",
      "2026-09-08T02:00:00.000Z",
      "contacted",
    ),
    lead(
      "lead-nair",
      "b-hk",
      "Priya Nair",
      "Nair Overseas Traders",
      "India",
      "en",
      "HEPA air purifiers",
      "whatsapp",
      "+91 98765 43210",
      "2026-09-08T09:00:00.000Z",
      "replied",
    ),
    // Amber: met 24-72h ago.
    lead(
      "lead-fernandez",
      "b-hk",
      "Diego Fernandez",
      "Fernandez Hermanos Distribuciones",
      "Mexico",
      "es",
      "Bluetooth party speakers",
      "email",
      "diego@fernandezdist.mx",
      "2026-09-07T00:00:00.000Z",
      "new",
    ),
    lead(
      "lead-liwei",
      "b-hk",
      "Li Wei",
      "Wei Trading Co",
      "Singapore",
      "zh",
      "15W wireless chargers",
      "wechat",
      "weili_trade",
      "2026-09-06T12:00:00.000Z",
      "contacted",
    ),
    // Red: met over 72h ago.
    lead(
      "lead-carter",
      "b-dxb",
      "James Carter",
      "Carter Retail Group",
      "United Kingdom",
      "en",
      "Portable power stations",
      "email",
      "james.carter@carterretail.co.uk",
      "2026-09-03T00:00:00.000Z",
      "new",
    ),
    lead(
      "lead-okafor",
      "b-hk",
      "Amara Okafor",
      "Okafor & Sons Ltd",
      "Nigeria",
      "en",
      "Solar panel kits",
      "whatsapp",
      "+234 803 555 0110",
      "2026-08-31T04:00:00.000Z",
      "contacted",
    ),
    // Excluded despite being inside the green window: stage is qualified.
    lead(
      "lead-nowak",
      "b-dxb",
      "Sofia Nowak",
      "Nowak Electronics Sp. z o.o.",
      "Poland",
      "other",
      "Smart door locks",
      "email",
      "sofia@nowak-electronics.pl",
      "2026-09-08T07:00:00.000Z",
      "qualified",
    ),
    // Excluded despite being inside the red window: stage is lost.
    lead(
      "lead-malik",
      "b-hk",
      "Hassan Malik",
      "Malik Home Appliances",
      "Pakistan",
      "other",
      "Countertop kitchen appliances",
      "whatsapp",
      "+92 300 555 0176",
      "2026-09-04T18:00:00.000Z",
      "lost",
    ),
    // Excluded despite being inside the amber window: latest follow-up already sent.
    lead(
      "lead-lindqvist",
      "b-dxb",
      "Grace Lindqvist",
      "Lindqvist Nordic AB",
      "Sweden",
      "en",
      "Wearable fitness trackers",
      "email",
      "grace@lindqvistnordic.se",
      "2026-09-07T06:00:00.000Z",
      "contacted",
    ),
  ];

  const followups = [
    followup(
      "fu-bellini",
      "lead-bellini",
      "it",
      "whatsapp",
      "Ciao Marco, è stato un piacere conoscerti oggi al Global Sources HK. Ti invio le informazioni sui nostri hub smart home compatibili con Matter, disponibili a partire da 500 pezzi. Fammi sapere se desideri un preventivo dettagliato.\n\nA presto,\nExpo Sales Team",
      "needs_review",
      "2026-09-08T07:00:00.000Z",
    ),
    followup(
      "fu-alsayed",
      "lead-alsayed",
      "ar",
      "whatsapp",
      "مرحباً فاطمة، سعدنا بلقائك اليوم في المعرض. نرفق تفاصيل أضواء LED التي ناقشناها، الحد الأدنى للطلب 1000 قطعة. يسعدنا ترتيب عينة مجانية عند الطلب.\n\nمع خالص التحية،\nفريق المبيعات",
      "needs_review",
      "2026-09-08T03:00:00.000Z",
    ),
    followup(
      "fu-liwei",
      "lead-liwei",
      "zh",
      "wechat",
      "李伟你好，很高兴今天在展会上认识你。附上我们无线充电器的最新报价单，起订量 500 件，支持定制 LOGO。期待进一步合作！\n\n销售团队",
      "approved",
      "2026-09-06T20:00:00.000Z",
      {
        action: "approve",
        comment: "内容准确，可以发送。",
        decided_at: "2026-09-08T10:00:00.000Z",
      },
    ),
    followup(
      "fu-lindqvist",
      "lead-lindqvist",
      "en",
      "email",
      "Hi Grace, great meeting you at Gulfood Manufacturing Dubai. Attached is the spec sheet for our wearable fitness trackers along with wholesale pricing tiers starting at 300 units. Let me know if you'd like a sample kit shipped to Stockholm.\n\nBest regards,\nExpo Sales Team",
      "sent",
      "2026-09-07T07:00:00.000Z",
      {
        action: "approve",
        comment: "Approved as drafted.",
        decided_at: "2026-09-07T10:00:00.000Z",
        execution_status: "executed",
        execution_detail: "Sent via the configured transactional email account.",
        executed_at: "2026-09-07T10:05:00.000Z",
      },
    ),
    followup(
      "fu-okafor",
      "lead-okafor",
      "en",
      "whatsapp",
      "Hi Amara, following up from Global Sources HK — sending over the solar panel wholesale catalogue and MOQ details as promised. Happy to set up a call this week if useful.\n\nBest,\nExpo Sales Team",
      "needs_review",
      "2026-08-31T05:00:00.000Z",
    ),
  ];

  const settings = {
    record_id: "config",
    sla_24h_hours: 24,
    sla_72h_hours: 72,
    reply_templates: JSON.stringify({
      en: "Hi {name}, great meeting you at {batch}. Following up on {product_interest} as promised.",
      es: "Hola {name}, un placer conocerte en {batch}. Te escribo sobre {product_interest} como prometimos.",
      ar: "مرحباً {name}، سعدنا بلقائك في {batch}. نتابع بخصوص {product_interest} كما وعدنا.",
      zh: "{name}你好，很高兴在{batch}认识你，附上关于{product_interest}的跟进信息。",
      other: "Hi {name}, great meeting you at {batch}. Following up on {product_interest} as promised.",
    }),
    whatsapp_account_env: "EXPO_LEADS_WHATSAPP_TOKEN",
    email_account_env: "EXPO_LEADS_EMAIL_SMTP",
  };

  return buildSnapshot({ batches, leads, followups, settings, now: NOW });
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    // Lead names, companies, and drafted follow-up text are intentionally
    // NOT retranslated for `lang=zh` — the UI chrome (labels, badges, nav)
    // localizes via i18n/messages.js, but draft_text is already written in
    // each lead's own language on purpose (that's the product's whole
    // point), and company/person names are proper nouns. Only chrome
    // changes with `lang`; the data itself never does.
    const snapshot = demoSnapshot();
    return {
      app: "busa-expo-leads",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        thresholds: snapshot.thresholds,
        reply_templates: JSON.parse(
          JSON.stringify({
            en: "Hi {name}, great meeting you at {batch}. Following up on {product_interest} as promised.",
            es: "Hola {name}, un placer conocerte en {batch}.",
            ar: "مرحباً {name}، سعدنا بلقائك في {batch}.",
            zh: "{name}你好，很高兴在{batch}认识你。",
            other: "Hi {name}, great meeting you at {batch}.",
          }),
        ),
        whatsapp_account_env: "EXPO_LEADS_WHATSAPP_TOKEN",
        email_account_env: "EXPO_LEADS_EMAIL_SMTP",
      },
      demo_visuals: demoVisualsForApp("busa-expo-leads"),
      snapshot: { ...snapshot, demo_visuals: demoVisualsForApp("busa-expo-leads") },
    };
  },

  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
