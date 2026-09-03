import { AsyncLocalStorage } from "node:async_hooks";

interface RuntimeRequestContext {
  origin: string;
  headers: Record<string, string>;
  /**
   * Only set when Busabase is NOT hosting this process. Hosted, the viewer's own
   * ambient session travels in `headers` and this stays undefined — which is what
   * keeps a deployed AirApp reading exactly what its viewer is allowed to read.
   */
  local?: { baseUrl: string; accessToken: string; spaceId: string } | null;
}

const requests = new AsyncLocalStorage<RuntimeRequestContext>();

export function withRuntimeRequest<T>(context: RuntimeRequestContext, operation: () => T): T {
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

/** The server-side credential for a standalone run, or null when hosted. */
export function localCredential() {
  return requests.getStore()?.local ?? null;
}
