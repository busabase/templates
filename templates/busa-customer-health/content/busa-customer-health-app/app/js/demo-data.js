// Sample rows for one fictional company: Tidewater, which sells dispatch and
// scheduling software to field-service businesses, on 2026-11-05.
// `scripts/sync-content.mjs` writes these into `content/<base>/records.ndjson`
// (what a fresh install opens on), and `?demo=1` reads the same rows, so the two
// never tell different stories. Every customer below is fictional.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// Every score and light below follows the skill's rule (model.js#healthParts,
// #healthFor); the unit test recomputes each one.

const AGENT = {
  product: 'Product analytics agent · Codex',
  support: 'Support agent · Claude Code',
  billing: 'Billing agent · Claude Code',
  survey: 'Survey agent · Codex',
  cs: 'CS agent · Claude Code',
};
const src = (path) => `https://data.example.com/${path}`;

// [key, name, segment, csm, arr, plan, renewal, seats paid, active, active 30 days before, urgent tickets, NPS, days overdue, score, health, champion, summary]
const ACCOUNTS = [
  ['acc-harbor', 'Harbor Point Logistics', 'enterprise', 'Maya Chen', 96000, 'Enterprise · 120 seats', '2026-12-20', 120, 41, 78, 2, 4, 0, 32, 'at-risk', '', 'Their operations director, our champion, left on Oct 21; two depots stopped dispatching in Tidewater and active seats fell from 78 to 41.'],
  ['acc-cedar', 'Cedar & Pine Property Group', 'mid-market', 'Leo Martins', 52000, 'Growth · 60 seats', '2027-01-15', 60, 33, 42, 3, 6, 0, 44, 'at-risk', 'Rachel Ortiz, Maintenance lead', 'Three urgent tickets on the route-sync bug have been open for over a week; technicians are back on paper schedules at two sites.'],
  ['acc-brightline', 'Brightline HVAC', 'mid-market', 'Maya Chen', 36000, 'Growth · 40 seats', '2027-03-01', 40, 22, 24, 1, 5, 52, 42, 'at-risk', 'Tom Becker, Owner', 'The September invoice is 52 days unpaid and the owner rated us 5 after a missed integration deadline.'],
  ['acc-summit', 'Summit Dental Partners', 'mid-market', 'Leo Martins', 48000, 'Growth · 50 seats', '2026-12-31', 50, 31, 35, 1, 7, 0, 62, 'watch', 'Ana Silva, Practice ops', 'Usage dipped after two clinics closed for renovation; renews in eight weeks.'],
  ['acc-northgate', 'Northgate Facilities', 'enterprise', 'Priya Shah', 84000, 'Enterprise · 100 seats', '2027-05-30', 100, 66, 70, 0, 6, 10, 62, 'watch', 'Dev Patel, VP Operations', 'NPS fell to 6 over reporting gaps; the October invoice is ten days late while procurement re-approves the PO.'],
  ['acc-lakeside', 'Lakeside Plumbing Co.', 'smb', 'Priya Shah', 14000, 'Starter · 15 seats', '2027-01-28', 15, 8, 9, 0, 8, 20, 56, 'watch', 'Jim Hale, Owner', 'Happy with the product but paying late; the card on file expired in October.'],
  ['acc-meridian', 'Meridian Home Services', 'enterprise', 'Maya Chen', 132000, 'Enterprise · 150 seats', '2027-06-30', 150, 128, 119, 1, 9, 0, 92, 'healthy', 'Grace Liu, COO', 'Added nine seats in October for the new Denver branch; one urgent ticket on SSO, fix scheduled.'],
  ['acc-copper', 'Copperline Electric', 'mid-market', 'Leo Martins', 42000, 'Growth · 45 seats', '2027-02-14', 45, 39, 37, 0, 8, 0, 92, 'healthy', 'Sara Kim, Dispatch manager', 'Steady and growing; asked about the inventory add-on.'],
  ['acc-fairway', 'Fairway Pest Control', 'smb', 'Priya Shah', 18000, 'Starter · 20 seats', '2027-04-10', 20, 15, 15, 0, '', 0, 90, 'healthy', 'Luis Romero, Owner', 'Quiet and steady; has not answered an NPS survey yet.'],
  ['acc-oakridge', 'Oakridge Senior Living', 'enterprise', 'Maya Chen', 110000, 'Enterprise · 140 seats', '2027-08-31', 140, 104, 109, 1, 9, 0, 84, 'healthy', 'Helen Ward, Facilities director', 'Strong sponsor; one urgent ticket on the mobile app, workaround in place.'],
  ['acc-bluewater', 'Bluewater Pools', 'smb', 'Priya Shah', 12000, 'Starter · 12 seats', '2026-12-15', 12, 10, 9, 0, 10, 0, 100, 'healthy', 'Kara Moss, Owner', 'Renews in December and has already asked for next year’s quote.'],
  ['acc-granite', 'Granite State Roofing', 'mid-market', 'Leo Martins', 38000, 'Growth · 40 seats', '2027-03-20', 40, 30, 33, 0, 7, 0, 84, 'healthy', 'Mike Dunn, Operations', 'Seasonal dip as roofing slows for winter; nothing to act on.'],
  ['acc-evergreen', 'Evergreen Landscaping', 'smb', 'Priya Shah', 16000, 'Starter · 18 seats', '2027-07-01', 18, 13, 12, 1, 8, 5, 76, 'healthy', 'Nina Brooks, Office manager', 'One urgent ticket on invoice export; payment five days late, reminder sent.'],
  ['acc-pioneer', 'Pioneer Appliance Repair', 'mid-market', 'Leo Martins', 56000, 'Growth · 60 seats', '2027-09-15', 60, 47, 44, 0, 8, 0, 92, 'healthy', 'Omar Haddad, Service director', 'Rolled Tidewater out to the Tucson team in October.'],
];

const accounts = ACCOUNTS.map(([key, name, segment, csm, arr, plan, renewal, licensed, active, prior, urgent, nps, overdue, score, health, champion, summary]) => {
  const fields = {
    name, segment, csm, arr, plan, 'renewal-date': renewal,
    'seats-licensed': licensed, 'seats-active': active, 'seats-active-prior': prior,
    'urgent-tickets': urgent, 'days-overdue': overdue, 'health-score': score, health,
    'scored-by': AGENT.cs, 'scored-on': '2026-11-04', summary,
  };
  if (nps !== '') fields.nps = nps;
  if (champion) fields.champion = champion;
  return { key, fields };
});

const KIND = {
  usage: ['Active seats', AGENT.product, 'Product usage events'],
  support: ['Urgent tickets', AGENT.support, 'Help desk'],
  sentiment: ['NPS answer', AGENT.survey, 'In-app NPS survey'],
  billing: ['Invoice days overdue', AGENT.billing, 'Billing system'],
};

// [account, kind, date, was, now, evidence]. A usage, support, sentiment or
// billing signal moves a number; the account's field holds the latest one.
const SIGNALS = [
  ['acc-harbor', 'usage', '2026-10-12', 78, 63, 'The Bayonne depot logged no dispatches for six days.'],
  ['acc-harbor', 'support', '2026-10-28', 0, 2, 'Two urgent tickets: drivers cannot see re-assigned jobs on Android.'],
  ['acc-harbor', 'sentiment', '2026-10-30', 8, 4, '“Since Carla left nobody here owns the rollout.” — dispatcher, in the survey comment.'],
  ['acc-harbor', 'usage', '2026-11-02', 63, 41, 'Bayonne and Newark depots both idle; 37 of 120 seats have not logged in for 30 days.'],
  ['acc-cedar', 'sentiment', '2026-10-15', 7, 6, 'Maintenance lead: “Good tool, but sync breaks every Monday.”'],
  ['acc-cedar', 'usage', '2026-10-19', 42, 38, 'Two sites switched to printed schedules after the sync failures.'],
  ['acc-cedar', 'support', '2026-10-26', 1, 3, 'Three urgent tickets on route sync, oldest open 11 days; engineering has not reproduced it.'],
  ['acc-cedar', 'usage', '2026-11-02', 38, 33, 'Active seats down 21% in 30 days; the Riverside site has stopped logging in.'],
  ['acc-brightline', 'sentiment', '2026-10-29', 8, 5, 'Owner: “We were promised the QuickBooks sync in September.”'],
  ['acc-brightline', 'support', '2026-10-27', 0, 1, 'Urgent ticket: QuickBooks sync rejects every invoice with a tax line.'],
  ['acc-brightline', 'billing', '2026-11-04', 30, 52, 'Invoice INV-2209 ($9,000) due Sep 13 is unpaid; two reminders unanswered.'],
  ['acc-summit', 'sentiment', '2026-10-21', 9, 7, 'Practice ops: scheduling is fine, reporting for the new clinics is slow.'],
  ['acc-summit', 'support', '2026-10-30', 0, 1, 'Urgent ticket: double-booked chairs after the daylight-saving change.'],
  ['acc-summit', 'usage', '2026-11-02', 35, 31, 'Two clinics closed for renovation until January.'],
  ['acc-northgate', 'sentiment', '2026-10-24', 8, 6, 'VP Operations wants SLA reports per building, which we do not have yet.'],
  ['acc-northgate', 'usage', '2026-11-02', 70, 66, 'Small dip across three regions; no site has gone idle.'],
  ['acc-northgate', 'billing', '2026-11-03', 0, 10, 'October invoice late while procurement re-approves the purchase order.'],
  ['acc-lakeside', 'billing', '2026-10-31', 0, 20, 'Card on file expired Oct 11; auto-charge failed twice.'],
  ['acc-lakeside', 'usage', '2026-11-02', 9, 8, 'One technician left the company.'],
  ['acc-meridian', 'usage', '2026-11-02', 119, 128, 'Nine new seats active for the Denver branch.'],
  ['acc-meridian', 'support', '2026-11-01', 0, 1, 'Urgent ticket: SSO login loop for new Denver users; fix ships Nov 8.'],
  ['acc-copper', 'usage', '2026-11-02', 37, 39, 'Two new dispatchers onboarded.'],
  ['acc-bluewater', 'sentiment', '2026-11-01', 9, 10, 'Owner: “Saves me an hour every morning.”'],
  ['acc-oakridge', 'support', '2026-10-29', 0, 1, 'Urgent ticket: photos fail to upload on older iPads; workaround sent.'],
  ['acc-granite', 'usage', '2026-11-02', 33, 30, 'Seasonal: three crews off for winter.'],
  ['acc-evergreen', 'billing', '2026-11-01', 0, 5, 'Payment five days late; reminder sent, owner replied it is on its way.'],
  ['acc-pioneer', 'usage', '2026-11-02', 44, 47, 'Tucson team live since Oct 20.'],
];

const signals = SIGNALS.map(([account, kind, date, was, now, evidence], index) => {
  const [label, writer, source] = KIND[kind];
  return { key: `sig-${index + 1}`, fields: {
    title: `${label}: ${was} → ${now}`, account, kind, 'recorded-on': date, 'previous-value': was, 'new-value': now,
    'written-by': writer, writer: 'agent', evidence: `${evidence} Source: ${source}.`, 'source-url': src(`${account}/${kind}/${date}`),
  } };
});
// Relationship changes carry no number. One an agent noticed, one a person wrote.
signals.push(
  { key: 'sig-harbor-champion', fields: {
    title: 'Champion left: operations director Carla Reyes', account: 'acc-harbor', kind: 'relationship', 'recorded-on': '2026-10-22',
    'written-by': AGENT.cs, writer: 'agent', evidence: 'Carla’s account was deactivated on Oct 21 and her e-mail now bounces; her LinkedIn shows a new role. She ran the rollout and the weekly check-in. Source: CRM contacts and login log.',
  } },
  { key: 'sig-harbor-call', fields: {
    title: 'Met the new operations director', account: 'acc-harbor', kind: 'relationship', 'recorded-on': '2026-11-04',
    'written-by': 'Maya Chen', writer: 'person', evidence: 'Call with Dan Moreno, who replaced Carla. He did not know two depots had stopped using us and is open to a re-launch, but is also looking at a competitor his last company used.',
  } },
);

const plays = [
  { key: 'play-harbor-exec', fields: { title: 'Executive call with Harbor Point’s new operations director', account: 'acc-harbor', status: 'in-progress', owner: 'Maya Chen', 'due-date': '2026-11-12', 'proposed-by': AGENT.cs, cause: 'The champion who ran the rollout left on Oct 21; nobody owns Tidewater there now and two depots have gone idle. Renewal is Dec 20.', plan: 'Our VP of Customer Success and Maya meet Dan Moreno with a usage report per depot and a 30-day re-launch plan; agree on a new internal owner.' } },
  { key: 'play-harbor-relaunch', fields: { title: 'Re-train the Bayonne and Newark depots', account: 'acc-harbor', status: 'open', owner: 'Maya Chen', 'due-date': '2026-11-19', 'proposed-by': AGENT.product, cause: '37 of 120 seats have not logged in for 30 days, all at the two depots the old champion trained herself.', plan: 'Two on-site sessions and a driver quick-start card; product analytics agent reports depot logins daily for two weeks.' } },
  { key: 'play-cedar-escalate', fields: { title: 'Escalate the route-sync bug behind Cedar & Pine’s three urgent tickets', account: 'acc-cedar', status: 'in-progress', owner: 'Leo Martins', 'due-date': '2026-11-07', 'proposed-by': AGENT.support, cause: 'The same sync failure every Monday has pushed two sites back to paper; tickets have waited up to 11 days.', plan: 'Engineering lead joins Monday’s sync window live; Leo calls Rachel Ortiz with the fix date and a credit for October.' } },
  { key: 'play-brightline-invoice', fields: { title: 'Call Brightline’s owner about the unpaid September invoice', account: 'acc-brightline', status: 'open', owner: 'Maya Chen', 'due-date': '2026-11-03', 'proposed-by': AGENT.billing, cause: 'The invoice is 52 days late and the owner is unhappy about the missed QuickBooks sync — the two are likely connected.', plan: 'Call Tom Becker with the sync fix date, offer to split the invoice in two, and confirm a payment date.' } },
  { key: 'play-summit-renewal', fields: { title: 'Renewal review with Summit Dental before December', account: 'acc-summit', status: 'open', owner: 'Leo Martins', 'due-date': '2026-11-20', 'proposed-by': AGENT.cs, cause: 'Renews Dec 31 on watch: usage down while two clinics renovate, and an urgent double-booking ticket is open.', plan: 'Close the double-booking ticket, show per-clinic reporting, and offer to pause the renovating clinics’ seats until January.' } },
  { key: 'play-meridian-seats', fields: { title: 'Onboard Meridian’s nine new Denver seats', account: 'acc-meridian', status: 'done', owner: 'Maya Chen', 'due-date': '2026-10-30', 'proposed-by': AGENT.product, cause: 'Expansion, not risk: new branch opening Oct 20.', plan: 'Two remote training sessions; all nine seats active by Oct 30.' } },
];

const reviews = [
  { key: 'rev-oct-26', fields: { title: 'Week of Oct 20 – Oct 26', status: 'final', 'period-start': '2026-10-20', 'period-end': '2026-10-26', headline: '$88K of ARR at risk across two accounts; Harbor Point’s champion has left.', 'arr-at-risk': 88000, 'at-risk-count': 2, 'written-by': AGENT.cs,
    body: '**At risk — $88K**\n- **Cedar & Pine** ($52K, renews Jan 15): route-sync bug, two sites on paper.\n- **Brightline HVAC** ($36K, renews Mar 1): September invoice unpaid, integration promise missed.\n\n**Watch closely**\n- **Harbor Point** ($96K, renews Dec 20): champion left Oct 21. Score still 56, but usage is falling.\n\n**Changed since last week**\n- Meridian added nine seats for Denver.' } },
  { key: 'rev-nov-02', fields: { title: 'Week of Oct 27 – Nov 2', status: 'draft', 'period-start': '2026-10-27', 'period-end': '2026-11-02', headline: '$184K of ARR is at risk; Harbor Point turned red six weeks before renewal.', 'arr-at-risk': 184000, 'at-risk-count': 3, 'written-by': AGENT.cs,
    body: '**ARR at risk: $184K** across 3 of 14 accounts (24% of $754K), up from $88K.\n\n**At risk**\n- **Harbor Point Logistics** — $96K, renews Dec 20, score 32. Champion left; active seats 78 → 41; NPS 4. Play: executive call with the new operations director by Nov 12.\n- **Cedar & Pine** — $52K, renews Jan 15, score 44. Three urgent sync tickets. Play: engineering escalation, due Nov 7.\n- **Brightline HVAC** — $36K, renews Mar 1, score 42. Invoice 52 days late. Play: owner call — **overdue since Nov 3**.\n\n**Watch, renewing within 90 days**\n- Summit Dental ($48K, Dec 31, score 62) and Lakeside Plumbing ($14K, Jan 28, score 56).\n\n**Decisions for Monday**\n1. Send our VP of Customer Success to the Harbor Point call.\n2. Approve an October credit for Cedar & Pine.\n3. Offer Brightline a split payment.' } },
];

export const demoRecords = {
  accounts,
  signals,
  plays,
  reviews,
};
