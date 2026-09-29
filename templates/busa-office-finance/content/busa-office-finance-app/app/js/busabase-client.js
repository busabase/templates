import { createBusabaseClient } from "../vendor/busabase-sdk.js";
/** @returns {import('busabase-sdk').BusabaseClient} */
export const createRuntimeClient = () =>
  createBusabaseClient({ baseUrl: window.location.origin });
