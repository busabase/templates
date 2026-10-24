import { AsyncLocalStorage } from "node:async_hooks";

const requests = new AsyncLocalStorage();

export function withRuntimeRequest(context, operation) {
  return requests.run(context, operation);
}

export function runtimeOrigin() {
  return requests.getStore()?.origin || process.env.BUSABASE_BASE_URL || "https://busabase.com";
}

export function runtimeHeaders() {
  return requests.getStore()?.headers || {};
}

export function isAirAppRequest() {
  return Boolean(requests.getStore());
}
