export const fieldsOf = (r) =>
  r.headCommit?.payload || r.headCommit?.fields || r.fields || {};
export function normalize(r, baseKey) {
  return { id: r.id, baseKey, fields: fieldsOf(r) };
}
export function isStaleBalance(record, now) {
  if (record.baseKey !== "accounts" || record.fields.status === "closed")
    return false;
  const checked = Date.parse(record.fields.checkedAt);
  return !Number.isFinite(checked) || now - checked > 86400000;
}
export function attentionReason(record, now) {
  const f = record.fields;
  const done = [
    "paid",
    "issued",
    "filed",
    "accepted",
    "reconciled",
    "matched",
    "closed",
  ];
  if (["blocked", "exception", "restricted"].includes(f.status))
    return f.reason ? "reason" : "pendingReason";
  if (isStaleBalance(record, now)) return "staleReason";
  if (
    record.baseKey === "checks" &&
    Number.isFinite(f.balance) &&
    Number.isFinite(f.bankBalance) &&
    f.balance !== f.bankBalance
  )
    return "difference";
  if (f.status === "paid" && (!f.paidAt || !f.receipt)) return "paidReason";
  if (
    f.due &&
    !done.includes(f.status) &&
    f.due.slice(0, 10) < new Date(now).toISOString().slice(0, 10)
  )
    return "overdueReason";
  if (["pending", "review", "preparing", "unmatched"].includes(f.status))
    return f.reason ? "reason" : "pendingReason";
  return "";
}
export function moneyByCurrency(rows) {
  const sums = {};
  for (const { fields: f } of rows) {
    if (Number.isFinite(f.amount) && f.currency)
      sums[f.currency] = (sums[f.currency] || 0) + f.amount;
  }
  return sums;
}
export function resolveRelation(value, rows) {
  const id = Array.isArray(value) ? value[0] : value;
  if (typeof id !== "string" || !id) return null;
  const r = rows.find((x) => x.id === id);
  return r?.fields?.title || null;
}
export function appendPage(current, next) {
  const ids = new Set(current.map((r) => r.id));
  return [...current, ...next.filter((r) => !ids.has(r.id))];
}

export async function readIndependentRegisters(declarations, read) {
  const settled = await Promise.allSettled(declarations.map(read));
  const loaded = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failures = settled.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ key: declarations[index].key, code: failureCode(result.reason) }]
      : [],
  );
  if (!loaded.length) throw Error(failures[0]?.code || "BRIDGE_UNAVAILABLE");
  return { loaded, failures };
}

function failureCode(error) {
  if (error?.status === 401 || error?.code === "UNAUTHORIZED")
    return "SESSION_REQUIRED";
  if (error?.status === 403 || error?.code === "FORBIDDEN")
    return "PROCEDURE_DENIED";
  if (String(error?.message).startsWith("SCHEMA_INCOMPLETE"))
    return "SCHEMA_INCOMPLETE";
  return "BRIDGE_UNAVAILABLE";
}
