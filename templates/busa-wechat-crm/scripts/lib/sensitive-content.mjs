const SECRET_KEY = /(?:password|passwd|passphrase|secret|token|api[_-]?key|authorization|credential|cookie)/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\b(?:bso|bsr|sk)[_-][A-Za-z0-9_-]{12,}\b/gi,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /([?&](?:password|passwd|secret|token|api[_-]?key)=)[^&#\s]+/gi,
  /((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,
];

const redactString = (input, report) => {
  let value = String(input);
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "[REDACTED]";
      url.password = "[REDACTED]";
      value = url.toString();
      report.count += 1;
    }
  } catch {
    // Most message strings are not URLs.
  }
  for (const pattern of SECRET_VALUE_PATTERNS) {
    value = value.replace(pattern, (match, prefix) => {
      report.count += 1;
      return prefix ? `${prefix}[REDACTED_SECRET]` : "[REDACTED_SECRET]";
    });
  }
  return value;
};

const visit = (value, report, seen) => {
  if (typeof value === "string") return redactString(value, report);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[REDACTED_CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => visit(item, report, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (SECRET_KEY.test(key)) {
        report.count += 1;
        return [key, "[REDACTED_SECRET]"];
      }
      return [key, visit(item, report, seen)];
    }),
  );
};

export function redactSensitive(value) {
  const report = { count: 0 };
  const data = visit(value, report, new WeakSet());
  return { data, redactionCount: report.count, hasSensitiveContent: report.count > 0 };
}
