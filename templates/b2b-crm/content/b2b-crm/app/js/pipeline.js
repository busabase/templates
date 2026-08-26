const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const currencyMeta = {
  usd: { code: "USD", symbol: "$" },
  eur: { code: "EUR", symbol: "EUR " },
  gbp: { code: "GBP", symbol: "GBP " },
};

export const openStages = new Set(["qualification", "discovery", "proposal", "negotiation"]);

export const formatMoney = (amount, currency, compact = false) => {
  const numeric = Number(amount || 0);
  const meta = currencyMeta[currency] || { code: String(currency || ""), symbol: `${currency || ""} ` };
  if (compact && Math.abs(numeric) >= 1000) {
    return `${meta.symbol}${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(numeric / 1000)}K`;
  }
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: meta.code,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${meta.symbol}${new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(numeric)}`;
  }
};

export function pipelineMetrics(records) {
  const open = records.filter((record) => openStages.has(record.fields?.stage));
  const values = new Map();
  for (const record of open) {
    const currency = String(record.fields?.currency || "");
    values.set(currency, (values.get(currency) || 0) + Number(record.fields?.amount || 0));
  }
  const value = [...values.entries()]
    .map(([currency, amount]) => formatMoney(amount, currency, true))
    .join(" / ") || "-";
  const now = new Date();
  const limit = new Date(now);
  limit.setDate(limit.getDate() + 30);
  const closingSoon = open.filter((record) => {
    const raw = record.fields?.["expected-close-date"];
    if (!raw) return false;
    const date = new Date(`${String(raw).slice(0, 10)}T12:00:00`);
    return date >= now && date <= limit;
  }).length;
  return { openDeals: open.length, openValue: value, closingSoon };
}

export function renderPipelineBoard({ records, stages, selectedId, stageFilter, titleFor, relationFor, dateFor }) {
  const visibleStages = stageFilter ? stages.filter((stage) => stage.id === stageFilter) : stages;
  return visibleStages.map((stage) => {
    const stageRecords = records
      .filter((record) => record.fields?.stage === stage.id)
      .sort((a, b) => String(a.fields?.["expected-close-date"] || "").localeCompare(String(b.fields?.["expected-close-date"] || "")));
    const cards = stageRecords.length
      ? stageRecords.map((record) => `<button class="deal-card ${record.id === selectedId ? "selected" : ""}" type="button" data-record="${escapeHtml(record.id)}" style="--stage-color:${escapeHtml(stage.color || "#0f766e")}">
          <strong>${escapeHtml(titleFor(record))}</strong>
          <span>${escapeHtml(relationFor(record.fields?.company))}</span>
          <span class="deal-card-value">${escapeHtml(formatMoney(record.fields?.amount, record.fields?.currency))}</span>
          <span>Close ${escapeHtml(dateFor(record.fields?.["expected-close-date"]))}</span>
        </button>`).join("")
      : '<div class="pipeline-empty">No deals in this stage</div>';
    return `<section class="pipeline-column">
      <header class="pipeline-column-header"><strong style="color:${escapeHtml(stage.color || "#0f766e")}">${escapeHtml(stage.name)}</strong><span>${stageRecords.length}</span></header>
      ${cards}
    </section>`;
  }).join("");
}
