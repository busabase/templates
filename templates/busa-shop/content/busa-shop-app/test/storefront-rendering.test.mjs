import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homePage, productPage, orderPage, accountPage } from "../src/pages.js";
import { buildCatalog, normalizeSettings } from "../src/catalog.js";
import { MESSAGES, translator } from "../src/i18n.js";
import { demoState } from "./fixtures.mjs";

const origin = "https://store.example";
const fixture = async () => {
  const state = await demoState({ source: "shop", imageUrl: (file) => `https://images.example/${file}` });
  const settings = normalizeSettings(state.records.bas_settings[0]);
  const catalog = buildCatalog({ productRecords: state.records.bas_shop_products, certificateRecords: [], settings, busabaseOrigin: "https://busabase.example", nowMs: Date.parse("2026-11-18"), shape: "shop" });
  return { settings, catalog };
};
const electronicProduct = (product) => ({ ...product,
  name: 'Xinghe A1 Test 8GB+256GB Blue (China version)',
  content: { description: 'A test phone, not a real product.', attributes: {
    brand: 'Xinghe', model: 'A1 Test', memory: '8GB', storage: '256GB', color: 'Blue',
    screen: '6.7-inch display', battery: '5000 mAh', network: 'Check supported bands', os: 'China-version system; software support varies',
  } },
});

describe("a reusable storefront", () => {
  it("shows all toy products before JavaScript, without phone or China-edition claims", async () => {
    const {settings, catalog} = await fixture();
    const html = homePage({origin, settings, catalog, site: {account: true}});
    assert.equal((html.match(/data-catalog-product /g) || []).length, catalog.listed.length);
    assert.match(html, /data-catalog-controls hidden/);
    assert.match(html, /data-catalog-sort/);
    assert.match(html, /data-catalog-count aria-live="polite"/);
    assert.match(html, /data-header-search href="\/#products"/);
    assert.match(html, /class="icon-link order-link"[^>]*aria-label="Your order"/);
    assert.doesNotMatch(html, /China edition|China-version|Shop phones|Search phones|From China/);
    const product = productPage({origin, settings, product: catalog.listed[0]});
    assert.doesNotMatch(product, /China edition|network compatibility/);
    assert.match(product, /Walking Robot Buddy/);
    assert.match(product, /Age/);
  });

  it("shows edition advice only from explicit edition facts, not the manufacturing country", async () => {
    const {settings, catalog} = await fixture();
    const china = electronicProduct(catalog.listed[0]);
    const html = productPage({origin, settings, product: china});
    assert.match(html, /<h1>A1 Test<\/h1>/);
    assert.match(html, /8GB RAM · 256GB · Blue/);
    assert.match(html, /China edition/);
    assert.match(html, /Check network compatibility/);
    assert.match(html, /China-version system; software support varies/);
    assert.match(html, /Xinghe A1 Test 8GB\+256GB Blue \(China version\)/);
    const plain = { ...catalog.listed[0], content: { ...catalog.listed[0].content, attributes: { country_of_origin: 'China' } } };
    assert.doesNotMatch(productPage({origin, settings, product: plain}), /China edition|Country of origin/);
    assert.doesNotMatch(homePage({origin, settings, catalog:{...catalog,listed:[plain]}}), /China edition/);
    assert.match(homePage({origin, settings, catalog:{...catalog,listed:[china]}}), /feature-edition">China edition/);
  });

  it("escapes source facts in filters, cards, product names and the featured item", async () => {
    const {settings, catalog} = await fixture();
    const unsafe = electronicProduct(catalog.listed[0]);
    unsafe.name = '<img src=x onerror=alert(1)>';
    unsafe.content.attributes.brand = '\"><svg onload=alert(1)>';
    unsafe.content.attributes.model = '<script>alert(1)</script>';
    const html = homePage({origin, settings:{...settings,contactEmail:""}, catalog:{...catalog,listed:[unsafe]}});
    assert.doesNotMatch(html, /<img src=x|<svg onload=|<script>alert/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /data-brand="&quot;&gt;&lt;svg onload=alert\(1\)&gt;"/);
    assert.doesNotMatch(html, /mailto:/, "no invented contact when the shop has none");
  });

  it("translates every new interface key and preserves interpolation placeholders in all supported languages", async () => {
    const {settings,catalog} = await fixture();
    const keys = Object.keys(MESSAGES.en).filter((key) => key.startsWith('storefront_'));
    const params = (value) => [...value.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
    for (const locale of ['en','de','fr','es']) {
      for (const key of keys) {
        assert.equal(typeof MESSAGES[locale][key], 'string', `${locale}:${key}`);
        assert.deepEqual(params(MESSAGES[locale][key]), params(MESSAGES.en[key]), `${locale}:${key} placeholders`);
      }
      const t = translator(locale);
      const html = homePage({origin,settings:{...settings,language:locale},catalog});
      assert.ok(html.includes(t('storefront_hero_title')));
      assert.ok(html.includes(t('storefront_sort_low')));
      assert.match(html,new RegExp(`<html lang="${locale}">`));
      if (locale !== 'en') assert.doesNotMatch(html, /Better finds\. Less guesswork\.|Clear filters|Search products|Default order/);
    }
  });

  it("retains unique checkout fields, total hooks and existing passwordless login protections", async () => {
    const {settings,catalog} = await fixture();
    const html = orderPage({origin,settings,catalog,orderId:"ORD-7K2M9QX4PT"});
    for (const hook of ['data-order-form','data-order-total','data-order-items','data-form-status']) assert.equal((html.match(new RegExp(`${hook}[ >]`, 'g')) || []).length, 1, hook);
    assert.match(html,/Your order request is empty/); assert.match(html,/Browse products/);
    assert.equal((html.match(/name="email"/g)||[]).length,1);
    assert.equal((html.match(/name="country"/g)||[]).length,1);
    const account = accountPage({origin,settings,site:{account:true},view:{kind:'email',formTime:'test-stamp'}});
    assert.match(account,/name="robots" content="noindex"/);
    assert.match(account,/action="\/account\/send-code"/);
    assert.match(account,/name="form_time" value="test-stamp"/);
    assert.match(account,/name="referral"/); assert.doesNotMatch(account,/type="password"/);
  });

  it("handles an empty collection and labels a sold-out featured product truthfully", async () => {
    const {settings,catalog} = await fixture();
    const empty = homePage({origin,settings,catalog:{...catalog,listed:[]}});
    assert.match(empty,/No products are listed yet/); assert.doesNotMatch(empty,/data-catalog-controls/);
    const soldOut = {...catalog.listed[0], soldOut:true};
    const html = homePage({origin,settings,catalog:{...catalog,listed:[soldOut]}});
    assert.match(html,/feature-edition">Out of stock/);
    assert.doesNotMatch(html,/verified reviews|five.star|official partner|limited.time deal/i);
  });
});
