// Shipping rates by country: the Shipping table, read as plain rows, and the
// one rule checkout uses. Pure (test/shipping.test.mjs).
//
// One row is one rate for one or more countries:
//
//   Zone (`name`)                 what the owner calls it: "EU", "United States"
//   Countries (`countries`)       ISO codes, comma-separated: "DE, FR, ES"
//   Shipping cost (`rate`)        a number, 0 for free shipping
//   Currency (`currency`)         empty = the shop's own; another currency than
//                                 the shop's makes the row unusable (reported)
//   Free shipping from (`free-over`)  optional: items total at or above this
//                                 ships free
//   Delivery time (`delivery-estimate`)  shown at checkout, as written
//
// A country can be ordered to only when it is in Settings › Ships to (empty
// there = every country) AND one usable row names it. The first row (by
// Position, then table order) that names a country wins; a later row naming it
// again is reported, never guessed between silently.

import { COUNTRY_CODES, finiteNumber, text } from "./catalog.js";

const COUNTRY_SET = new Set(COUNTRY_CODES);

/** Every way a row can be unusable, for the daily check. */
export const SHIPPING_PROBLEMS = ["no-countries", "unknown-country", "no-rate", "currency-mismatch", "duplicate-country"];

const centsOf = (amount) => Math.round(amount * 100);

/**
 * The Shipping table → `{ rates: Map<code, rate>, problems: [] }`.
 * A rate is `{ zone, country, cost, currency, freeOver, estimate }`.
 */
export const buildShippingRates = (records, settings) => {
  const rates = new Map();
  const problems = [];
  const rows = [...(records ?? [])]
    .map((record, index) => ({ record, index, position: finiteNumber(record?.fields?.position) }))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.index - b.index);
  for (const { record } of rows) {
    const fields = record?.fields ?? {};
    const zone = text(fields.name);
    const rawCodes = text(fields.countries).toUpperCase().split(/[\s,;，、；]+/).filter(Boolean);
    const label = zone || rawCodes.join(", ") || record?.id || "?";
    if (!rawCodes.length) {
      problems.push({ code: "no-countries", zone: label });
      continue;
    }
    const cost = finiteNumber(fields.rate);
    if (cost === null || cost < 0) {
      problems.push({ code: "no-rate", zone: label });
      continue;
    }
    const currency = text(fields.currency).toUpperCase() || settings.currency;
    if (currency !== settings.currency) {
      problems.push({ code: "currency-mismatch", zone: label, currency });
      continue;
    }
    const freeOver = finiteNumber(fields["free-over"]);
    for (const code of rawCodes) {
      if (!COUNTRY_SET.has(code)) {
        problems.push({ code: "unknown-country", zone: label, country: code });
        continue;
      }
      if (rates.has(code)) {
        problems.push({ code: "duplicate-country", zone: label, country: code, kept: rates.get(code).zone });
        continue;
      }
      rates.set(code, {
        zone: label,
        country: code,
        cost: centsOf(cost) / 100,
        currency,
        freeOver: freeOver !== null && freeOver > 0 ? centsOf(freeOver) / 100 : null,
        estimate: text(fields["delivery-estimate"]),
      });
    }
  }
  return { rates, problems };
};

/**
 * Where checkout can ship. `shipping.status` is `ready` (a Shipping table was
 * read), `missing` (a shop installed before Shipping existed: no rates at all,
 * the old order-request form) or `unreadable`.
 */
export const checkoutCountries = (settings, shipping) => {
  if (shipping.status !== "ready") return settings.shipsTo;
  return settings.shipsTo.filter((code) => shipping.rates.has(code));
};

/**
 * The shipping cost of one order, from the rate for its country and its items
 * total. `{ ok: true, cost, estimate, free }` or `{ ok: false, code }`.
 * Without a Shipping table (`missing`) the cost is unknown and left to the owner's reply.
 */
export const shippingFor = (shipping, country, subtotal) => {
  if (shipping.status === "missing") return { ok: true, cost: null, estimate: "", free: false, unknown: true };
  if (shipping.status !== "ready") return { ok: false, code: "shipping_unavailable" };
  const rate = shipping.rates.get(country);
  if (!rate) return { ok: false, code: "no_shipping" };
  const free = rate.cost === 0 || (rate.freeOver !== null && centsOf(subtotal) >= centsOf(rate.freeOver));
  return { ok: true, cost: free ? 0 : rate.cost, estimate: rate.estimate, free, zone: rate.zone };
};

/** What the checkout page's script needs per country: cost, free-over, estimate. Nothing else. */
export const clientRates = (shipping, countries) =>
  shipping.status === "ready"
    ? Object.fromEntries(
        countries.map((code) => {
          const rate = shipping.rates.get(code);
          return [code, { cost: rate.cost, freeOver: rate.freeOver, estimate: rate.estimate }];
        }),
      )
    : {};

// Countries whose addresses have no postal code in common use; everywhere else
// checkout asks for one. And the ones where PayPal and carriers need a state or
// province. Kept short on purpose: a missing code shows as "optional", which a
// buyer can still fill in.
export const NO_POSTAL_CODE = new Set(
  "AE AG AO AW BF BI BJ BO BS BW BZ CD CF CG CI CK CM DJ DM ER FJ GA GD GH GM GQ GY HK IE JM KI KM KN KP LC ML MO MR MS MW NR NU QA RW SB SC SL SO SR ST SY TF TK TL TO TT TV TZ UG VU YE ZW".split(" "),
);
export const REGION_REQUIRED = new Set("AR AU BR CA CN IN JP MX US".split(" "));
