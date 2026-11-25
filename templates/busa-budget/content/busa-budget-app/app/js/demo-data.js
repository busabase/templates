// Sample rows for one fictional company: Northpine Software, a 420-person B2B
// software company with 16 cost centers, on Monday 2026-11-16. The fiscal year
// is the calendar year and October is closed, so year-to-date means January to
// October. `scripts/sync-content.mjs` writes these into
// `content/<base>/records.ndjson` (what a fresh install opens on), and
// `?demo=1` reads the same rows, so the two never tell different stories.
// Every person, vendor and number below is fictional. Money is in US dollars.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// Every score and status below follows the skill's rule (model.js#scoreParts,
// #statusFor); the unit test recomputes each one.

const AGENT = {
  spend: 'Ledger agent · Codex',
  forecast: 'Forecast agent · Claude Code',
  headcount: 'HRIS agent · Codex',
  purchasing: 'Procurement agent · Claude Code',
  renewals: 'Contracts agent · Claude Code',
  ops: 'FP&A agent · Claude Code',
};
const src = (path) => `https://data.example.com/${path}`;
// The executive who owns each division's budget, and the FP&A partners.
const OWNER = { product: 'Elena Marsh', gtm: 'Ravi Kapoor', operations: 'Ana Lucero', 'g-and-a': 'Peter Novak' };
const FP = { grace: 'Grace Lin', daniel: 'Daniel Okafor', maya: 'Maya Brennan' };

// [key, name, division, finance partner, annual budget $K, last forecast refresh,
//  spend vs YTD budget %, forecast vs budget %, committed $K, heads over plan,
//  POs without a budget line, renewals without a decision, score, status, summary].
// YTD budget is ten twelfths of the year; YTD actual and the forecast are
// derived from the two percentages, so the fields always agree with each other.
const DEPARTMENTS = [
  ['cc-sales-emea', 'Sales EMEA', 'gtm', FP.daniel, 5200, '2026-11-10', 9, 11, 410, 3, 2, 1, 18, 'at-risk', 'Paris and Munich opened two months early with three account executives hired ahead of plan; the full-year forecast runs $572K over.'],
  ['cc-demand-gen', 'Marketing Demand Gen', 'gtm', FP.daniel, 6400, '2026-11-12', 7, 8, 620, 0, 3, 2, 26, 'at-risk', 'Paid search ran 40% over plan since September to rescue pipeline, and three event sponsorships were booked without a budget line; $512K over for the year.'],
  ['cc-data-ai', 'Data & AI', 'product', FP.grace, 4800, '2026-10-14', 5, 9, 540, 2, 1, 1, 36, 'at-risk', 'GPU usage for the assistant beta tripled after launch; the forecast has not been refreshed in 33 days and already showed $432K over.'],
  ['cc-eng-platform', 'Engineering Platform', 'product', FP.grace, 9600, '2026-11-09', 3, 4, 780, 1, 0, 2, 56, 'watch', 'Cloud hosting is 3% ahead of budget after the EU region went live; two large renewals land in December with no decision yet.'],
  ['cc-it', 'IT', 'operations', FP.grace, 3100, '2026-11-05', 2, 3, 260, 0, 1, 3, 50, 'watch', 'Three SaaS renewals worth $410K come up within 60 days and nobody has decided whether to renew, cut seats or switch.'],
  ['cc-customer-success', 'Customer Success', 'gtm', FP.daniel, 4200, '2026-11-11', 1, 2, 120, 3, 0, 0, 64, 'watch', 'On budget so far, but three CSMs were hired ahead of the plan’s Q1 start dates; the payroll lands in December.'],
  ['cc-brand-events', 'Brand & Events', 'gtm', FP.daniel, 2600, '2026-11-06', 4, 1, 190, 0, 2, 0, 64, 'watch', 'The user-conference venue deposit was paid early; two agency POs went out without a budget line.'],
  ['cc-eng-apps', 'Engineering Apps', 'product', FP.grace, 8200, '2026-11-09', 1, 2, 340, 0, 0, 0, 84, 'on-track', 'Contractor spend for the mobile rewrite is slightly ahead; the forecast is $164K over and the team is absorbing it in Q4.'],
  ['cc-product-design', 'Product Design', 'product', FP.grace, 1900, '2026-11-09', -2, -1, 40, 0, 0, 0, 100, 'on-track', 'Under budget; the research-panel contract came in lower than planned.'],
  ['cc-sales-na', 'Sales NA', 'gtm', FP.daniel, 7400, '2026-11-10', 2, 1, 380, 0, 0, 1, 76, 'on-track', 'Commissions are running ahead with bookings, which is the good kind of overspend; one CRM add-on renewal needs a decision.'],
  ['cc-support', 'Support', 'operations', FP.grace, 2800, '2026-11-05', -1, 0, 90, 1, 0, 0, 92, 'on-track', 'On budget; one support engineer was hired a month early to cover the holiday queue.'],
  ['cc-security', 'Security', 'product', FP.grace, 2400, '2026-11-02', -3, -2, 210, 0, 0, 1, 92, 'on-track', 'Under budget after the pen-test vendor change; the SIEM renewal is due in January.'],
  ['cc-finance', 'Finance', 'g-and-a', FP.maya, 1600, '2026-11-12', 0, -1, 60, 0, 0, 0, 100, 'on-track', 'Exactly on budget; the audit fee was fixed in the engagement letter.'],
  ['cc-people', 'People', 'g-and-a', FP.maya, 2000, '2026-11-12', 1, 0, 140, 0, 1, 0, 84, 'on-track', 'On budget; one recruiting-agency PO went out before its budget line was set up.'],
  ['cc-legal', 'Legal', 'g-and-a', FP.maya, 1400, '2026-10-09', -4, -3, 85, 0, 0, 0, 100, 'on-track', 'Under budget, but the forecast has not been refreshed since October 9.'],
  ['cc-facilities', 'Facilities', 'operations', FP.grace, 2200, '2026-10-12', 2, 1, 175, 0, 0, 1, 76, 'on-track', 'Slightly ahead on utilities; the forecast is 35 days old and the Austin lease renewal needs a decision.'],
];

const round1000 = (value) => Math.round(value / 1000) * 1000;
const departments = DEPARTMENTS.map(([key, name, division, partner, budgetK, forecastOn, spendPct, forecastPct, committedK, heads, pos, renewals, score, status, summary]) => {
  const annual = budgetK * 1000;
  const ytdBudget = round1000((annual * 10) / 12);
  const ytdActual = round1000(ytdBudget * (1 + spendPct / 100));
  const forecast = round1000(annual * (1 + forecastPct / 100));
  return {
    key,
    fields: {
      name, division, 'budget-owner': OWNER[division], 'finance-partner': partner, 'annual-budget': annual, 'forecast-on': forecastOn,
      'ytd-budget': ytdBudget, 'ytd-actual': ytdActual, 'ytd-variance-pct': Math.round(((ytdActual - ytdBudget) / ytdBudget) * 100),
      forecast, 'forecast-variance-pct': Math.round(((forecast - annual) / annual) * 100), committed: committedK * 1000,
      'headcount-gap': heads, 'unbudgeted-pos': pos, 'renewals-undecided': renewals,
      score, status, 'scored-by': AGENT.ops, 'scored-on': '2026-11-16', summary,
    },
  };
});

const pct = (value) => `${value > 0 ? '+' : ''}${value}%`;
const KIND = {
  spend: [(was, now) => `Spend vs YTD budget: ${pct(was)} → ${pct(now)}`, AGENT.spend, 'General ledger, October close'],
  forecast: [(was, now) => `Full-year forecast vs budget: ${pct(was)} → ${pct(now)}`, AGENT.forecast, 'Forecast model'],
  headcount: [(was, now) => `Heads over plan: ${was} → ${now}`, AGENT.headcount, 'HRIS and the headcount plan'],
  purchasing: [(was, now) => `Open POs without a budget line: ${was} → ${now}`, AGENT.purchasing, 'Procurement system'],
  renewals: [(was, now) => `Renewals in 60 days without a decision: ${was} → ${now}`, AGENT.renewals, 'Contract register'],
};

// [department, kind, date, was, now, evidence]. Each signal moves one measure;
// the department's field holds the latest one, and `forecast-on` the date of the
// latest forecast signal.
const SIGNALS = [
  ['cc-sales-emea', 'headcount', '2026-11-02', 1, 3, 'Three account executives in Paris and Munich started in September and October; the plan had them in January.'],
  ['cc-sales-emea', 'spend', '2026-11-04', 5, 9, 'October close: $4.72M spent against $4.33M budgeted year to date; office fit-out and the early hires account for most of it.'],
  ['cc-sales-emea', 'purchasing', '2026-11-06', 0, 2, 'PO-8841 (Munich office furniture) and PO-8857 (recruiter fee) were raised without a budget line.'],
  ['cc-sales-emea', 'forecast', '2026-11-10', 6, 11, 'Full-year forecast is $5.77M against a $5.2M budget: actuals to date, $410K of open POs and the new heads’ November–December payroll.'],
  ['cc-sales-emea', 'renewals', '2026-11-12', 0, 1, 'The Munich serviced-office agreement renews Dec 31; no decision on a longer lease.'],
  ['cc-demand-gen', 'spend', '2026-11-04', 4, 7, 'October close: $5.71M spent against $5.33M year to date; paid search ran 40% over plan in September and October.'],
  ['cc-demand-gen', 'purchasing', '2026-11-07', 1, 3, 'Sponsorships for SaaS Connect, CloudSummit and the Berlin roadshow were booked on PO-8862 to PO-8864 with no budget line.'],
  ['cc-demand-gen', 'renewals', '2026-11-09', 1, 2, 'The marketing-automation and intent-data contracts both renew in December; neither has an owner decision.'],
  ['cc-demand-gen', 'forecast', '2026-11-12', 3, 8, 'Full-year forecast is $6.91M against a $6.4M budget if paid search stays at the October run rate.'],
  ['cc-data-ai', 'forecast', '2026-10-14', 2, 9, 'Forecast refreshed after the assistant beta launch: GPU usage tripled, putting the year at $5.23M against $4.8M.'],
  ['cc-data-ai', 'headcount', '2026-11-03', 0, 2, 'Two ML engineers converted from contractors to employees in October, ahead of the plan.'],
  ['cc-data-ai', 'spend', '2026-11-04', 1, 5, 'October close: $4.2M spent against $4.0M year to date; GPU instances are the whole gap.'],
  ['cc-data-ai', 'purchasing', '2026-11-08', 0, 1, 'PO-8870 reserves GPU capacity for Q1 at $280K; it has no 2026 budget line.'],
  ['cc-data-ai', 'renewals', '2026-11-10', 0, 1, 'The vector-database contract renews Dec 15 at a 30% higher list price.'],
  ['cc-eng-platform', 'spend', '2026-11-04', 1, 3, 'October close: $8.24M spent against $8.0M year to date; the EU region added $35K a month of hosting.'],
  ['cc-eng-platform', 'forecast', '2026-11-09', 2, 4, 'Full-year forecast is $9.98M against a $9.6M budget at the current hosting run rate.'],
  ['cc-eng-platform', 'headcount', '2026-11-03', 0, 1, 'One SRE backfill started before the leaver’s last day.'],
  ['cc-eng-platform', 'renewals', '2026-11-11', 0, 2, 'The observability and CI contracts renew in December; usage reviews are not done.'],
  ['cc-it', 'renewals', '2026-11-03', 1, 3, 'Collaboration suite, device management and the password manager renew within 60 days, $410K in total; no decision on any of them.'],
  ['cc-it', 'spend', '2026-11-04', 1, 2, 'October close: $2.64M spent against $2.58M year to date; laptop refresh landed early.'],
  ['cc-it', 'forecast', '2026-11-05', 1, 3, 'Full-year forecast is $3.19M against a $3.1M budget, assuming all three renewals at list price.'],
  ['cc-it', 'purchasing', '2026-11-08', 0, 1, 'PO-8859 (conference-room displays) has no budget line.'],
  ['cc-customer-success', 'headcount', '2026-11-03', 0, 3, 'Three CSMs started in November; the plan had them starting in January.'],
  ['cc-customer-success', 'forecast', '2026-11-11', 0, 2, 'Full-year forecast is $4.28M against a $4.2M budget once the new CSMs’ payroll is in.'],
  ['cc-brand-events', 'spend', '2026-11-04', 0, 4, 'October close: $2.25M spent against $2.17M year to date; the 2027 user-conference venue deposit was paid in October.'],
  ['cc-brand-events', 'purchasing', '2026-11-06', 0, 2, 'PO-8848 (video agency) and PO-8853 (swag vendor) were raised without a budget line.'],
  ['cc-eng-apps', 'forecast', '2026-11-09', 1, 2, 'Full-year forecast is $8.36M against an $8.2M budget; mobile-rewrite contractors run to mid-December.'],
  ['cc-sales-na', 'spend', '2026-11-04', 1, 2, 'October close: $6.29M spent against $6.17M year to date; commissions are ahead because bookings are 9% ahead.'],
  ['cc-sales-na', 'renewals', '2026-11-10', 0, 1, 'The CRM add-on for call recording renews Jan 5; the team is deciding whether to keep it.'],
  ['cc-support', 'headcount', '2026-11-03', 0, 1, 'One support engineer started in November to cover the holiday queue, a month ahead of plan.'],
  ['cc-security', 'renewals', '2026-11-02', 0, 1, 'The SIEM contract renews Jan 10; the renewal quote is 12% higher.'],
  ['cc-finance', 'forecast', '2026-11-12', 0, -1, 'Full-year forecast is $1.58M against a $1.6M budget; the audit fee is fixed.'],
  ['cc-people', 'purchasing', '2026-11-07', 0, 1, 'PO-8851 (recruiting agency) went out before its budget line was set up.'],
  ['cc-legal', 'forecast', '2026-10-09', -2, -3, 'Full-year forecast is $1.36M against a $1.4M budget; outside counsel came in under estimate.'],
  ['cc-facilities', 'forecast', '2026-10-12', 0, 1, 'Full-year forecast is $2.22M against a $2.2M budget; utilities are slightly ahead.'],
  ['cc-facilities', 'renewals', '2026-11-05', 0, 1, 'The Austin office lease renews Jan 31; the landlord wants an answer by Dec 15.'],
];

const signals = SIGNALS.map(([department, kind, date, was, now, evidence], index) => {
  const [label, writer, source] = KIND[kind];
  const fields = {
    title: label(was, now), department, kind, 'recorded-on': date, 'new-value': now,
    'written-by': writer, writer: 'agent', evidence: `${evidence} Source: ${source}.`, 'source-url': src(`${department}/${kind}/${date}`),
  };
  if (was != null) fields['previous-value'] = was;
  return { key: `sig-${index + 1}`, fields };
});
// A note carries no number. Both from finance partners.
signals.push(
  { key: 'sig-emea-hiring', fields: {
    title: 'The CRO approved the early hires verbally', department: 'cc-sales-emea', kind: 'note', 'recorded-on': '2026-11-13',
    'written-by': FP.daniel, writer: 'person', evidence: 'The CRO says he approved the three early hires in August to catch a competitor’s customers, but no budget transfer was ever made.',
  } },
  { key: 'sig-data-gpu', fields: {
    title: 'A GPU price cut is expected in January', department: 'cc-data-ai', kind: 'note', 'recorded-on': '2026-11-12',
    'written-by': FP.grace, writer: 'person', evidence: 'The cloud account manager says on-demand GPU prices drop about 15% on Jan 1; reserving now may lock in the higher price.',
  } },
);

const actions = [
  { key: 'act-emea-transfer', fields: { title: 'Agree a budget transfer for Sales EMEA’s early hires', department: 'cc-sales-emea', status: 'in-progress', owner: OWNER.gtm, 'due-date': '2026-11-20', 'proposed-by': AGENT.ops, cause: 'Three account executives started four months ahead of plan and the offices opened early; the year runs $572K over.', plan: 'Move $350K from Sales NA’s unused enablement budget; freeze the remaining EMEA discretionary spend until year end; re-forecast on Dec 1.' } },
  { key: 'act-demandgen-search', fields: { title: 'Cap paid search at plan for November and December', department: 'cc-demand-gen', status: 'open', owner: OWNER.gtm, 'due-date': '2026-11-18', 'proposed-by': AGENT.forecast, cause: 'Paid search ran 40% over plan for two months, and three sponsorships were booked without a budget line.', plan: 'Set daily caps at the plan rate; ask the CFO to approve or cancel the three sponsorship POs; re-forecast after the cap.' } },
  { key: 'act-data-forecast', fields: { title: 'Refresh the Data & AI forecast and decide on the GPU reservation', department: 'cc-data-ai', status: 'open', owner: OWNER.product, 'due-date': '2026-11-13', 'proposed-by': AGENT.forecast, cause: 'The forecast is 33 days old while GPU usage tripled; PO-8870 reserves Q1 capacity with no budget line.', plan: 'Re-run the forecast with November usage; compare the reservation with January’s expected price cut; bring both to the Thursday spend review.' } },
  { key: 'act-it-renewals', fields: { title: 'Decide the three IT renewals before Dec 1', department: 'cc-it', status: 'open', owner: OWNER.operations, 'due-date': '2026-11-27', 'proposed-by': AGENT.renewals, cause: 'Three SaaS contracts worth $410K renew within 60 days with no decision.', plan: 'Pull seat usage for each; propose renew, cut seats or switch; get the COO’s decision before notice periods close.' } },
  { key: 'act-legal-forecast', fields: { title: 'Refresh the Legal and Facilities forecasts', department: 'cc-legal', status: 'open', owner: FP.maya, 'due-date': '2026-11-20', 'proposed-by': AGENT.ops, cause: 'Both forecasts are more than 30 days old.', plan: 'Update with October actuals and open POs; confirm the Austin lease assumption with Facilities.' } },
  { key: 'act-brand-pos', fields: { title: 'Attach budget lines to Brand & Events’ two open POs', department: 'cc-brand-events', status: 'done', owner: FP.daniel, 'due-date': '2026-11-10', 'proposed-by': AGENT.purchasing, cause: 'Two agency POs went out without a budget line.', plan: 'Done on Nov 10 for the video agency; the swag PO is waiting for the vendor’s revised quote.' } },
];

const reviews = [
  { key: 'rev-nov-08', fields: { title: 'Week of Nov 2 – Nov 8', status: 'final', 'period-start': '2026-11-02', 'period-end': '2026-11-08', headline: 'Projected overrun $1.48M; Sales EMEA is the one cost center at risk.', 'projected-overrun': 1480000, 'committed-total': 4120000, 'on-track-count': 11, 'at-risk-count': 1, 'forecast-stale-count': 2, 'written-by': AGENT.ops,
    body: '**Projected overrun: $1,480,000.** **11 of 16** cost centers on track.\n\n**At risk**\n- **Sales EMEA** — three early hires and two early office openings.\n\n**Watch**\n- **Marketing Demand Gen** — paid search over plan for a second month.\n- **Data & AI** — GPU usage rising after the beta.\n\n**Forecasts older than 30 days**\n- **Data & AI** — last refreshed Oct 14.\n- **Legal** — last refreshed Oct 9.' } },
  { key: 'rev-nov-15', fields: { title: 'Week of Nov 9 – Nov 15', status: 'draft', 'period-start': '2026-11-09', 'period-end': '2026-11-15', headline: 'The year is forecast $2.36M over budget; 3 cost centers are at risk.', 'projected-overrun': 2363000, 'committed-total': 4440000, 'on-track-count': 9, 'at-risk-count': 3, 'forecast-stale-count': 3, 'written-by': AGENT.ops,
    body: '**Projected overrun: $2,363,000 on a $65.8M budget (3.6%)**, up from $1,480,000. **9 of 16** cost centers on track, down from 11. **Open POs: $4.44M.**\n\n**At risk**\n- **Sales EMEA** — score 18, $572K over. Early hires and offices. Action: budget transfer from Sales NA by Nov 20.\n- **Marketing Demand Gen** — score 26, $512K over. Paid search 40% over plan; three sponsorships without a budget line. Action: cap search at plan.\n- **Data & AI** — score 36, $432K over. GPU usage tripled. Action: refresh the forecast — **overdue since Nov 13**.\n\n**Forecasts older than 30 days**\n- **Legal** (38 days) and **Facilities** (35 days) — refresh booked for Nov 20.\n- **Data & AI** (33 days) — at risk as well.\n\n**Decisions for Thursday’s spend review**\n1. Approve or cancel Demand Gen’s three sponsorship POs.\n2. Approve the $350K transfer to Sales EMEA.\n3. Hold the Q1 GPU reservation until January’s price change.' } },
];

export const demoRecords = {
  departments,
  signals,
  actions,
  reviews,
};
