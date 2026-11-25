// Sample rows for one fictional agency: Fieldnote Studio, a 60-person digital
// agency with 16 client projects in delivery, on Monday 2026-11-16.
// `scripts/sync-content.mjs` writes these into `content/<base>/records.ndjson`
// (what a fresh install opens on), and `?demo=1` reads the same rows, so the
// two never tell different stories. Every client, person and number below is
// fictional. Money is in US dollars.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// Every score and status below follows the skill's rule (model.js#scoreParts,
// #statusFor); the unit test recomputes each one.

const AGENT = {
  budget: 'Time-tracking agent · Codex',
  schedule: 'Project-plan agent · Claude Code',
  billing: 'Billing agent · Codex',
  scope: 'Contracts agent · Claude Code',
  client: 'Client-pulse agent · Claude Code',
  ops: 'Delivery agent · Claude Code',
};
const src = (path) => `https://data.example.com/${path}`;
const LEAD = { rachel: 'Rachel Owens', tomas: 'Tomás Silva', nina: 'Nina Patel', james: 'James Carter' };

// [key, name, client, service, account lead, project manager, contract $, last check-in,
//  budget used %, work complete %, slip days, unbilled days, unbilled $, unsigned changes,
//  client pulse, score, status, summary]. Burn gap = budget used − work complete.
const PROJECTS = [
  ['pr-harlow', 'Harlow Hotels booking site', 'Harlow Hotels', 'web', LEAD.rachel, 'Ben Ortiz', 486000, '2026-11-11', 82, 61, 18, 38, 64000, 3, 3.4, 12, 'at-risk', 'The booking-engine integration ate 310 hours against 140 planned; launch is 18 days late, three change requests are being built unsigned, and the CMO is unhappy.'],
  ['pr-kestrel', 'Kestrel Air loyalty app', 'Kestrel Air', 'product', LEAD.tomas, 'Hana Sato', 612000, '2026-11-09', 64, 58, 12, 74, 188000, 1, 3.9, 24, 'at-risk', '$188K of work since mid-September cannot be invoiced until SOW amendment 2 is signed; beta is 12 days late waiting on the client’s API credentials.'],
  ['pr-brightwater', 'Brightwater brand refresh', 'Brightwater Credit Union', 'brand', LEAD.nina, 'Claire Dubois', 214000, '2026-10-27', 91, 70, 4, 28, 22000, 2, 3.6, 44, 'at-risk', 'Three rounds of logo revisions beyond the two in the SOW used 91% of the budget for 70% of the work; no check-in for 20 days.'],
  ['pr-elmstead', 'Elmstead College admissions site', 'Elmstead College', 'web', LEAD.rachel, 'Leah Morgan', 268000, '2026-10-22', 55, 52, 0, 41, 31000, 1, 4.2, 68, 'watch', 'On schedule, but nobody has spoken to the client in 25 days and October’s work is still unbilled.'],
  ['pr-ironleaf', 'Ironleaf launch campaign', 'Ironleaf Software', 'campaign', LEAD.james, 'Omar Haddad', 176000, '2026-11-12', 70, 68, 7, 22, 12000, 0, 3.8, 64, 'watch', 'Launch moved a week while the client’s legal team reviews the claims; the marketing lead is anxious.'],
  ['pr-meridian', 'Meridian Dental patient portal', 'Meridian Dental', 'product', LEAD.tomas, 'Victor Lang', 342000, '2026-11-10', 48, 41, 3, 34, 38000, 0, 4.4, 62, 'watch', 'Budget is running 7 points ahead of work after the insurance-API spike.'],
  ['pr-fernhill', 'Fernhill Foods packaging system', 'Fernhill Foods', 'brand', LEAD.nina, 'Claire Dubois', 158000, '2026-11-06', 60, 62, 0, 63, 41000, 1, 4.1, 64, 'watch', 'On budget and on time, but the $41K phase-2 invoice has waited 63 days for a purchase order.'],
  ['pr-alder', 'Alder Health clinic finder', 'Alder Health', 'web', LEAD.rachel, 'Leah Morgan', 224000, '2026-11-13', 44, 47, 0, 18, 15000, 0, 4.7, 100, 'on-track', 'Ahead of plan on every measure.'],
  ['pr-copperline', 'Copperline Coffee online store', 'Copperline Coffee', 'web', LEAD.james, 'Omar Haddad', 198000, '2026-11-12', 74, 72, 0, 26, 19000, 0, 4.6, 92, 'on-track', 'Checkout testing ran two points over budget; launch is still Dec 1.'],
  ['pr-daybreak', 'Daybreak Bikes holiday campaign', 'Daybreak Bikes', 'campaign', LEAD.james, 'Zoe Kim', 132000, '2026-11-14', 81, 85, 0, 15, 9000, 1, 4.5, 92, 'on-track', 'Live on Nov 10; one change request for extra cut-downs is waiting for a signature.'],
  ['pr-granite', 'Granite Peak design system', 'Granite Peak Outdoors', 'product', LEAD.tomas, 'Victor Lang', 296000, '2026-11-05', 36, 38, 2, 29, 27000, 0, 4.6, 92, 'on-track', 'Token review slipped two days; otherwise steady.'],
  ['pr-juno', 'Juno Pet Care brand identity', 'Juno Pet Care', 'brand', LEAD.nina, 'Ruth Adeyemi', 118000, '2026-10-29', 88, 90, 0, 21, 8000, 0, 4.3, 92, 'on-track', 'Nearly done, but the last client check-in was 18 days ago.'],
  ['pr-larkspur', 'Larkspur Museum exhibition site', 'Larkspur Museum', 'web', LEAD.rachel, 'Ben Ortiz', 154000, '2026-11-10', 22, 20, 0, 12, 6000, 0, 4.8, 92, 'on-track', 'Kicked off Oct 20; the curators loved the first sitemap.'],
  ['pr-northgate', 'Northgate Realty listings app', 'Northgate Realty', 'product', LEAD.tomas, 'Hana Sato', 388000, '2026-11-11', 57, 55, 4, 31, 46000, 0, 4.5, 76, 'on-track', 'The map-search sprint ran four days long; the client is happy with the demo.'],
  ['pr-orchard', 'Orchard Lane paid social', 'Orchard Lane Bakery', 'campaign', LEAD.james, 'Zoe Kim', 84000, '2026-11-13', 50, 50, 0, 19, 5000, 0, 4.4, 92, 'on-track', 'Cost per order down 18% since the new creative.'],
  ['pr-pinecrest', 'Pinecrest Insurance quote flow', 'Pinecrest Insurance', 'product', LEAD.nina, 'Ruth Adeyemi', 252000, '2026-11-09', 63, 60, 0, 36, 29000, 1, 4.6, 76, 'on-track', 'A change request for a pet-insurance step is out for signature.'],
];

const projects = PROJECTS.map(([key, name, client, service, lead, pm, value, checkin, used, complete, slip, wip, unbilled, unsigned, pulse, score, status, summary]) => ({
  key,
  fields: {
    name, client, service, 'account-lead': lead, 'project-manager': pm, 'contract-value': value, 'checked-in-on': checkin,
    'budget-used-pct': used, 'complete-pct': complete, 'burn-gap': used - complete, 'slip-days': slip, 'wip-days': wip,
    unbilled, 'unsigned-changes': unsigned, 'client-pulse': pulse, score, status, 'scored-by': AGENT.ops, 'scored-on': '2026-11-16', summary,
  },
}));

const pts = (value) => `${value > 0 ? '+' : ''}${value}`;
const KIND = {
  budget: [(was, now) => `Budget ahead of work: ${pts(was)} → ${pts(now)} pts`, AGENT.budget, 'Time tracking'],
  schedule: [(was, now) => `Next milestone: ${was} → ${now} days late`, AGENT.schedule, 'Project plan'],
  billing: [(was, now) => `Oldest unbilled work: ${was} → ${now} days`, AGENT.billing, 'Accounting system'],
  scope: [(was, now) => `Unsigned scope changes: ${was} → ${now}`, AGENT.scope, 'Change-order log'],
  client: [(was, now) => (was == null ? `Client pulse: ${now.toFixed(1)} (first check-in)` : `Client pulse: ${was.toFixed(1)} → ${now.toFixed(1)}`), AGENT.client, 'Client check-in survey'],
};

// [project, kind, date, was, now, evidence]. Each signal moves one measure; the
// project's field holds the latest one, and `checked-in-on` the latest
// client-pulse date.
const SIGNALS = [
  ['pr-harlow', 'budget', '2026-11-09', 9, 21, '82% of the budget used for 61% of the work; the booking-engine integration has taken 310 hours against 140 planned.'],
  ['pr-harlow', 'scope', '2026-11-10', 1, 3, 'CR-14 (loyalty login), CR-15 (multi-currency) and CR-16 (gift cards) are being built; none is signed.'],
  ['pr-harlow', 'client', '2026-11-11', 4.1, 3.4, 'Check-in with the CMO: “we were promised a launch before the holidays.”'],
  ['pr-harlow', 'schedule', '2026-11-12', 6, 18, 'The payments-and-booking milestone was due Oct 29; integration tests against the hotel PMS still fail.'],
  ['pr-harlow', 'billing', '2026-11-13', 31, 38, '$64,000 of October work is held back from invoicing until the change orders are signed.'],
  ['pr-kestrel', 'scope', '2026-11-03', 0, 1, 'SOW amendment 2 (Android tablet support) was sent Sep 28; procurement has not signed it.'],
  ['pr-kestrel', 'client', '2026-11-09', 4.3, 3.9, 'The product owner is frustrated by API delays on both sides.'],
  ['pr-kestrel', 'budget', '2026-11-10', 3, 6, '64% of the budget used for 58% of the work.'],
  ['pr-kestrel', 'billing', '2026-11-12', 45, 74, '$188,000 of work since Sep 3 cannot be invoiced until SOW amendment 2 is signed.'],
  ['pr-kestrel', 'schedule', '2026-11-14', 5, 12, 'The beta milestone was due Nov 2; the client’s loyalty API credentials have not arrived.'],
  ['pr-brightwater', 'client', '2026-10-27', 4.2, 3.6, 'Marketing director: “the board isn’t sold on any direction yet.”'],
  ['pr-brightwater', 'scope', '2026-11-04', 0, 2, 'A third logo round and a branch-signage pack were requested; neither change order is signed.'],
  ['pr-brightwater', 'budget', '2026-11-06', 12, 21, '91% of the budget used for 70% of the work after three revision rounds against two in the SOW.'],
  ['pr-brightwater', 'schedule', '2026-11-11', 0, 4, 'The brand-guidelines draft moved from Nov 7 to Nov 11.'],
  ['pr-elmstead', 'client', '2026-10-22', 4.4, 4.2, 'The admissions director asked for a faster content-entry tool.'],
  ['pr-elmstead', 'scope', '2026-11-05', 0, 1, 'A virtual-tour page was requested; the change order is out for signature.'],
  ['pr-elmstead', 'billing', '2026-11-08', 28, 41, '$31,000 of October work is not invoiced; the PM has been out sick.'],
  ['pr-ironleaf', 'schedule', '2026-11-12', 0, 7, 'Launch moved from Nov 18 to Nov 25 while the client’s legal team reviews the claims.'],
  ['pr-ironleaf', 'client', '2026-11-12', 4.4, 3.8, 'The marketing lead is worried the week’s delay will miss their conference.'],
  ['pr-meridian', 'budget', '2026-11-11', 4, 7, 'The insurance-eligibility API spike took 90 hours against 30 planned.'],
  ['pr-meridian', 'schedule', '2026-11-13', 0, 3, 'Sprint 6 demo moved from Nov 10 to Nov 13.'],
  ['pr-fernhill', 'scope', '2026-11-07', 0, 1, 'A seasonal label set was requested; the change order is out for signature.'],
  ['pr-fernhill', 'billing', '2026-11-14', 33, 63, 'The $41,000 phase-2 invoice is held: the client has not issued a purchase order since Sep 12.'],
  ['pr-alder', 'client', '2026-11-13', 4.6, 4.7, '“Best agency we have worked with” — the digital lead.'],
  ['pr-copperline', 'budget', '2026-11-10', 0, 2, 'Checkout testing ran 20 hours over plan.'],
  ['pr-copperline', 'client', '2026-11-12', 4.5, 4.6, 'The founder liked the checkout prototype.'],
  ['pr-daybreak', 'scope', '2026-11-12', 0, 1, 'Extra 6-second cut-downs were requested; the change order is out for signature.'],
  ['pr-daybreak', 'client', '2026-11-14', 4.4, 4.5, 'The campaign went live Nov 10; early click-through is above plan.'],
  ['pr-granite', 'client', '2026-11-05', 4.5, 4.6, 'The design lead is happy with the token naming.'],
  ['pr-granite', 'schedule', '2026-11-13', 0, 2, 'The token review moved two days for the client’s offsite.'],
  ['pr-juno', 'client', '2026-10-29', 4.5, 4.3, 'The founder wants one more pass on the wordmark spacing.'],
  ['pr-larkspur', 'client', '2026-11-10', null, 4.8, 'First check-in after kickoff; the curators loved the sitemap.'],
  ['pr-northgate', 'client', '2026-11-11', 4.4, 4.5, 'The map-search demo landed well.'],
  ['pr-northgate', 'billing', '2026-11-12', 24, 31, '$46,000 of sprint work is waiting for the month-end invoice.'],
  ['pr-orchard', 'client', '2026-11-13', 4.5, 4.4, 'The owner asked for more weekday creative.'],
  ['pr-pinecrest', 'scope', '2026-11-09', 0, 1, 'A pet-insurance step was requested; the change order is out for signature.'],
  ['pr-pinecrest', 'client', '2026-11-09', 4.5, 4.6, 'The product lead praised the quote-flow usability test.'],
];

const signals = SIGNALS.map(([project, kind, date, was, now, evidence], index) => {
  const [label, writer, source] = KIND[kind];
  const fields = {
    title: label(was, now), project, kind, 'recorded-on': date, 'new-value': now,
    'written-by': writer, writer: 'agent', evidence: `${evidence} Source: ${source}.`, 'source-url': src(`${project}/${kind}/${date}`),
  };
  if (was != null) fields['previous-value'] = was;
  return { key: `sig-${index + 1}`, fields };
});
// A note carries no number. Both from account leads.
signals.push(
  { key: 'sig-harlow-vendor', fields: {
    title: 'The hotel PMS vendor promises the API fix by Nov 19', project: 'pr-harlow', kind: 'note', 'recorded-on': '2026-11-14',
    'written-by': LEAD.rachel, writer: 'person', evidence: 'Call with the PMS vendor’s engineering lead: the rate-lookup bug is confirmed and a patch ships Nov 19. Until then we test against a mock.',
  } },
  { key: 'sig-kestrel-cfo', fields: {
    title: 'Kestrel: amendment 2 is sitting with their CFO', project: 'pr-kestrel', kind: 'note', 'recorded-on': '2026-11-13',
    'written-by': LEAD.tomas, writer: 'person', evidence: 'Procurement says the amendment is approved on their side and waits for the CFO’s signature; she is back from leave on Nov 17.',
  } },
);

const actions = [
  { key: 'act-harlow-reset', fields: { title: 'Re-plan the Harlow launch and get CR-14 to CR-16 signed', project: 'pr-harlow', status: 'in-progress', owner: LEAD.rachel, 'due-date': '2026-11-20', 'proposed-by': AGENT.schedule, cause: 'The booking-engine integration ran 170 hours over plan, launch is 18 days late, and three change requests are being built without a signature.', plan: 'Walk the CMO through a new launch date of Dec 8 on Nov 18; get CR-14 to CR-16 signed or paused; stop work on unsigned scope until then.' } },
  { key: 'act-kestrel-amendment', fields: { title: 'Get Kestrel’s SOW amendment 2 signed and invoice $188K', project: 'pr-kestrel', status: 'open', owner: LEAD.tomas, 'due-date': '2026-11-18', 'proposed-by': AGENT.billing, cause: '$188,000 of work since Sep 3 cannot be invoiced until the amendment is signed.', plan: 'Call the CFO on Nov 17 when she is back; send the invoice the same day it is signed; escalate to the VP Digital if it slips past Nov 18.' } },
  { key: 'act-brightwater-scope', fields: { title: 'Agree a change order for Brightwater’s extra logo rounds', project: 'pr-brightwater', status: 'open', owner: LEAD.nina, 'due-date': '2026-11-13', 'proposed-by': AGENT.scope, cause: 'Three revision rounds against two in the SOW, plus a signage pack, used 91% of the budget for 70% of the work.', plan: 'Price the third round and the signage pack; present them with the board review; hold further rounds until signed.' } },
  { key: 'act-elmstead-checkin', fields: { title: 'Hold the Elmstead check-in this week', project: 'pr-elmstead', status: 'open', owner: LEAD.rachel, 'due-date': '2026-11-19', 'proposed-by': AGENT.client, cause: 'No client check-in for 25 days while the PM was out; October is not invoiced.', plan: 'Book 30 minutes with the admissions director; show the content-entry tool; send the October invoice.' } },
  { key: 'act-fernhill-po', fields: { title: 'Chase Fernhill’s purchase order for the phase-2 invoice', project: 'pr-fernhill', status: 'in-progress', owner: LEAD.nina, 'due-date': '2026-11-21', 'proposed-by': AGENT.billing, cause: 'The $41,000 phase-2 invoice has waited 63 days for a purchase order.', plan: 'Ask the brand manager to raise the PO this week; copy their accounts-payable lead.' } },
  { key: 'act-ironleaf-legal', fields: { title: 'Send Ironleaf the legal-review checklist', project: 'pr-ironleaf', status: 'done', owner: LEAD.james, 'due-date': '2026-11-12', 'proposed-by': AGENT.schedule, cause: 'The client’s legal review was blocking the launch.', plan: 'Done on Nov 12; every claim now has its source attached.' } },
];

const reviews = [
  { key: 'rev-nov-08', fields: { title: 'Week of Nov 2 – Nov 8', status: 'final', 'period-start': '2026-11-02', 'period-end': '2026-11-08', headline: '11 of 16 projects on track; Kestrel is the one at risk, $612K of contract value.', 'value-at-risk': 612000, 'unbilled-total': 498000, 'on-track-count': 11, 'at-risk-count': 1, 'checkin-overdue-count': 1, 'written-by': AGENT.ops,
    body: '**On track: 11 of 16.** Daybreak’s holiday campaign goes live Nov 10.\n\n**At risk**\n- **Kestrel Air loyalty app** — SOW amendment 2 unsigned; unbilled work is building.\n\n**Watch**\n- **Harlow Hotels booking site** — the booking-engine integration is running long.\n- **Brightwater brand refresh** — a third logo round was requested.\n\n**Check-ins overdue**\n- **Elmstead College** — last spoke Oct 22.' } },
  { key: 'rev-nov-15', fields: { title: 'Week of Nov 9 – Nov 15', status: 'draft', 'period-start': '2026-11-09', 'period-end': '2026-11-15', headline: '$1.31M of contract value sits in 3 at-risk projects; $560K of work is unbilled.', 'value-at-risk': 1312000, 'unbilled-total': 560000, 'on-track-count': 9, 'at-risk-count': 3, 'checkin-overdue-count': 3, 'written-by': AGENT.ops,
    body: '**Contract value at risk: $1,312,000 of $4,102,000 (32%)**, up from $612,000. **9 of 16** projects on track, down from 11. **Unbilled work: $560,000**, a third of it on Kestrel.\n\n**At risk**\n- **Harlow Hotels booking site** — score 12, $486K. Integration 170 hours over; launch 18 days late; three change requests unsigned. Action: re-plan with the CMO by Nov 20.\n- **Kestrel Air loyalty app** — score 24, $612K. $188K unbilled for 74 days behind SOW amendment 2. Action: CFO call Nov 17.\n- **Brightwater brand refresh** — score 44, $214K. 91% of budget for 70% of work. Action: change order — **overdue since Nov 13**.\n\n**Check-ins overdue**\n- **Elmstead College** (25 days) — booked for this week.\n- **Brightwater** (20 days) — at risk as well.\n- **Juno Pet Care** (18 days) — not booked yet.\n\n**Decisions for Monday**\n1. Stop unsigned scope on Harlow until CR-14 to CR-16 are signed.\n2. Escalate Kestrel’s amendment if it is not signed by Nov 18.\n3. Price Brightwater’s extra rounds this week.' } },
];

export const demoRecords = {
  projects,
  signals,
  actions,
  reviews,
};
