// Sample rows for one fictional company: Fernhill Software, a 420-person B2B
// software company with offices in Lisbon and Austin, on Monday 2026-11-09.
// `scripts/sync-content.mjs` writes these into `content/<base>/records.ndjson`
// (what a fresh install opens on), and `?demo=1` reads the same rows, so the two
// never tell different stories. Every person below is fictional.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// Every score and status below follows the skill's rule (model.js#scoreParts,
// #statusFor); the unit test recomputes each one.

const AGENT = {
  it: 'IT agent · Codex',
  hr: 'HR agent · Claude Code',
  learning: 'Learning agent · Codex',
  calendar: 'Calendar agent · Claude Code',
  pulse: 'Pulse agent · Claude Code',
  peopleOps: 'People-ops agent · Claude Code',
};
const src = (path) => `https://data.example.com/${path}`;

// [key, name, role, team, manager, buddy, start date, location, access %, paperwork %, training %, 1:1s missed, pulse, score, status, summary]
// '' is "no reading yet": before day one nothing is due in training, 1:1s or pulse.
const HIRES = [
  ['hire-priya', 'Priya Raman', 'Senior Backend Engineer', 'engineering', 'Tom Becker', 'Noah Kim', '2026-11-16', 'Lisbon', 100, 100, '', '', '', 70, 'on-track', 'Laptop delivered, every account created, contract and right-to-work check done a week before day one.'],
  ['hire-lucas', 'Lucas Ferreira', 'Account Executive', 'sales', 'Dana Okafor', 'Ben Adler', '2026-11-16', 'Austin', 60, 100, '', '', '', 50, 'watch', 'Starts next Monday with no laptop: the MacBook is backordered to Nov 21 and the Salesforce seat is still waiting on a licence.'],
  ['hire-hana', 'Hana Sato', 'Product Designer', 'design', 'Mia Lindqvist', 'Leo Varga', '2026-11-23', 'Lisbon (relocating from Osaka)', 85, 50, '', '', '', 36, 'at-risk', 'Starts in two weeks, but her contract is not countersigned and the visa support letter has not gone out; without it she cannot book a consulate appointment.'],
  ['hire-omar', 'Omar Haddad', 'Support Specialist', 'support', 'Grace Lin', 'Sofia Marin', '2026-11-30', 'Remote — Porto', 100, 100, '', '', '', 70, 'on-track', 'Three weeks out and nothing due is missing.'],
  ['hire-jonas', 'Jonas Weber', 'Frontend Engineer', 'engineering', 'Tom Becker', 'Arjun Mehta', '2026-11-02', 'Lisbon', 100, 100, 100, 0, 4.6, 100, 'on-track', 'Merged a first pull request on day three; every week-one module done.'],
  ['hire-aisha', 'Aisha Bello', 'Sales Development Rep', 'sales', 'Dana Okafor', 'Ben Adler', '2026-11-02', 'Austin', 90, 100, 70, 1, 3.8, 56, 'watch', 'The dialer licence is still missing, so call practice is behind, and one buddy 1:1 was skipped.'],
  ['hire-ethan', 'Ethan Cole', 'Data Analyst', 'operations', 'Ravi Patel', 'Marta Silva', '2026-10-19', 'Remote — Manchester', 75, 100, 55, 3, 2.9, 26, 'at-risk', 'Three weeks in with no warehouse access, three 1:1s missed while his manager travels, and a pulse of 2.9: “I don’t know what I should be working on.”'],
  ['hire-sofia', 'Sofia Marin', 'Customer Success Manager', 'support', 'Grace Lin', 'Elena Popescu', '2026-10-12', 'Lisbon', 100, 100, 90, 0, 4.2, 84, 'on-track', 'Shadowed twelve customer calls; takes her first accounts next week.'],
  ['hire-noah', 'Noah Kim', 'DevOps Engineer', 'engineering', 'Tom Becker', 'Marta Silva', '2026-10-05', 'Lisbon', 100, 100, 100, 0, 4.8, 100, 'on-track', 'Joined the on-call rotation in week five, as planned.'],
  ['hire-chloe', 'Chloé Martin', 'Financial Analyst', 'finance', 'Ines Duarte', 'Pedro Alves', '2026-09-28', 'Lisbon', 100, 80, 95, 1, 3.4, 64, 'watch', 'Bank details and the tax form are still missing, so she would miss the November payroll; her pulse dipped after month-end close.'],
  ['hire-daniel', 'Daniel Osei', 'Account Executive', 'sales', 'Dana Okafor', 'Ben Adler', '2026-09-21', 'Austin', 100, 100, 50, 3, 2.6, 40, 'at-risk', 'His territory changed twice in seven weeks, half his sales training is overdue and three 1:1s were missed.'],
  ['hire-mei', 'Mei Chen', 'People Partner', 'people', 'Laura Brandt', 'Sara Novak', '2026-09-14', 'Austin', 100, 100, 98, 0, 4.3, 92, 'on-track', 'Ran the October hiring-manager training herself.'],
  ['hire-arjun', 'Arjun Mehta', 'ML Engineer', 'engineering', 'Kenji Ito', 'Noah Kim', '2026-08-31', 'Remote — Berlin', 100, 100, 85, 0, 4.0, 84, 'on-track', 'Two compliance modules left; otherwise settled.'],
  ['hire-isabel', 'Isabel Ruiz', 'Content Marketing Manager', 'marketing', 'Paul Navarro', 'Leo Varga', '2026-08-24', 'Austin', 100, 100, 100, 1, 4.1, 84, 'on-track', 'Shipped the November newsletter; one 1:1 moved for a conference and not rebooked.'],
  ['hire-ben', 'Ben Adler', 'Solutions Engineer', 'sales', 'Chris Wong', 'Elena Popescu', '2026-08-17', 'Austin', 100, 100, 88, 0, 4.7, 92, 'on-track', 'Already the buddy for three newer sales hires.'],
  ['hire-fatima', 'Fatima Zahra', 'Analytics Engineer', 'operations', 'Ravi Patel', 'Kenji Ito', '2026-10-26', 'Lisbon', 100, 90, 80, 0, 4.4, 76, 'on-track', 'Settling in well; the data-handling policy acknowledgement is still unsigned.'],
];

const MEASURE = { access: 'access-pct', paperwork: 'paperwork-pct', training: 'training-pct', checkins: 'checkins-missed', pulse: 'pulse' };

const hires = HIRES.map(([key, name, role, team, manager, buddy, start, location, access, paperwork, training, missed, pulse, score, status, summary]) => {
  const fields = { name, role, team, manager, buddy, 'start-date': start, location, score, status, 'scored-by': AGENT.peopleOps, 'scored-on': '2026-11-09', summary };
  const readings = { access, paperwork, training, checkins: missed, pulse };
  for (const [kind, value] of Object.entries(readings)) if (value !== '') fields[MEASURE[kind]] = value;
  return { key, fields };
});

const KIND = {
  access: [(was, now) => `Accounts and equipment ready: ${was}% → ${now}%`, AGENT.it, 'IT service desk and device inventory'],
  paperwork: [(was, now) => `Paperwork done: ${was}% → ${now}%`, AGENT.hr, 'HRIS onboarding checklist'],
  training: [(was, now) => `Training done: ${was}% → ${now}%`, AGENT.learning, 'Learning platform'],
  checkins: [(was, now) => `1:1s missed, last 30 days: ${was} → ${now}`, AGENT.calendar, 'Manager and buddy calendars'],
  pulse: [(was, now) => (was == null ? `First pulse: ${now}` : `Pulse: ${was} → ${now}`), AGENT.pulse, 'Weekly new-hire pulse survey'],
};

// [hire, kind, date, was, now, evidence]. Each signal moves one measure; the
// new hire's field holds the latest one. Completion measures count only what
// is due by that day, so they can fall as more comes due.
const SIGNALS = [
  ['hire-priya', 'paperwork', '2026-11-02', 90, 100, 'Contract countersigned and right-to-work documents verified (HR-2201, HR-2203).'],
  ['hire-priya', 'access', '2026-11-06', 80, 100, 'Laptop delivered to her Lisbon address; GitHub, AWS SSO and Google accounts created (IT-4460 to IT-4463).'],
  ['hire-lucas', 'access', '2026-11-02', 80, 70, 'The MacBook Pro order is backordered to Nov 21 (vendor ticket IT-4471).'],
  ['hire-lucas', 'paperwork', '2026-11-04', 80, 100, 'Offer, I-9 and direct-deposit form complete.'],
  ['hire-lucas', 'access', '2026-11-06', 70, 60, 'Salesforce seat request IT-4490 is waiting on a licence; Gong and the dialer depend on it.'],
  ['hire-hana', 'paperwork', '2026-11-03', 75, 50, 'Her contract, signed on Oct 20, still waits for our countersignature; the visa support letter due Nov 2 has not been issued (HR-2210, HR-2214).'],
  ['hire-hana', 'access', '2026-11-05', 100, 85, 'Figma and Google accounts ready; the laptop cannot ship to Osaka and has no Lisbon address yet (IT-4482).'],
  ['hire-omar', 'paperwork', '2026-11-04', 50, 100, 'Contract and tax forms signed three weeks before day one.'],
  ['hire-jonas', 'training', '2026-11-06', 50, 100, 'Security, product and codebase tours all completed in week one.'],
  ['hire-jonas', 'pulse', '2026-11-06', null, 4.6, 'First weekly pulse: “Clear first tasks and a buddy who answers fast.”'],
  ['hire-aisha', 'access', '2026-11-04', 100, 90, 'Dialer licence not assigned; ticket IT-4475 has been open for five days.'],
  ['hire-aisha', 'training', '2026-11-06', 80, 70, 'Call-practice modules need the dialer; two of them are now overdue.'],
  ['hire-aisha', 'checkins', '2026-11-06', 0, 1, 'The buddy 1:1 on Nov 5 was skipped; Ben was at a customer site.'],
  ['hire-aisha', 'pulse', '2026-11-06', null, 3.8, 'First weekly pulse: “Nice team, but I can’t practise calls yet.”'],
  ['hire-ethan', 'pulse', '2026-10-23', 4, 3.5, 'Week-one pulse: “Waiting on data access.”'],
  ['hire-ethan', 'access', '2026-10-28', 90, 75, 'The warehouse role request IT-4402 has waited 15 days for the data owner’s approval; he has read-only Looker only.'],
  ['hire-ethan', 'checkins', '2026-10-30', 1, 2, 'Manager 1:1s on Oct 23 and Oct 30 cancelled; Ravi is at the Manchester site.'],
  ['hire-ethan', 'training', '2026-11-03', 70, 55, 'The SQL style guide and data-privacy modules are overdue.'],
  ['hire-ethan', 'checkins', '2026-11-06', 2, 3, 'The Nov 6 manager 1:1 was cancelled too; no stand-in was named.'],
  ['hire-ethan', 'pulse', '2026-11-06', 3.5, 2.9, 'Week-three pulse: “I don’t know what I should be working on.”'],
  ['hire-sofia', 'training', '2026-11-05', 80, 90, 'Finished the renewals playbook; the QBR module is left.'],
  ['hire-sofia', 'pulse', '2026-11-06', 4, 4.2, 'Week-four pulse: “Shadowing helped a lot.”'],
  ['hire-noah', 'pulse', '2026-11-06', 4.6, 4.8, 'Week-five pulse: “On call feels manageable.”'],
  ['hire-chloe', 'paperwork', '2026-10-30', 100, 80, 'Bank details and the tax form were due Oct 28 and are not in; the payroll cut-off is Nov 18.'],
  ['hire-chloe', 'checkins', '2026-11-02', 0, 1, 'The Oct 30 manager 1:1 was dropped during month-end close.'],
  ['hire-chloe', 'pulse', '2026-11-06', 4.1, 3.4, 'Week-six pulse: “Month-end close was a lot with no one to ask.”'],
  ['hire-daniel', 'training', '2026-10-27', 65, 50, 'The territory changed on Oct 20, so the account-planning modules restarted; 6 of 12 required modules done.'],
  ['hire-daniel', 'checkins', '2026-11-03', 2, 3, 'Three manager 1:1s missed in 30 days; the last one on Nov 3.'],
  ['hire-daniel', 'pulse', '2026-11-06', 3.2, 2.6, 'Week-seven pulse: “I still don’t know which accounts are mine.”'],
  ['hire-mei', 'pulse', '2026-11-06', 4.5, 4.3, 'Week-eight pulse: “Busy, in a good way.”'],
  ['hire-arjun', 'training', '2026-11-02', 90, 85, 'Two compliance modules came due on Nov 1 and are open.'],
  ['hire-isabel', 'checkins', '2026-10-29', 0, 1, 'One manager 1:1 moved for a conference and not rebooked.'],
  ['hire-ben', 'pulse', '2026-11-06', 4.5, 4.7, 'Week-twelve pulse: “Enjoying buddying the new reps.”'],
  ['hire-fatima', 'paperwork', '2026-11-04', 100, 90, 'The data-handling policy acknowledgement due Nov 2 is not signed.'],
];

const signals = SIGNALS.map(([hire, kind, date, was, now, evidence], index) => {
  const [label, writer, source] = KIND[kind];
  const fields = {
    title: label(was, now), hire, kind, 'recorded-on': date, 'new-value': now,
    'written-by': writer, writer: 'agent', evidence: `${evidence} Source: ${source}.`, 'source-url': src(`${hire}/${kind}/${date}`),
  };
  if (was != null) fields['previous-value'] = was;
  return { key: `sig-${index + 1}`, fields };
});
// A note carries no number. One from People, one from a buddy.
signals.push(
  { key: 'sig-hana-visa', fields: {
    title: 'Hana: the consulate needs our support letter before it books an appointment', hire: 'hire-hana', kind: 'note', 'recorded-on': '2026-11-05',
    'written-by': 'Laura Brandt', writer: 'person', evidence: 'Call with Hana. The Lisbon consulate in Osaka books appointments only once the employer letter is attached; the next free slots are in ten days.',
  } },
  { key: 'sig-daniel-territory', fields: {
    title: 'Daniel asked me which accounts are his', hire: 'hire-daniel', kind: 'note', 'recorded-on': '2026-11-04',
    'written-by': 'Ben Adler', writer: 'person', evidence: 'Daniel moved from Mid-Atlantic to Southeast on Oct 20, but the CRM still shows his old accounts and nobody has walked him through the new ones.',
  } },
);

const actions = [
  { key: 'act-hana-contract', fields: { title: 'Countersign Hana’s contract and send the visa support letter', hire: 'hire-hana', status: 'in-progress', owner: 'Laura Brandt', 'due-date': '2026-11-11', 'proposed-by': AGENT.hr, cause: 'The contract has waited three weeks for our signature and there is no visa letter, so she cannot book a consulate appointment; day one is Nov 23.', plan: 'Countersign today; legal sends the support letter by Nov 11. If the visa slips past Nov 20, ask Mia whether Hana starts remotely from Osaka.' } },
  { key: 'act-lucas-laptop', fields: { title: 'Get Lucas a loaner laptop and a Salesforce seat before Monday', hire: 'hire-lucas', status: 'open', owner: 'Sam Rivera (IT)', 'due-date': '2026-11-13', 'proposed-by': AGENT.it, cause: 'His MacBook is backordered to Nov 21 and the Salesforce seat waits on a licence; day one is Nov 16.', plan: 'Image a loaner from the Austin pool; move the seat freed by the October leaver; confirm both by Friday.' } },
  { key: 'act-ethan-reset', fields: { title: 'Reset Ethan’s first month: a stand-in manager and warehouse access', hire: 'hire-ethan', status: 'open', owner: 'Ravi Patel', 'due-date': '2026-11-06', 'proposed-by': AGENT.peopleOps, cause: 'Three 1:1s missed while Ravi travels, no warehouse access after 15 days, and his pulse fell to 2.9.', plan: 'Name Kenji Ito as stand-in for weekly 1:1s until Ravi is back; approve the warehouse role; agree three first-month goals in writing.' } },
  { key: 'act-daniel-ramp', fields: { title: 'Write Daniel’s ramp plan for the Southeast territory', hire: 'hire-daniel', status: 'in-progress', owner: 'Dana Okafor', 'due-date': '2026-11-14', 'proposed-by': AGENT.peopleOps, cause: 'Two territory changes in seven weeks: the CRM still shows his old accounts, half his training restarted, and three 1:1s were missed.', plan: 'Fix his territory in the CRM; list his 40 accounts; pair him with Ben on two customer calls; give the six open modules new dates.' } },
  { key: 'act-chloe-payroll', fields: { title: 'Collect Chloé’s bank details and tax form before the payroll cut-off', hire: 'hire-chloe', status: 'open', owner: 'Laura Brandt', 'due-date': '2026-11-17', 'proposed-by': AGENT.hr, cause: 'Both were due Oct 28; without them she misses the November payroll on Nov 18.', plan: 'Sit with Chloé for ten minutes this week and submit both forms together.' } },
  { key: 'act-priya-laptop', fields: { title: 'Ship Priya’s laptop to Lisbon before day one', hire: 'hire-priya', status: 'done', owner: 'Sam Rivera (IT)', 'due-date': '2026-11-06', 'proposed-by': AGENT.it, cause: 'Routine, not risk: day-one kit for a Lisbon start.', plan: 'Delivered Nov 6; accounts created the same day.' } },
];

const reviews = [
  { key: 'rev-nov-01', fields: { title: 'Week of Oct 26 – Nov 1', status: 'final', 'period-start': '2026-10-26', 'period-end': '2026-11-01', headline: '11 of 14 new hires are on track; Ethan and Daniel are stuck in their first two months.', 'on-track-count': 11, 'at-risk-count': 2, 'not-ready-count': 0, 'written-by': AGENT.peopleOps,
    body: '**On track: 11 of 14.**\n\n**At risk**\n- **Daniel Osei** (Account Executive, day 42): territory changed on Oct 20; training restarted.\n- **Ethan Cole** (Data Analyst, day 14): no warehouse access, two 1:1s missed.\n\n**Watch**\n- **Chloé Martin**: bank details and tax form overdue.\n\n**Changed since last week**\n- Noah Kim joined the on-call rotation.' } },
  { key: 'rev-nov-08', fields: { title: 'Week of Nov 2 – Nov 8', status: 'draft', 'period-start': '2026-11-02', 'period-end': '2026-11-08', headline: '10 of 16 new hires are on track; 3 are at risk and 2 start within two weeks without everything ready.', 'on-track-count': 10, 'at-risk-count': 3, 'not-ready-count': 2, 'written-by': AGENT.peopleOps,
    body: '**On track: 10 of 16**, down from 11 of 14. Two new starts (Jonas, Aisha) joined the desk.\n\n**At risk**\n- **Daniel Osei** — Account Executive, day 50, score 40. Training 50%, three 1:1s missed, pulse 2.6. Action: ramp plan for the Southeast territory by Nov 14.\n- **Ethan Cole** — Data Analyst, day 22, score 26. No warehouse access, three 1:1s missed, pulse 2.9. Action: stand-in manager and access — **overdue since Nov 6**.\n- **Hana Sato** — Product Designer, starts Nov 23, score 36. Contract not countersigned, no visa letter. Action: by Nov 11.\n\n**Starting within 14 days, not ready**\n- **Lucas Ferreira** (Nov 16): no laptop, no Salesforce seat. Action: loaner and seat by Nov 13.\n- **Hana Sato** (Nov 23): laptop has no address yet.\n\n**Decisions for Monday**\n1. Name a stand-in manager for Ethan today.\n2. Approve a loaner laptop for Lucas.\n3. Countersign Hana’s contract.' } },
];

export const demoRecords = {
  hires,
  signals,
  actions,
  reviews,
};
