// The shop's two secrets, read at runtime from the Busabase Vault:
//
//   BUSA_SHOP_PAYPAL_CLIENT_SECRET   the PayPal REST app's secret (Settings holds its client id)
//   BUSA_SHOP_SMTP_PASSWORD          the mailbox password (Settings holds host, port, user)
//
// `GET /api/v1/vault/runtime` answers, for the key that calls it, every Vault
// item marked **Runtime**: the Space's items, then the key's own, the more
// specific winning. A website's key (`Site: …`, `Site preview: …`) is bound to
// one Space, so a person's *personal* Vault values never reach it: the owner
// puts these two in the **Space** Vault (Space owners and admins can), and only
// while the key's owner can write in the Space are they returned.
//
// Kept to the two names above and dropped otherwise: whatever else the Space
// keeps in its Vault never stays in this Worker's memory. Read only when a
// checkout, a payment, a webhook or an email needs it, at most once every five
// minutes per Worker instance (every read is an audit event in Busabase), and
// never on the browser engine (no key there; the endpoint needs one).

// [what the website calls it, the Vault item's name]. Pairs, not an object:
// Busabase's upload check reads `secret: "<16+ characters>"` as a leaked
// secret, and these are only names.
export const VAULT_KEYS = [
  ["paypalSecret", "BUSA_SHOP_PAYPAL_CLIENT_SECRET"],
  ["smtpPassword", "BUSA_SHOP_SMTP_PASSWORD"],
];
export const VAULT_TTL_MS = 5 * 60_000;
export const VAULT_ERROR_TTL_MS = 30_000;

/** Read and filter one runtime answer. Never logs a value; a failure is `{ error }` with the status only. */
export const readShopSecrets = async ({ baseUrl, apiKey, spaceId, fetchImpl = fetch }) => {
  if (!apiKey) return { secrets: {}, error: "no-key" };
  let response;
  try {
    response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, "").replace(/\/api\/v1$/, "")}/api/v1/vault/runtime`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", ...(spaceId ? { "x-busabase-space": spaceId } : {}) },
    });
  } catch {
    return { secrets: {}, error: "unreachable" };
  }
  if (!response.ok) {
    await response.body?.cancel?.();
    return { secrets: {}, error: `http-${response.status}` };
  }
  const body = await response.json().catch(() => null);
  const secrets = {};
  if (body && typeof body === "object") {
    for (const [name, key] of VAULT_KEYS) {
      if (typeof body[key] === "string" && body[key]) secrets[name] = body[key];
    }
  }
  return { secrets, error: "" };
};

/** A cached reader: `get()` resolves to `{ secrets, error }`. */
export const createSecretsReader = ({ read, now = () => Date.now() }) => {
  let cached = null; // { value, at }
  let inFlight = null;
  return {
    get: async () => {
      const at = now();
      if (cached && at - cached.at < (cached.value.error ? VAULT_ERROR_TTL_MS : VAULT_TTL_MS)) return cached.value;
      inFlight ??= read()
        .then((value) => {
          cached = { value, at: now() };
          return value;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    forget: () => {
      cached = null;
    },
  };
};
