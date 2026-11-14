import { createBusabaseClient } from '../vendor/busabase-sdk.js';

// Some Busabase hosts (seen on workspace subdomains such as
// `<workspace>.busabase.com`, 2026-11) return a gzip-compressed body for larger
// `/api/v1` responses without a `content-encoding` header, so the browser
// hands the raw bytes to the SDK and every record read fails to parse. When a
// body starts with the gzip magic bytes and the header is missing, decompress
// it here. Every other response is passed through untouched.
async function tolerantFetch(input, init) {
  const response = await fetch(input, init);
  if (response.headers.get('content-encoding') || typeof DecompressionStream === 'undefined') return response;
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return response;
  const body = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export function createRuntimeClient() { return createBusabaseClient({ baseUrl: window.location.origin, fetch: tolerantFetch }); }
