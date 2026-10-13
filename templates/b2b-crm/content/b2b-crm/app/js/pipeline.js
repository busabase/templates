const currencyMeta = {
  usd: { code: "USD", symbol: "$" },
  eur: { code: "EUR", symbol: "EUR " },
  gbp: { code: "GBP", symbol: "GBP " },
};

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
