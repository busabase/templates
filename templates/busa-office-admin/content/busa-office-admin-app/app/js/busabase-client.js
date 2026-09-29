import { createBusabaseClient } from '../vendor/busabase-sdk.js';
export function createRuntimeClient() { return createBusabaseClient({ baseUrl: window.location.origin }); }
