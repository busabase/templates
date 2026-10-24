// Use the actual host dashboard, or the selected standalone OAuth connection.
// A preview iframe's own origin is not necessarily the workspace origin.
export function inboxFromDashboard(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    const match = url.pathname.match(/^(.*\/dashboard(?:\/[^/]+)?)\/airapp\//);
    return match ? `${url.origin}${match[1]}/inbox` : "";
  } catch { return ""; }
}

export function inboxFromHostedFrame({ parentUrl, referrer, locationUrl } = {}) {
  return inboxFromDashboard(parentUrl) || inboxFromDashboard(referrer) || inboxFromDashboard(locationUrl);
}

export async function reviewInboxUrl({ hosted = false } = {}) {
  if (hosted) {
    // Nodepod can omit document.referrer while its same-origin parent still
    // carries the real workspace dashboard. Cross-origin access may throw.
    let parentUrl = "";
    try { parentUrl = globalThis.parent?.location?.href || ""; } catch { /* use observable URLs below */ }
    return inboxFromHostedFrame({ parentUrl, referrer: globalThis.document?.referrer,
      locationUrl: globalThis.location?.href });
  }
  try {
    const response = await fetch("auth/status", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) return "";
    const status = await response.json();
    const origin = new URL(status.baseUrl);
    if (!["http:", "https:"].includes(origin.protocol) || !status.selectedSpace?.id) return "";
    return `${origin.origin}/dashboard/${encodeURIComponent(status.selectedSpace.id)}/inbox`;
  } catch { return ""; }
}
