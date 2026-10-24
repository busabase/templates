import { createProvider } from "../lib/data-provider/index.js";
import { rejectIfProviderUnavailable } from "./provider-status.js";

let writeQueue = Promise.resolve();

function withWriteQueue(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => {});
  return next;
}

export async function updateItems(body) {
  return withWriteQueue(async () => {
    await rejectIfProviderUnavailable();
    return createProvider().updateItems(body);
  });
}

export async function updateDetail(body) {
  return withWriteQueue(async () => {
    await rejectIfProviderUnavailable();
    return createProvider().updateDetail(body);
  });
}
