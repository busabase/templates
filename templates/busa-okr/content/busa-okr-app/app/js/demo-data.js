// Sample rows for one fictional company: Northfield Home, a direct-to-consumer
// home and kitchen brand, five weeks into Q4 2026. `scripts/sync-content.mjs`
// writes these into `content/<base>/records.ndjson` (what a fresh install opens
// on), and `?demo=1` reads the same rows, so the two never tell different stories.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// Every light below follows the skill's rule (model.js#statusFor) on 2026-11-05:
// 35 of 91 days gone, so a key result should be about 38% of the way there.

const AGENT = {
  finance: 'Finance agent · Claude Code',
  growth: 'Growth agent · Codex',
  sales: 'Sales agent · Claude Code',
  ops: 'Ops agent · Codex',
  support: 'Support agent · Claude Code',
};
const src = (path) => `https://data.example.com/${path}`;

const objectives = [
  { key: 'obj-revenue', fields: { title: 'Make Q4 our biggest revenue quarter', level: 'company', team: 'company', owner: 'Dana Reyes', quarter: '2026-Q4', confidence: 'on-track', summary: 'Net revenue is on pace at $1.38M; margin is creeping up as freight costs fall.' } },
  { key: 'obj-loyal', fields: { title: 'Keep customers coming back', level: 'company', team: 'company', owner: 'Dana Reyes', quarter: '2026-Q4', confidence: 'at-risk', summary: 'Subscriber churn rose to 9.6% after the October price change; repeat purchase is flat.' } },
  { key: 'obj-lean', fields: { title: 'Run a leaner operation', level: 'company', team: 'company', owner: 'Dana Reyes', quarter: '2026-Q4', confidence: 'on-track', summary: 'Cost per order is down 45 cents since the carrier switch.' } },
  { key: 'obj-bf', fields: { title: 'Win Black Friday on our own store', level: 'team', team: 'growth', owner: 'Priya Nair', quarter: '2026-Q4', parent: 'obj-revenue', confidence: 'at-risk', summary: 'List growth and conversion are fine; paid ads are spending more than they return.' } },
  { key: 'obj-doors', fields: { title: 'Open 40 new wholesale doors', level: 'team', team: 'sales', owner: 'Marcus Lee', quarter: '2026-Q4', parent: 'obj-revenue', confidence: 'watch', summary: 'Pipeline is strong, but only 9 stores have signed; most buyers decide after their holiday sets.' } },
  { key: 'obj-ship', fields: { title: 'Ship every order within 48 hours', level: 'team', team: 'operations', owner: 'Elena Ruiz', quarter: '2026-Q4', parent: 'obj-lean', confidence: 'watch', summary: 'The Monday backlog is the bottleneck; two hero SKUs keep running out.' } },
  { key: 'obj-sameday', fields: { title: 'Answer every customer the same day', level: 'team', team: 'support', owner: 'Sam Okafor', quarter: '2026-Q4', parent: 'obj-loyal', confidence: 'at-risk', summary: 'Ticket volume is up 40% since mid-October and first replies are slipping past 6 pm.' } },
  { key: 'obj-repeat', fields: { title: 'Grow the repeat-buyer program', level: 'team', team: 'growth', owner: 'Priya Nair', quarter: '2026-Q4', parent: 'obj-loyal', confidence: 'watch', summary: 'Repeat rate moved one point; the refill reminder flow launches next week.' } },
];

// [key, title, objective, team, owner, unit, direction, start, target, current, status, source, agent]
const KR = [
  ['kr-revenue', 'Q4 net revenue reaches $4.2M', 'obj-revenue', 'company', 'Jordan Kim', '$', 'increase', 0, 4200000, 1380000, 'on-track', 'Store and wholesale invoices', 'finance'],
  ['kr-margin', 'Gross margin rises from 41% to 45%', 'obj-revenue', 'company', 'Jordan Kim', '%', 'increase', 41, 45, 42.1, 'on-track', 'Monthly P&L', 'finance'],
  ['kr-churn', 'Subscriber 90-day churn falls from 9% to 6%', 'obj-loyal', 'company', 'Priya Nair', '%', 'decrease', 9, 6, 9.6, 'at-risk', 'Subscription billing export', 'growth'],
  ['kr-cost', 'Cost per order shipped falls to $7.20', 'obj-lean', 'company', 'Elena Ruiz', '$', 'decrease', 8.4, 7.2, 7.95, 'on-track', 'Carrier and warehouse invoices', 'ops'],
  ['kr-list', 'Email list grows to 260k subscribers', 'obj-bf', 'growth', 'Priya Nair', 'subscribers', 'increase', 180000, 260000, 205000, 'on-track', 'Email platform audience report', 'growth'],
  ['kr-roas', 'Paid ads return 3.0x on spend', 'obj-bf', 'growth', 'Priya Nair', 'x', 'increase', 2.1, 3, 2, 'at-risk', 'Ads manager export', 'growth'],
  ['kr-cvr', 'Store conversion rate reaches 3.0%', 'obj-bf', 'growth', 'Priya Nair', '%', 'increase', 2.4, 3, 2.55, 'on-track', 'Store analytics', 'growth'],
  ['kr-doors', '40 new wholesale stores signed', 'obj-doors', 'sales', 'Marcus Lee', 'stores', 'increase', 0, 40, 9, 'watch', 'CRM closed-won deals', 'sales'],
  ['kr-pipeline', '$900k of wholesale pipeline created', 'obj-doors', 'sales', 'Marcus Lee', '$', 'increase', 0, 900000, 520000, 'on-track', 'CRM open deals', 'sales'],
  ['kr-48h', '95% of orders ship within 48 hours', 'obj-ship', 'operations', 'Elena Ruiz', '%', 'increase', 71, 95, 74, 'watch', 'Warehouse shipment log', 'ops'],
  ['kr-stockout', 'Stock-outs on top 50 SKUs fall from 9 to 2', 'obj-ship', 'operations', 'Elena Ruiz', 'SKUs', 'decrease', 9, 2, 8, 'watch', 'Inventory report', 'ops'],
  ['kr-firstreply', '90% of tickets get a first reply the same day', 'obj-sameday', 'support', 'Sam Okafor', '%', 'increase', 62, 90, 64, 'at-risk', 'Help desk SLA report', 'support'],
  ['kr-csat', 'Customer satisfaction reaches 4.7 / 5', 'obj-sameday', 'support', 'Sam Okafor', '/5', 'increase', 4.3, 4.7, 4.5, 'on-track', 'Post-ticket survey', 'support'],
  ['kr-repeat', 'Repeat purchase rate rises from 22% to 28%', 'obj-repeat', 'growth', 'Priya Nair', '%', 'increase', 22, 28, 23, 'watch', 'Store customer cohort report', 'growth'],
];

// Each key result's history: [date, value, evidence]. The last entry is its
// current value; the first starts from the key result's start value.
const HISTORY = {
  'kr-revenue': [['2026-10-12', 410000, 'Store $352k + wholesale $58k invoiced Oct 1–12.'], ['2026-10-26', 905000, 'Store $771k + wholesale $134k invoiced through Oct 26.'], ['2026-11-02', 1380000, 'Store $1.12M + wholesale $260k invoiced through Nov 2; early Black Friday preorders included.']],
  'kr-margin': [['2026-10-31', 42.1, 'October P&L closed: freight per unit down 6% after the carrier switch.']],
  'kr-churn': [['2026-10-19', 9.3, 'Price change e-mail went out Oct 8; skips doubled the following week.'], ['2026-11-02', 9.6, '412 of 4,290 subscribers cancelled or lapsed in the trailing 90 days.']],
  'kr-cost': [['2026-10-19', 8.15, 'New regional carrier live on Oct 14.'], ['2026-11-02', 7.95, 'Two weeks on the new carrier; dimensional weight fees down 31%.']],
  'kr-list': [['2026-10-19', 194000, 'Quiz pop-up added 8.6k subscribers in two weeks.'], ['2026-11-02', 205000, 'Early-access Black Friday list drove 11k sign-ups.']],
  'kr-roas': [['2026-10-12', 2.2, 'Spend $48k, attributed revenue $106k.'], ['2026-10-26', 2.05, 'Prospecting CPMs up 28% ahead of the holidays.'], ['2026-11-02', 2, 'Spend $131k, attributed revenue $262k; three prospecting ad sets below 1.5x.']],
  'kr-cvr': [['2026-10-19', 2.5, 'New product page layout on the top 20 SKUs.'], ['2026-11-02', 2.55, 'Free-shipping threshold banner added Oct 28.']],
  'kr-doors': [['2026-10-19', 4, 'Signed: four independent kitchen stores in the Midwest.'], ['2026-11-02', 9, 'Five more signed this fortnight, including a 12-location regional chain (counted as one account).']],
  'kr-pipeline': [['2026-10-19', 280000, '31 qualified deals after the October trade show.'], ['2026-11-02', 520000, '54 qualified deals; average opening order $9.6k.']],
  'kr-48h': [['2026-10-19', 72, 'Monday orders wait up to 70 hours.'], ['2026-11-02', 74, 'Second Monday shift started Oct 27; Mondays now 52 hours.']],
  'kr-stockout': [['2026-10-26', 8, 'Cast-iron skillet and linen apron still out; restock lands Nov 9.']],
  'kr-firstreply': [['2026-10-19', 66, 'Volume 1,180 tickets/week, up from 840.'], ['2026-11-02', 64, '1,410 tickets last week; 36% got their first reply after 6 pm or next day.']],
  'kr-csat': [['2026-11-02', 4.5, '612 survey responses; complaints mention wait time, not answers.']],
  'kr-repeat': [['2026-11-02', 23, 'Repeat buyers 23% of October orders; refill reminders not live yet.']],
};

const krRows = KR.map(([key, title, objective, team, owner, unit, direction, start, target, current, status, source, agent]) => {
  const last = HISTORY[key].at(-1);
  return { key, fields: { title, objective, team, owner, status, unit, direction, 'start-value': start, 'target-value': target, 'current-value': current, source, 'updated-by': AGENT[agent], 'updated-on': last[0] } };
});

const fmt = (unit, value) => (unit === '$' ? (value === 0 ? '$0' : value >= 10000 ? `$${value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : `${Math.round(value / 1000)}k`}` : `$${value.toFixed(2)}`)
  : unit === '%' ? `${value}%` : unit === 'x' ? `${value}x` : unit === '/5' ? `${value}` : value >= 10000 ? `${Math.round(value / 1000)}k` : String(value));

const SHORT = {
  'kr-revenue': 'Q4 net revenue', 'kr-margin': 'Gross margin', 'kr-churn': 'Subscriber churn', 'kr-cost': 'Cost per order',
  'kr-list': 'Email list', 'kr-roas': 'Paid ads return', 'kr-cvr': 'Store conversion', 'kr-doors': 'Wholesale stores signed',
  'kr-pipeline': 'Wholesale pipeline', 'kr-48h': 'Shipped within 48h', 'kr-stockout': 'Top-SKU stock-outs',
  'kr-firstreply': 'Same-day first reply', 'kr-csat': 'Customer satisfaction', 'kr-repeat': 'Repeat purchase rate',
};

const checkIns = KR.flatMap(([key, , , , , unit, , start, , , , source, agent]) => {
  let previous = start;
  return HISTORY[key].map(([date, value, evidence], index) => {
    const row = { key: `ci-${key}-${index + 1}`, fields: {
      title: `${SHORT[key]}: ${fmt(unit, previous)} → ${fmt(unit, value)}`,
      'key-result': key, 'checked-on': date, 'previous-value': previous, 'new-value': value,
      'written-by': AGENT[agent], writer: 'agent', evidence: `${evidence} Source: ${source}.`,
      'source-url': src(`${key}/${date}`),
    } };
    previous = value;
    return row;
  });
});
// One number a person typed in, so the feed shows both kinds of writer.
checkIns.push({ key: 'ci-kr-doors-ceo', fields: {
  title: 'Wholesale stores: chain deal confirmed by phone', 'key-result': 'kr-doors', 'checked-on': '2026-11-03', 'previous-value': 9, 'new-value': 9,
  'written-by': 'Dana Reyes', writer: 'person', evidence: 'Spoke with the regional chain’s buyer: all 12 locations stock us from January. Count stays at one account.',
} });

const actions = [
  { key: 'act-roas', fields: { title: 'Move budget from three weak prospecting ad sets to retargeting', 'key-result': 'kr-roas', status: 'in-progress', owner: 'Priya Nair', 'due-date': '2026-11-12', 'proposed-by': AGENT.growth, cause: 'Holiday auction pushed prospecting CPMs up 28%; three ad sets return under 1.5x and take 41% of spend.', plan: 'Pause the three ad sets, shift $18k a week to retargeting and the early-access list, re-check return after seven days.' } },
  { key: 'act-firstreply', fields: { title: 'Agent drafts the first reply for order-status tickets', 'key-result': 'kr-firstreply', status: 'open', owner: 'Sam Okafor', 'due-date': '2026-11-10', 'proposed-by': AGENT.support, cause: 'Order-status questions are 47% of new tickets and wait behind complex cases.', plan: 'Let the support agent draft replies from the shipment log for order-status tickets; a person sends them. Target: first reply within two hours.' } },
  { key: 'act-churn', fields: { title: 'Win-back offer for subscribers who skipped two boxes', 'key-result': 'kr-churn', status: 'in-progress', owner: 'Priya Nair', 'due-date': '2026-11-14', 'proposed-by': AGENT.growth, cause: 'Cancellations cluster two to three weeks after the price-change e-mail, mostly among annual-plan renewals.', plan: 'Offer one free box to 640 subscribers with two skips; call the top 50 by lifetime value.' } },
  { key: 'act-doors', fields: { title: 'Book follow-up meetings with 15 trade-show buyers', 'key-result': 'kr-doors', status: 'open', owner: 'Marcus Lee', 'due-date': '2026-11-03', 'proposed-by': AGENT.sales, cause: 'Buyers met at the October show have not been followed up; 22 of 54 deals have no next step.', plan: 'Send samples to the 15 largest buyers and book a 20-minute call with each before Thanksgiving.' } },
  { key: 'act-48h', fields: { title: 'Add a second packing shift on Mondays', 'key-result': 'kr-48h', status: 'done', owner: 'Elena Ruiz', 'due-date': '2026-10-27', 'proposed-by': AGENT.ops, cause: 'Weekend orders pile up and Monday packing finishes Tuesday night.', plan: 'Second shift 2–10 pm on Mondays through December.' } },
  { key: 'act-stockout', fields: { title: 'Reorder the top 10 SKUs two weeks earlier through December', 'key-result': 'kr-stockout', status: 'in-progress', owner: 'Elena Ruiz', 'due-date': '2026-11-07', 'proposed-by': AGENT.ops, cause: 'Supplier lead times stretched from 21 to 34 days; reorder points were set for summer.', plan: 'Raise reorder points on the top 10 SKUs and place December POs this week.' } },
];

const reviews = [
  { key: 'rev-oct-26', fields: { title: 'Week of Oct 20 – Oct 26', status: 'final', 'period-start': '2026-10-20', 'period-end': '2026-10-26', headline: 'Revenue on pace; paid ads and response time slipping.', 'at-risk-count': 2, 'written-by': AGENT.finance,
    body: '**Overall:** 22% of the way through the quarter by revenue, with 29% of the time gone.\n\n**At risk**\n- Paid ads return fell to 2.05x as holiday CPMs rose.\n- First replies the same day fell to 66% as ticket volume rose 40%.\n\n**Changed since last week**\n- New carrier cut cost per order to $8.15.\n- 31 qualified wholesale deals after the trade show.' } },
  { key: 'rev-nov-02', fields: { title: 'Week of Oct 27 – Nov 2', status: 'final', 'period-start': '2026-10-27', 'period-end': '2026-11-02', headline: 'Revenue on pace; three key results need a decision this week.', 'at-risk-count': 3, 'written-by': AGENT.finance,
    body: '**Overall:** net revenue $1.38M, 33% of the $4.2M target with 37% of the quarter gone. 7 of 14 key results on track, 4 on watch, 3 at risk.\n\n**Growth** — List at 205k; paid ads at 2.0x against a 3.0x target. Action: move $18k a week to retargeting.\n\n**Sales** — 9 stores signed of 40; pipeline $520k is ahead of plan. 22 deals have no next step.\n\n**Operations** — Monday shift lifted on-time shipping to 74%; two hero SKUs still out until Nov 9.\n\n**Support** — 1,410 tickets last week; same-day first reply 64%. Action: agent-drafted replies for order-status tickets.\n\n**Decisions for Monday**\n1. Shift $18k a week of ad budget to retargeting.\n2. Let the support agent draft order-status replies.\n3. Run the subscriber win-back offer (one free box, 640 subscribers).' } },
];

export const demoRecords = {
  objectives,
  'key-results': krRows,
  'check-ins': checkIns,
  actions,
  reviews,
};
