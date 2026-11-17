// Sample rows for one fictional brand: Juniper & Tide, a skincare and
// home-fragrance brand that sells live on TikTok Shop, Douyin, Taobao Live,
// Kuaishou, Xiaohongshu and Shopee Live, on Monday 2026-11-09 — two days
// before Double 11. `scripts/sync-content.mjs` writes these into
// `content/<base>/records.ndjson` (what a fresh install opens on), and
// `?demo=1` reads the same rows, so the two never tell different stories.
// Every person below is fictional. Money is in US dollars.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// Every score and status below follows the skill's rule (model.js#scoreParts,
// #statusFor); the unit test recomputes each one.

const AGENT = {
  stock: 'Inventory agent · Codex',
  prep: 'Producer agent · Claude Code',
  shop: 'Shop-analytics agent · Codex',
  refund: 'After-sales agent · Claude Code',
  ops: 'Live-ops agent · Claude Code',
};
const src = (path) => `https://data.example.com/${path}`;

// [key, title, channel, host, producer, live date, slot, hero product, target $, GMV $,
//  stock %, prep %, GMV %, conversion %, refund %, score, status, summary]
// '' is "no reading yet": before a session airs there is no GMV, conversion or
// refund rate, and refunds settle seven days after it airs.
const SESSIONS = [
  ['s-d11-douyin', 'Double 11 mega live — night skincare', 'douyin', 'Xiao Ning', 'Lin Yue', '2026-11-11', '19:00–02:00', 'Ceramide Night Cream 50 ml', 420000, '', 100, 100, '', '', '', 70, 'on-track', 'All 18,000 night-cream units are in the Hangzhou warehouse and the run of show is locked two days out.'],
  ['s-d11-taobao', 'Double 11 pre-sale, final hours', 'taobao-live', 'Chen Hao', 'Lin Yue', '2026-11-10', '20:00–24:00', 'Vitamin C Serum 30 ml', 260000, '', 80, 95, '', '', '', 48, 'at-risk', 'Goes live tomorrow 2,000 serum units short: they are held at Ningbo customs until Nov 12, and the red-packet rain is not set up.'],
  ['s-shopee-1111', '11.11 flash-sale live', 'shopee-live', 'Putri Ayu', 'Arif Rahman', '2026-11-11', '20:00–23:00 WIB', 'Hydra Gel Cleanser', 45000, '', 90, 100, '', '', '', 62, 'watch', 'The Jakarta warehouse is 300 cleansers short after the payday sell-through; everything else is ready.'],
  ['s-tts-bf', 'Black Friday early access', 'tiktok-shop', 'Jade Park', 'Mara Quinn', '2026-11-14', '18:00–21:00 PT', 'Cedar & Fig Candle Trio', 150000, '', 100, 75, '', '', '', 56, 'watch', 'Stock is in, but three of eight affiliate clips still wait for brand approval and the Black Friday coupon is not live.'],
  ['s-xhs-gift', 'Holiday gift-guide live', 'xiaohongshu', 'Su Li', 'Lin Yue', '2026-11-20', '20:00–22:00', 'Gift Set No. 3', 60000, '', 100, 100, '', '', '', 70, 'on-track', 'Eleven days out and nothing due is missing.'],
  ['s-douyin-1108', 'Pre-11.11 warm-up', 'douyin', 'Xiao Ning', 'Lin Yue', '2026-11-08', '19:00–23:00', 'Ceramide Night Cream 50 ml', 180000, 205000, 100, 100, 114, 5.2, '', 90, 'on-track', 'Beat the target by 14% with 5.2% of viewers buying; refunds settle on Nov 15.'],
  ['s-tts-1107', 'Friday-night candle drop', 'tiktok-shop', 'Tasha Brooks', 'Mara Quinn', '2026-11-07', '18:00–20:00 PT', 'Cedar & Fig Candle', 40000, 46800, 100, 100, 117, 4.6, '', 90, 'on-track', 'Sold through the limited fig scent in 70 minutes; refunds settle on Nov 14.'],
  ['s-taobao-1104', 'Serum restock live', 'taobao-live', 'Chen Hao', 'Lin Yue', '2026-11-04', '20:00–23:00', 'Vitamin C Serum 30 ml', 90000, 61200, 70, 100, 68, 3.4, 6.5, 44, 'at-risk', 'The serum sold out 40 minutes in with only 70% of planned units on hand; 1,900 orders went to a waitlist and buyers are cancelling.'],
  ['s-douyin-1101', 'Night-cream launch', 'douyin', 'Xiao Ning', 'Lin Yue', '2026-11-01', '19:00–23:00', 'Ceramide Night Cream 50 ml', 150000, 162000, 100, 100, 108, 4.8, 4.1, 100, 'on-track', 'The launch the Double 11 plan is built on: 108% of target and a 4.1% refund rate.'],
  ['s-tts-1031', 'Halloween bundle live', 'tiktok-shop', 'Jade Park', 'Mara Quinn', '2026-10-31', '17:00–20:00 PT', 'Pumpkin Spice Candle Bundle', 60000, 52800, 100, 100, 88, 3.6, 14.5, 64, 'watch', 'Sold well, but 14.5% of orders were refunded: candle glass from one batch arrived cracked.'],
  ['s-xhs-1029', 'Routine Q&A with a dermatologist', 'xiaohongshu', 'Su Li', 'Lin Yue', '2026-10-29', '20:00–21:30', 'Barrier Repair Kit', 30000, 33900, 100, 100, 113, 6.1, 2.8, 100, 'on-track', 'The best-converting format on the desk: 6.1% of viewers bought and only 2.8% refunded.'],
  ['s-shopee-1028', 'Payday sale live', 'shopee-live', 'Putri Ayu', 'Arif Rahman', '2026-10-28', '19:00–22:00 WIB', 'Hydra Gel Cleanser', 25000, 14500, 100, 80, 58, 1.6, 9.0, 32, 'at-risk', 'The host’s audio dropped for 25 minutes and the payday voucher was never switched on: 58% of target.'],
  ['s-douyin-1025', 'Autumn skin-barrier special', 'douyin', 'Xiao Ning', 'Lin Yue', '2026-10-25', '19:00–23:00', 'Barrier Repair Kit', 120000, 126000, 100, 100, 105, 4.3, 5.0, 100, 'on-track', 'On target on every measure.'],
  ['s-tts-1024', 'Candle care 101', 'tiktok-shop', 'Tasha Brooks', 'Mara Quinn', '2026-10-24', '18:00–20:00 PT', 'Cedar & Fig Candle', 35000, 31500, 100, 100, 90, 4.1, 4.4, 92, 'on-track', 'A teaching format that converts: 90% of target with 4.1% of viewers buying.'],
  ['s-kuaishou-1021', 'Factory tour live', 'kuaishou', 'Wang Bo', 'Lin Yue', '2026-10-21', '14:00–17:00', 'Gift Set No. 3', 50000, 47000, 100, 90, 94, 4.0, 6.0, 76, 'on-track', 'Worked despite a Wi-Fi drop at the factory; the backup line was never tested.'],
  ['s-taobao-1018', 'Member day live', 'taobao-live', 'Chen Hao', 'Lin Yue', '2026-10-18', '20:00–23:00', 'Vitamin C Serum 30 ml', 80000, 84000, 100, 100, 105, 3.8, 5.6, 84, 'on-track', 'Above target; the serum demand here is why the Nov 4 restock was planned.'],
];

const MEASURE = { stock: 'stock-pct', prep: 'prep-pct', gmv: 'gmv-pct', conversion: 'conversion-pct', refund: 'refund-pct' };

const sessions = SESSIONS.map(([key, title, channel, host, producer, date, slot, hero, target, gmv, stock, prep, gmvPct, conversion, refund, score, status, summary]) => {
  const fields = { title, channel, host, producer, 'live-date': date, slot, 'hero-product': hero, 'target-gmv': target, score, status, 'scored-by': AGENT.ops, 'scored-on': '2026-11-09', summary };
  if (gmv !== '') fields.gmv = gmv;
  const readings = { stock, prep, gmv: gmvPct, conversion, refund };
  for (const [kind, value] of Object.entries(readings)) if (value !== '') fields[MEASURE[kind]] = value;
  return { key, fields };
});

const KIND = {
  stock: [(was, now) => `Stock in the warehouse: ${was}% → ${now}% of planned units`, AGENT.stock, 'Warehouse management system'],
  prep: [(was, now) => `Pre-live checklist: ${was}% → ${now}%`, AGENT.prep, 'Run-of-show checklist'],
  gmv: [(was, now) => (was == null ? `GMV: ${now}% of target` : `GMV: ${was}% → ${now}% of target`), AGENT.shop, 'Shop analytics'],
  conversion: [(was, now) => (was == null ? `Conversion: ${now}% of viewers bought` : `Conversion: ${was}% → ${now}%`), AGENT.shop, 'Shop analytics'],
  refund: [(was, now) => (was == null ? `Refunds, 7 days: ${now}%` : `Refunds, 7 days: ${was}% → ${now}%`), AGENT.refund, 'Orders and returns'],
};

// [session, kind, date, was, now, evidence]. Each signal moves one measure; the
// session's field holds the latest one. The stock and checklist measures are
// read before the session airs; GMV and conversion the day after; refunds when
// the seven-day window closes.
const SIGNALS = [
  ['s-d11-douyin', 'stock', '2026-11-06', 85, 100, 'The last 2,700 night-cream units were received at the Hangzhou warehouse (PO-3381); 18,000 of 18,000 planned are in.'],
  ['s-d11-douyin', 'prep', '2026-11-08', 70, 100, 'Run of show locked: 24 product cards live, six coupon tiers set, samples on set, script signed off by Lin Yue.'],
  ['s-d11-taobao', 'stock', '2026-11-05', 100, 80, '2,000 of 10,000 planned serum units are held at Ningbo customs for a label check (declaration NB-77120); release expected Nov 12, two days after the live.'],
  ['s-d11-taobao', 'prep', '2026-11-07', 80, 95, 'Script and product cards done; the red-packet rain for the 22:00 peak is not configured in the Taobao Live console.'],
  ['s-shopee-1111', 'stock', '2026-11-06', 100, 90, 'Payday sold through 300 more cleansers than planned; Jakarta holds 2,700 of the 3,000 planned units (WMS-JKT-552).'],
  ['s-shopee-1111', 'prep', '2026-11-06', 85, 100, 'Flash-sale vouchers scheduled and checked, audio test booked for Nov 11 at 18:00.'],
  ['s-tts-bf', 'stock', '2026-11-04', 90, 100, 'All 5,000 candle trios are at the Reno 3PL (ASN-20931).'],
  ['s-tts-bf', 'prep', '2026-11-07', 50, 75, 'Five of eight affiliate creator clips approved; three still wait for brand review, and the Black Friday coupon is drafted but not live.'],
  ['s-xhs-gift', 'stock', '2026-11-05', 90, 100, 'Gift Set No. 3 fully kitted: 2,400 of 2,400 sets.'],
  ['s-xhs-gift', 'prep', '2026-11-06', 60, 100, 'Gift-guide notes published, product cards live and the giveaway approved by Xiaohongshu.'],
  ['s-douyin-1108', 'gmv', '2026-11-09', null, 114, '$205,000 of a $180,000 target after cancellations.'],
  ['s-douyin-1108', 'conversion', '2026-11-09', null, 5.2, '9,860 buyers out of 189,600 unique viewers.'],
  ['s-tts-1107', 'gmv', '2026-11-08', null, 117, '$46,800 of a $40,000 target; the limited fig scent sold out at minute 70.'],
  ['s-tts-1107', 'conversion', '2026-11-08', null, 4.6, '1,240 buyers out of 26,900 unique viewers.'],
  ['s-taobao-1104', 'stock', '2026-11-04', 100, 70, 'A 30% inbound shipment missed the cut-off, so 7,000 of 10,000 planned serum units were on hand; they sold out at minute 40 and 1,900 orders were waitlisted.'],
  ['s-taobao-1104', 'gmv', '2026-11-05', null, 68, '$61,200 of a $90,000 target; waitlisted orders are not counted until they ship.'],
  ['s-taobao-1104', 'conversion', '2026-11-05', null, 3.4, '3,050 buyers out of 89,700 unique viewers.'],
  ['s-taobao-1104', 'refund', '2026-11-08', 4.0, 6.5, 'Waitlisted buyers are cancelling: 142 of 2,190 orders refunded so far.'],
  ['s-douyin-1101', 'gmv', '2026-11-03', 112, 108, 'Final GMV after cancellations: $162,000 of $150,000.'],
  ['s-douyin-1101', 'conversion', '2026-11-02', null, 4.8, '8,100 buyers out of 168,700 unique viewers.'],
  ['s-douyin-1101', 'refund', '2026-11-08', 3.2, 4.1, 'Seven-day window closed: 332 of 8,100 orders refunded, mostly duplicate orders.'],
  ['s-tts-1031', 'gmv', '2026-11-01', null, 88, '$52,800 of a $60,000 target.'],
  ['s-tts-1031', 'conversion', '2026-11-01', null, 3.6, '1,410 buyers out of 39,200 unique viewers.'],
  ['s-tts-1031', 'refund', '2026-11-07', 6.0, 14.5, 'Seven-day window closed: 204 of 1,410 orders refunded, 171 of them for cracked candle glass from batch CG-1019.'],
  ['s-xhs-1029', 'gmv', '2026-10-30', null, 113, '$33,900 of a $30,000 target.'],
  ['s-xhs-1029', 'refund', '2026-11-05', null, 2.8, 'Seven-day window closed: 31 of 1,100 orders refunded.'],
  ['s-shopee-1028', 'prep', '2026-10-28', 100, 80, 'The payday voucher was scheduled for the wrong day and never went live; no audio check was on the checklist.'],
  ['s-shopee-1028', 'gmv', '2026-10-29', null, 58, '$14,500 of a $25,000 target; 25 minutes without audio at the peak.'],
  ['s-shopee-1028', 'conversion', '2026-10-29', null, 1.6, '610 buyers out of 38,100 unique viewers.'],
  ['s-shopee-1028', 'refund', '2026-11-04', null, 9.0, 'Seven-day window closed: 55 of 610 orders refunded, many asking for the missing voucher.'],
  ['s-douyin-1025', 'refund', '2026-11-01', null, 5.0, 'Seven-day window closed: 270 of 5,400 orders refunded.'],
  ['s-tts-1024', 'refund', '2026-10-31', null, 4.4, 'Seven-day window closed: 41 of 930 orders refunded.'],
  ['s-kuaishou-1021', 'prep', '2026-10-21', 100, 90, 'The backup 4G line at the factory was on the checklist but never tested; it was needed for 6 minutes.'],
  ['s-kuaishou-1021', 'conversion', '2026-10-22', null, 4.0, '1,520 buyers out of 38,000 unique viewers.'],
  ['s-taobao-1018', 'refund', '2026-10-25', 5.0, 5.6, 'Seven-day window closed: 129 of 2,300 orders refunded.'],
];

const signals = SIGNALS.map(([session, kind, date, was, now, evidence], index) => {
  const [label, writer, source] = KIND[kind];
  const fields = {
    title: label(was, now), session, kind, 'recorded-on': date, 'new-value': now,
    'written-by': writer, writer: 'agent', evidence: `${evidence} Source: ${source}.`, 'source-url': src(`${session}/${kind}/${date}`),
  };
  if (was != null) fields['previous-value'] = was;
  return { key: `sig-${index + 1}`, fields };
});
// A note carries no number. One from a producer, one from operations.
signals.push(
  { key: 'sig-taobao-customs', fields: {
    title: 'Customs hold: cap the serum pre-sale at what we hold?', session: 's-d11-taobao', kind: 'note', 'recorded-on': '2026-11-06',
    'written-by': 'Lin Yue', writer: 'person', evidence: 'Our broker says Ningbo customs will not release the 2,000 serums before Nov 12. Selling past 8,000 units tomorrow repeats the Nov 4 waitlist.',
  } },
  { key: 'sig-candle-carrier', fields: {
    title: 'Carrier confirmed crushed cartons from the Oct 31 batch', session: 's-tts-1031', kind: 'note', 'recorded-on': '2026-11-07',
    'written-by': 'Mara Quinn', writer: 'person', evidence: 'The carrier admits the single-wall cartons were crushed on the Reno line. The Black Friday candles ship from the same 3PL.',
  } },
);

const actions = [
  { key: 'act-taobao-cap', fields: { title: 'Cap the Double 11 serum pre-sale at 8,000 units and add a restock alert', session: 's-d11-taobao', status: 'in-progress', owner: 'Lin Yue', 'due-date': '2026-11-10', 'proposed-by': AGENT.stock, cause: '2,000 of 10,000 serums are held at customs until Nov 12; the session is on Nov 10. Selling past the stock on hand repeats the Nov 4 waitlist.', plan: 'Set the purchase limit to 8,000 in the Taobao Live console; pin a restock-alert card for the held units; set up the red-packet rain before 18:00.' } },
  { key: 'act-shopee-transfer', fields: { title: 'Move 300 cleansers from Singapore to Jakarta before 11.11', session: 's-shopee-1111', status: 'open', owner: 'Arif Rahman', 'due-date': '2026-11-10', 'proposed-by': AGENT.stock, cause: 'Payday sold through 300 more cleansers than planned; Jakarta holds 2,700 of 3,000.', plan: 'Book the overnight transfer from the Singapore warehouse; if it misses Nov 10, lower the flash-sale quantity to 2,700.' } },
  { key: 'act-tts-creatives', fields: { title: 'Approve the three pending affiliate clips and switch on the Black Friday coupon', session: 's-tts-bf', status: 'open', owner: 'Mara Quinn', 'due-date': '2026-11-12', 'proposed-by': AGENT.prep, cause: 'Three of eight creator clips wait for brand review and the coupon is still a draft; the session is on Nov 14.', plan: 'Review the three clips with brand on Nov 10; publish the coupon on Nov 12 and test it on a staff account.' } },
  { key: 'act-candle-carton', fields: { title: 'Switch candle shipments to double-wall cartons and file the carrier claim', session: 's-tts-1031', status: 'open', owner: 'Dev Malik (operations)', 'due-date': '2026-11-06', 'proposed-by': AGENT.refund, cause: '171 of 1,410 Halloween orders arrived with cracked glass; the carrier confirmed crushed single-wall cartons. Black Friday candles ship from the same 3PL.', plan: 'Change the packing spec at the Reno 3PL to double-wall cartons before Nov 12; file the claim for the 171 orders.' } },
  { key: 'act-taobao-waitlist', fields: { title: 'Ship or refund the 1,900 waitlisted serum orders', session: 's-taobao-1104', status: 'in-progress', owner: 'Lin Yue', 'due-date': '2026-11-13', 'proposed-by': AGENT.ops, cause: 'The serum sold out 40 minutes in; 1,900 orders wait for stock and buyers are cancelling.', plan: 'Message waitlisted buyers with a ship date of Nov 13 and a small coupon; refund anyone who asks within 24 hours.' } },
  { key: 'act-shopee-runbook', fields: { title: 'Add an audio check and a voucher check to the Shopee pre-live checklist', session: 's-shopee-1028', status: 'done', owner: 'Arif Rahman', 'due-date': '2026-11-04', 'proposed-by': AGENT.prep, cause: 'The payday live lost 25 minutes of audio and ran without its voucher.', plan: 'Both checks added on Nov 3; the 11.11 session’s checklist already includes them.' } },
];

const reviews = [
  { key: 'rev-nov-01', fields: { title: 'Week of Oct 26 – Nov 1', status: 'final', 'period-start': '2026-10-26', 'period-end': '2026-11-01', headline: '$263K GMV in four sessions, 99% of target; the Shopee payday live missed badly.', 'week-gmv': 263200, 'on-track-count': 9, 'at-risk-count': 1, 'not-ready-count': 0, 'written-by': AGENT.ops,
    body: '**GMV: $263,200 of $265,000 (99%)** across four sessions.\n\n**At risk**\n- **Payday sale live** (Shopee, Oct 28): audio dropped for 25 minutes and the voucher never went live; 58% of target.\n\n**Watch**\n- **Halloween bundle live** (TikTok Shop): refunds still settling; cracked-glass complaints rising.\n\n**Best**\n- **Night-cream launch** (Douyin, Nov 1): 108% of target, the base for the Double 11 plan.' } },
  { key: 'rev-nov-08', fields: { title: 'Week of Nov 2 – Nov 8', status: 'draft', 'period-start': '2026-11-02', 'period-end': '2026-11-08', headline: '$313K GMV in three sessions; 3 sessions at risk and 2 Double 11 sessions go live without all their stock.', 'week-gmv': 313000, 'on-track-count': 10, 'at-risk-count': 3, 'not-ready-count': 2, 'written-by': AGENT.ops,
    body: '**GMV: $313,000 of $310,000 (101%)** across three sessions. **10 of 16** sessions on the desk are on track.\n\n**At risk**\n- **Double 11 pre-sale, final hours** — Taobao Live, Nov 10, score 48. 2,000 serums held at customs until Nov 12. Action: cap the pre-sale at 8,000 units, by Nov 10.\n- **Serum restock live** — Taobao Live, Nov 4, score 44. Sold out at minute 40; 1,900 orders waitlisted. Action: ship or refund by Nov 13.\n- **Payday sale live** — Shopee, Oct 28, score 32. Checklist fixed; no repeat expected.\n\n**Going live in 7 days, not ready**\n- **Double 11 pre-sale** (Nov 10): 80% of stock.\n- **11.11 flash-sale live** (Nov 11): 90% of stock. Action: transfer 300 cleansers from Singapore.\n\n**Overdue**\n- The candle carton switch was due Nov 6 — Black Friday candles ship from the same 3PL on Nov 14.\n\n**Decisions for Monday**\n1. Approve the 8,000-unit cap on the Taobao pre-sale.\n2. Approve the Singapore → Jakarta transfer.\n3. Get the double-wall carton spec signed today.' } },
];

export const demoRecords = {
  sessions,
  signals,
  actions,
  reviews,
};
