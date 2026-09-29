import { createBusabaseClient } from "../vendor/busabase-sdk.js";
/** @returns {import('busabase-sdk').BusabaseClient} */
export function createRuntimeClient() {
  return createBusabaseClient({ baseUrl: window.location.origin });
}
