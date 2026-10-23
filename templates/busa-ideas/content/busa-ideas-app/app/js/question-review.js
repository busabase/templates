// Review state is read from ChangeRequests, never persisted in browser storage.
export const OPEN_REVIEW_STATUSES = ["in_review", "changes_requested", "approved", "conflict"];

export function questionReview(requests, questionId, recordId) {
  const matches = [];
  for (const request of requests) {
    for (const operation of request.operations || []) {
      const fields = operation.headCommit?.payload || {};
      if (fields["record-id"] !== questionId && (!recordId || operation.targetRecordId !== recordId)) continue;
      if (!Object.hasOwn(fields, "answer") && !["answered", "skipped"].includes(fields.status)) continue;
      matches.push({ requestId: request.id, reviewStatus: request.status,
        action: fields.status === "skipped" ? "skip" : "answer", answer: String(fields.answer || "") });
    }
  }
  return matches;
}

export async function submitOrdinaryQuestion({ client, declared, existing, questionId, action, answer, now, readReviews, submittedBy }) {
  const fields = existing.headCommit?.payload || existing.headCommit?.fields || existing.fields || {};
  const status = action === "skip" ? "skipped" : "answered";
  // The active query must be complete before a no-op or write can be trusted.
  const reviews = await readReviews(OPEN_REVIEW_STATUSES);
  const pending = questionReview(reviews, questionId, existing.id);
  if (pending.length) {
    if (pending.some((item) => item.action !== action || item.answer !== answer)) {
      throw new Error("A different answer or skip is awaiting review. Open the Workspace Inbox before changing it.");
    }
    return { updated_at: now, pending: true, change_request_id: pending[0].requestId };
  }
  if (fields.status === status && String(fields.answer || "") === answer) {
    return { updated_at: now, pending: false, change_request_id: "" };
  }
  if (fields.status === "answered" || fields.status === "skipped") {
    throw new Error("This question has already been answered or skipped. Refresh before editing it in the Questions Base.");
  }
  // A rejected/closed attempt may legitimately be submitted again. Include its
  // id in the key; identical retries in the same review cycle retain one key.
  const terminal = questionReview(await readReviews(["rejected", "abandoned"]), questionId, existing.id)[0];
  const identity = JSON.stringify([existing.id, existing.headCommitId || existing.headCommit?.id, action, answer, terminal?.requestId || ""]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const idempotencyKey = `busa-ideas:question:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  // The single-record update API has no idempotency key. A one-row bulk update
  // uses the server's unique key, covering double clicks and lost responses.
  const result = await client.bases.createBulkUpdateChangeRequest({
    baseId: declared.baseId,
    updates: [{ recordId: existing.id, baseCommitId: existing.headCommitId || existing.headCommit?.id,
      fields: { "record-id": questionId, answer, status, "answered-at": now } }],
    idempotencyKey, submittedBy,
    message: `${action === "answer" ? "Answer" : "Skip"} question ${questionId}`,
  });
  const queued = OPEN_REVIEW_STATUSES.includes(result.status) || result.materialized === false;
  return { updated_at: now, pending: queued, change_request_id: queued ? result.id : "" };
}
