export function normalizeRecord(record, baseKey) {
  return { id: record.id, baseKey, fields: record.headCommit?.payload || record.headCommit?.fields || record.fields || {} };
}
export function needsAttention(record, base, asOf) {
  if (base.attention.includes(record.fields[base.status])) return true;
  if (['archived', 'completed', 'rejected'].includes(record.fields[base.status])) return false;
  if (!['certificates', 'contracts', 'labor-contracts'].includes(base.key)) return false;
  const expiry = record.fields[base.date];
  if (!expiry) return false;
  const days = (Date.parse(expiry) - Date.parse(asOf)) / 86400000;
  return Number.isFinite(days) && days <= 60;
}
export function confirmedNetPay(records, period) {
  const confirmed = records.filter((row) => row.baseKey === 'payroll' && ['approved', 'paid'].includes(row.fields.status) && row.fields.period === period);
  let amount = 0, count = 0, missing = 0;
  for (const row of confirmed) {
    const { 'gross-pay': gross, deductions } = row.fields;
    if (typeof gross !== 'number' || typeof deductions !== 'number' || !Number.isFinite(gross) || !Number.isFinite(deductions)) { missing += 1; continue; }
    amount += gross - deductions; count += 1;
  }
  return { amount, count, missing };
}
export function mergePage(current, next) {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of next) rows.set(row.id, row);
  return [...rows.values()];
}
export function safeDisplay(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return '-';
  return String(value).replace(/\b(?:rec|bse|bsf|nod|cmt|crq)[a-z0-9]{15,}\b/g, '-');
}
