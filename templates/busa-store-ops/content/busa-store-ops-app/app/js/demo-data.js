// Sample rows for one fictional chain: Harbor & Hearth, a coffee-and-bakery
// chain with 16 cafés in the Bay Area, Seattle, Portland and Los Angeles, on
// Monday 2026-11-16. `scripts/sync-content.mjs` writes these into
// `content/<base>/records.ndjson` (what a fresh install opens on), and
// `?demo=1` reads the same rows, so the two never tell different stories.
// Every person and address below is fictional. Money is in US dollars.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// Every score and status below follows the skill's rule (model.js#scoreParts,
// #statusFor); the unit test recomputes each one.

const AGENT = {
  audit: 'Inspection agent · Codex',
  sales: 'POS agent · Codex',
  rating: 'Reviews agent · Claude Code',
  staffing: 'Scheduling agent · Claude Code',
  fixes: 'Facilities agent · Codex',
  ops: 'Store-ops agent · Claude Code',
};
const src = (path) => `https://data.example.com/${path}`;
const AM = { bay: 'Dana Whitfield', sea: 'Marcus Lee', pdx: 'Priya Nair', la: 'Sofia Reyes' };

// [key, name, region, area manager, store manager, address, revenue $ 30 d, last audit,
//  audit score, sales %, rating, staffing %, overdue fixes, score, status, summary]
const STORES = [
  ['st-mission', 'Mission Street', 'bay-area', AM.bay, 'Leo Martins', '2140 Mission St, San Francisco', 142000, '2026-11-12', 72, 91, 4.1, 92, 3, 24, 'at-risk', 'Failed two critical audit items when the walk-in cooler ran at 46°F; three fixes are past due and reviews mention warm drinks and dirty tables.'],
  ['st-capitol-hill', 'Capitol Hill', 'seattle', AM.sea, 'Ava Thompson', '1520 E Pine St, Seattle', 118000, '2026-10-28', 84, 86, 4.0, 88, 1, 30, 'at-risk', 'Two openers resigned: 11 of 92 shifts went unfilled, the café closed at 3 pm twice and sales are 14% under target.'],
  ['st-venice', 'Venice Boulevard', 'los-angeles', AM.la, 'Noah Garcia', '1311 Abbot Kinney Blvd, Los Angeles', 131000, '2026-11-06', 78, 97, 3.8, 96, 2, 36, 'at-risk', 'Reviews fell to 3.8 on slow morning service and a hair-in-pastry photo; the audit flagged the pastry case.'],
  ['st-ballard', 'Ballard', 'seattle', AM.sea, 'Grace Kim', '5420 Ballard Ave NW, Seattle', 133000, '2026-10-02', 86, 101, 4.2, 95, 2, 62, 'watch', 'Selling above target, but it has not been audited in 45 days and two fixes are open.'],
  ['st-oakland', 'Oakland Uptown', 'bay-area', AM.bay, 'Malik Johnson', '2001 Broadway, Oakland', 117000, '2026-11-04', 91, 92, 4.3, 94, 1, 56, 'watch', 'Road works on Broadway cut morning foot traffic; sales are 8% under target.'],
  ['st-pearl', 'Pearl District', 'portland', AM.pdx, 'Emma Clarke', '1015 NW Couch St, Portland', 109000, '2026-10-24', 88, 94, 4.4, 97, 0, 62, 'watch', 'Slightly under target on sales since the new competitor opened on the block.'],
  ['st-union-square', 'Union Square', 'bay-area', AM.bay, 'Isabel Moreno', '333 Post St, San Francisco', 186000, '2026-10-21', 95, 108, 4.6, 99, 0, 100, 'on-track', 'The flagship: 8% over target on every measure.'],
  ['st-palo-alto', 'Palo Alto', 'bay-area', AM.bay, 'Ethan Wu', '455 University Ave, Palo Alto', 158000, '2026-11-03', 92, 103, 4.5, 98, 0, 100, 'on-track', 'Audit up four points after the new closing checklist.'],
  ['st-san-jose', 'Downtown San Jose', 'bay-area', AM.bay, 'Chloe Park', '96 S 1st St, San Jose', 96000, '2026-11-10', 90, 104, 4.3, 99, 0, 92, 'on-track', 'Opened Nov 2; passed its first audit with 90.'],
  ['st-slu', 'South Lake Union', 'seattle', AM.sea, 'Daniel Brooks', '400 Fairview Ave N, Seattle', 149000, '2026-10-26', 90, 99, 4.6, 98, 1, 84, 'on-track', 'One open fix: the pastry-case light.'],
  ['st-fremont', 'Fremont', 'seattle', AM.sea, 'Olivia Hayes', '3416 Fremont Ave N, Seattle', 127000, '2026-10-29', 89, 104, 4.4, 99, 0, 84, 'on-track', 'Steady; weekend brunch keeps it above target.'],
  ['st-alberta', 'Alberta Arts', 'portland', AM.pdx, 'Lucas Reed', '2930 NE Alberta St, Portland', 112000, '2026-11-01', 93, 100, 4.7, 97, 0, 92, 'on-track', 'Best reviews in the chain at 4.7.'],
  ['st-hawthorne', 'Hawthorne', 'portland', AM.pdx, 'Mia Foster', '3570 SE Hawthorne Blvd, Portland', 104000, '2026-10-08', 88, 97, 4.5, 98, 0, 84, 'on-track', 'On standard, but the last audit was 39 days ago.'],
  ['st-silver-lake', 'Silver Lake', 'los-angeles', AM.la, 'Jayden Cruz', '3920 Sunset Blvd, Los Angeles', 163000, '2026-10-30', 94, 102, 4.6, 99, 0, 100, 'on-track', 'On target on every measure.'],
  ['st-santa-monica', 'Santa Monica', 'los-angeles', AM.la, 'Harper Lewis', '1402 Montana Ave, Santa Monica', 171000, '2026-10-23', 91, 96, 4.4, 98, 1, 76, 'on-track', 'Slightly under target since the beach season ended; one fix open on the ice machine.'],
  ['st-pasadena', 'Pasadena', 'los-angeles', AM.la, 'Owen Bennett', '41 E Colorado Blvd, Pasadena', 121000, '2026-10-27', 87, 101, 4.5, 96, 0, 84, 'on-track', 'One barista on leave; floaters are covering.'],
];

const MEASURE = { audit: 'audit-score', sales: 'sales-pct', rating: 'rating', staffing: 'staffing-pct', fixes: 'overdue-fixes' };

const stores = STORES.map(([key, name, region, areaManager, storeManager, address, revenue, auditedOn, audit, sales, rating, staffing, fixes, score, status, summary]) => {
  const fields = { name, region, 'area-manager': areaManager, 'store-manager': storeManager, address, 'revenue-30d': revenue, 'audited-on': auditedOn, score, status, 'scored-by': AGENT.ops, 'scored-on': '2026-11-16', summary };
  const readings = { audit, sales, rating, staffing, fixes };
  for (const [kind, value] of Object.entries(readings)) if (value !== '') fields[MEASURE[kind]] = value;
  return { key, fields };
});

const KIND = {
  audit: [(was, now) => (was == null ? `First standards audit: ${now}` : `Standards audit: ${was} → ${now}`), AGENT.audit, 'Standards audit app'],
  sales: [(was, now) => (was == null ? `Sales vs target: ${now}%` : `Sales vs target: ${was}% → ${now}%`), AGENT.sales, 'POS'],
  rating: [(was, now) => (was == null ? `Review rating: ${now.toFixed(1)}` : `Review rating: ${was.toFixed(1)} → ${now.toFixed(1)}`), AGENT.rating, 'Google and Yelp reviews'],
  staffing: [(was, now) => `Shifts filled: ${was}% → ${now}%`, AGENT.staffing, 'Scheduling system'],
  fixes: [(was, now) => `Audit fixes past due: ${was} → ${now}`, AGENT.fixes, 'Facilities queue'],
};

// [store, kind, date, was, now, evidence]. Each signal moves one measure; the
// store's field holds the latest one, and `audited-on` the latest audit's date.
const SIGNALS = [
  ['st-mission', 'audit', '2026-11-12', 89, 72, 'Walk-in cooler at 46°F (limit 41°F) and unlabeled prep containers: two critical items; 31 of 43 checks passed, with photos.'],
  ['st-mission', 'fixes', '2026-11-13', 1, 3, 'Cooler repair FM-2207 has been open for 9 days; the hand-sink soap dispenser (FM-2215) and the back-door pest seal (FM-2219) are past due.'],
  ['st-mission', 'staffing', '2026-11-14', 97, 92, '7 of 88 shifts unfilled in 14 days; the closing shift ran one person short four times.'],
  ['st-mission', 'rating', '2026-11-15', 4.4, 4.1, '23 reviews in 30 days; 9 mention warm iced drinks or sticky tables.'],
  ['st-mission', 'sales', '2026-11-15', 97, 91, '$71,400 month to date against a $78,500 target; the iced-drink line is down 22% since the cooler failed.'],
  ['st-capitol-hill', 'audit', '2026-10-28', 88, 84, 'Passed, with milk dating and the mop sink flagged; 37 of 43 checks passed.'],
  ['st-capitol-hill', 'fixes', '2026-10-30', 0, 1, 'The mop-sink drain (FM-2188) is past due.'],
  ['st-capitol-hill', 'staffing', '2026-11-10', 98, 88, 'Two openers resigned on Nov 3; 11 of 92 shifts unfilled and the café closed at 3 pm on Nov 7 and Nov 9.'],
  ['st-capitol-hill', 'rating', '2026-11-14', 4.3, 4.0, '17 reviews in 30 days; five complain the café was closed during posted hours.'],
  ['st-capitol-hill', 'sales', '2026-11-15', 99, 86, '$50,600 month to date against $58,800; afternoons are down 31%.'],
  ['st-venice', 'audit', '2026-11-06', 85, 78, 'The pastry case had no sneeze-guard and tongs were missing; 34 of 43 checks passed.'],
  ['st-venice', 'fixes', '2026-11-09', 1, 2, 'The pastry-case sneeze-guard (FM-2201) and the ice-machine filter (FM-2196) are past due.'],
  ['st-venice', 'rating', '2026-11-13', 4.4, 3.8, '41 reviews in 30 days; 14 mention 15-minute waits between 7 and 9 am, and one Yelp photo shows a hair on a croissant.'],
  ['st-venice', 'sales', '2026-11-15', 99, 97, '$62,900 month to date against $64,800.'],
  ['st-ballard', 'audit', '2026-10-02', 90, 86, 'Passed; espresso-machine drip tray and the front-door closer flagged. 38 of 43 checks passed.'],
  ['st-ballard', 'fixes', '2026-11-05', 1, 2, 'The espresso-machine leak (FM-2179) and the front-door closer (FM-2183) are past due.'],
  ['st-oakland', 'fixes', '2026-11-07', 0, 1, 'The outdoor-seating umbrella base (FM-2199) is past due.'],
  ['st-oakland', 'staffing', '2026-11-11', 97, 94, '5 of 84 shifts unfilled; two baristas switched to the San Jose opening.'],
  ['st-oakland', 'sales', '2026-11-15', 97, 92, '$56,300 month to date against $61,200; Broadway road works since Nov 2 cut 7–10 am traffic by a fifth.'],
  ['st-pearl', 'rating', '2026-11-12', 4.5, 4.4, '19 reviews in 30 days; steady.'],
  ['st-pearl', 'sales', '2026-11-15', 98, 94, '$51,600 month to date against $54,900; a new café opened on the block on Nov 1.'],
  ['st-union-square', 'sales', '2026-11-15', 104, 108, '$95,200 month to date against $88,100; holiday shoppers arrived early.'],
  ['st-palo-alto', 'audit', '2026-11-03', 88, 92, 'Up four points after the new closing checklist; 41 of 43 checks passed.'],
  ['st-san-jose', 'audit', '2026-11-10', null, 90, 'First audit after the Nov 2 opening; 40 of 43 checks passed.'],
  ['st-san-jose', 'rating', '2026-11-14', null, 4.3, 'First 30-day window: 12 reviews.'],
  ['st-san-jose', 'sales', '2026-11-15', null, 104, '$41,600 month to date against $40,000.'],
  ['st-slu', 'fixes', '2026-11-11', 0, 1, 'The pastry-case light (FM-2204) is past due.'],
  ['st-fremont', 'rating', '2026-11-09', 4.5, 4.4, '22 reviews in 30 days.'],
  ['st-alberta', 'rating', '2026-11-14', 4.6, 4.7, '26 reviews in 30 days; best in the chain.'],
  ['st-hawthorne', 'audit', '2026-10-08', 85, 88, 'Passed; 39 of 43 checks.'],
  ['st-silver-lake', 'audit', '2026-10-30', 91, 94, 'Passed; 42 of 43 checks.'],
  ['st-santa-monica', 'fixes', '2026-11-10', 0, 1, 'The ice-machine drain (FM-2203) is past due.'],
  ['st-santa-monica', 'sales', '2026-11-15', 99, 96, '$82,600 month to date against $86,000; beach traffic ended with October.'],
  ['st-pasadena', 'staffing', '2026-11-12', 98, 96, '3 of 80 shifts unfilled while one barista is on leave.'],
];

const signals = SIGNALS.map(([store, kind, date, was, now, evidence], index) => {
  const [label, writer, source] = KIND[kind];
  const fields = {
    title: label(was, now), store, kind, 'recorded-on': date, 'new-value': now,
    'written-by': writer, writer: 'agent', evidence: `${evidence} Source: ${source}.`, 'source-url': src(`${store}/${kind}/${date}`),
  };
  if (was != null) fields['previous-value'] = was;
  return { key: `sig-${index + 1}`, fields };
});
// A note carries no number. Both from area managers.
signals.push(
  { key: 'sig-mission-compressor', fields: {
    title: 'Cooler compressor is on backorder until Nov 20', store: 'st-mission', kind: 'note', 'recorded-on': '2026-11-14',
    'written-by': AM.bay, writer: 'person', evidence: 'The repair company found a failed compressor; the part arrives Nov 20. Until then dairy is moved to the reach-in fridges twice a day.',
  } },
  { key: 'sig-capitol-hiring', fields: {
    title: 'Capitol Hill: both openers left for the café across the street', store: 'st-capitol-hill', kind: 'note', 'recorded-on': '2026-11-05',
    'written-by': AM.sea, writer: 'person', evidence: 'Exit chats: both baristas moved to the new café on Pine for $1.50 more an hour. Ava is covering opens herself.',
  } },
);

const actions = [
  { key: 'act-mission-cooler', fields: { title: 'Replace the walk-in cooler compressor and re-audit Mission Street', store: 'st-mission', status: 'in-progress', owner: AM.bay, 'due-date': '2026-11-20', 'proposed-by': AGENT.fixes, cause: 'The cooler runs at 46°F, which failed two critical audit items and is behind the warm-drink reviews; three fixes are past due.', plan: 'Compressor install on Nov 20; dairy in reach-ins until then; close FM-2215 and FM-2219 this week; re-audit on Nov 21.' } },
  { key: 'act-capitol-staffing', fields: { title: 'Cover Capitol Hill’s opening shifts with floaters and hire two baristas', store: 'st-capitol-hill', status: 'open', owner: AM.sea, 'due-date': '2026-11-18', 'proposed-by': AGENT.staffing, cause: 'Two openers resigned; 11 of 92 shifts went unfilled and the café closed early twice.', plan: 'Move two floaters from Fremont and South Lake Union for opens; post two barista roles; review the starting wage against the café on Pine.' } },
  { key: 'act-venice-service', fields: { title: 'Reset Venice’s morning rush: a second register and a pastry-case check', store: 'st-venice', status: 'open', owner: AM.la, 'due-date': '2026-11-14', 'proposed-by': AGENT.rating, cause: 'Waits of 15 minutes from 7 to 9 am and a pastry-case hygiene complaint took reviews from 4.4 to 3.8.', plan: 'Open the second register from 7 to 9 am; install the sneeze-guard (FM-2201); add a pastry-case check to the hourly list; reply to the Yelp review.' } },
  { key: 'act-ballard-audit', fields: { title: 'Audit Ballard this week', store: 'st-ballard', status: 'open', owner: AM.sea, 'due-date': '2026-11-19', 'proposed-by': AGENT.audit, cause: 'Last audited Oct 2, 45 days ago; two fixes are open.', plan: 'Full standards audit on Nov 19; check the espresso-machine leak and the front-door closer.' } },
  { key: 'act-oakland-traffic', fields: { title: 'Run a road-works loyalty offer at Oakland Uptown', store: 'st-oakland', status: 'in-progress', owner: AM.bay, 'due-date': '2026-11-21', 'proposed-by': AGENT.ops, cause: 'Broadway road works cut morning traffic by a fifth; sales are 8% under target.', plan: 'Double loyalty points before 10 am until the works end; sidewalk sign at 20th St; review sales on Nov 21.' } },
  { key: 'act-santa-monica-close', fields: { title: 'Retrain Santa Monica closers on the new checklist', store: 'st-santa-monica', status: 'done', owner: 'Harper Lewis', 'due-date': '2026-11-12', 'proposed-by': AGENT.audit, cause: 'Closing items were missed in the October audit.', plan: 'Done on Nov 11; all four closers signed the checklist.' } },
];

const reviews = [
  { key: 'rev-nov-08', fields: { title: 'Week of Nov 2 – Nov 8', status: 'final', 'period-start': '2026-11-02', 'period-end': '2026-11-08', headline: '12 of 16 stores on standard; Venice is the one store at risk, $131K of monthly revenue.', 'revenue-at-risk': 131000, 'on-track-count': 12, 'at-risk-count': 1, 'audit-overdue-count': 1, 'written-by': AGENT.ops,
    body: '**On standard: 12 of 16.** Downtown San Jose opened on Nov 2.\n\n**At risk**\n- **Venice Boulevard** — audit fell to 78 on the pastry case; reviews are slipping.\n\n**Watch**\n- **Capitol Hill** — two openers resigned on Nov 3.\n- **Oakland Uptown** — road works on Broadway since Nov 2.\n\n**Audit overdue**\n- **Ballard** — last audited Oct 2.' } },
  { key: 'rev-nov-15', fields: { title: 'Week of Nov 9 – Nov 15', status: 'draft', 'period-start': '2026-11-09', 'period-end': '2026-11-15', headline: '$391K of monthly revenue sits in 3 at-risk stores; 10 of 16 on standard and 2 audits overdue.', 'revenue-at-risk': 391000, 'on-track-count': 10, 'at-risk-count': 3, 'audit-overdue-count': 2, 'written-by': AGENT.ops,
    body: '**Revenue at risk: $391,000 of $2,137,000 a month (18%)**, up from $131,000. **10 of 16** stores on standard, down from 12.\n\n**At risk**\n- **Mission Street** — score 24, $142K. Cooler at 46°F failed two critical items; three fixes past due. Action: compressor on Nov 20, re-audit Nov 21.\n- **Capitol Hill** — score 30, $118K. Two openers resigned; closed early twice; sales 86% of target. Action: floaters and two hires by Nov 18.\n- **Venice Boulevard** — score 36, $131K. Reviews 3.8 on slow mornings. Action: second register — **overdue since Nov 14**.\n\n**Audit overdue**\n- **Ballard** (45 days) — audit booked for Nov 19.\n- **Hawthorne** (39 days) — not booked yet.\n\n**Decisions for Monday**\n1. Approve the floaters for Capitol Hill.\n2. Get the Venice second register open this week.\n3. Book Hawthorne’s audit.' } },
];

export const demoRecords = {
  stores,
  signals,
  actions,
  reviews,
};
