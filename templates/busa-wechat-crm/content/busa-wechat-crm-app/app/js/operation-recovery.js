export class WriteResultUnknownError extends Error {
  constructor(message = "WRITE_RESULT_UNKNOWN") {
    super(message);
    this.name = "WriteResultUnknownError";
    this.code = "WRITE_RESULT_UNKNOWN";
  }
}

export const isUnknownWriteError = (error) => {
  const status = Number(error?.status || error?.data?.status || error?.response?.status || 0);
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  return /gateway timeout|timed? ?out|timeout|network|fetch failed|failed to fetch|connection.*(?:closed|reset)|aborted/i.test(
    String(error?.message || error),
  );
};

const sameValue = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export const fieldsMatch = (record, expectedFields) => {
  const fields = record?.fields || record?.headCommit?.payload || record?.headCommit?.fields || {};
  return Object.entries(expectedFields).every(([slug, value]) => sameValue(fields[slug], value));
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function confirmRecordFields({ read, expectedFields, attempts = 12, intervalMs = 2500 }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0 && intervalMs > 0) await wait(intervalMs);
    try {
      const record = await read();
      if (record && fieldsMatch(record, expectedFields)) return record;
    } catch {
      // A transient read failure does not prove the write failed.
    }
  }
  return null;
}

export async function updateWithConfirmation({ write, read, expectedFields, onConfirming, confirmOptions }) {
  try {
    return { result: await write(), reconciled: false };
  } catch (error) {
    if (!isUnknownWriteError(error)) throw error;
    onConfirming?.();
    const record = await confirmRecordFields({ read, expectedFields, ...confirmOptions });
    if (record) return { result: record, reconciled: true };
    throw new WriteResultUnknownError();
  }
}

export async function createWithConfirmation({ create, find, onConfirming, confirmOptions }) {
  try {
    return { result: await create(), reconciled: false };
  } catch (error) {
    if (!isUnknownWriteError(error)) throw error;
    onConfirming?.();
    const existing = await confirmRecordFields({ read: find, expectedFields: {}, ...confirmOptions });
    if (existing) return { result: existing, reconciled: true };

    // Create endpoints accept an idempotency key. One retry with the same key
    // either returns the original CR or creates it once when the first request
    // never reached Busabase.
    try {
      return { result: await create(), reconciled: true };
    } catch (retryError) {
      if (!isUnknownWriteError(retryError)) throw retryError;
      const retried = await confirmRecordFields({ read: find, expectedFields: {}, ...confirmOptions });
      if (retried) return { result: retried, reconciled: true };
      throw new WriteResultUnknownError();
    }
  }
}
