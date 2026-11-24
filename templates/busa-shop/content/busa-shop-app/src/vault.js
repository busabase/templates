// These two secrets are explicitly bound in the Site's Secrets & Variables.
// Busabase injects them into this Worker's environment when it deploys.
// A Site key cannot export the Space Vault; no Vault request or key fallback
// belongs here. Keep unrelated bindings out of the shop's credential object.

/** @typedef {"paypalSecret" | "smtpPassword"} ShopSecretName */

/** @type {ReadonlyArray<readonly [ShopSecretName, string]>} */
const SECRET_BINDINGS = [
  ["paypalSecret", "BUSA_SHOP_PAYPAL_CLIENT_SECRET"],
  ["smtpPassword", "BUSA_SHOP_SMTP_PASSWORD"],
];

/**
 * Read the current deployment bindings without fetching or caching credentials.
 * @param {Record<string, unknown> | null} [env]
 */
export const readShopSecrets = (env = {}) => {
  /** @type {Partial<Record<ShopSecretName, string>>} */
  const secrets = {};
  for (const [name, binding] of SECRET_BINDINGS) {
    const value = env?.[binding];
    if (typeof value === "string" && value.length > 0) secrets[name] = value;
  }
  return { secrets, error: "" };
};
