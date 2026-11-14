// Sample rows for one fictional company: Larkspur Coffee Co., a specialty
// roaster with 38 cafés and an online subscription, on 2026-11-05.
// `scripts/sync-content.mjs` writes these into `content/<base>/records.ndjson`
// (what a fresh install opens on), and `?demo=1` reads the same rows, so the two
// never tell different stories. Every supplier below is fictional.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// Every score and rating below follows the skill's rule (model.js#scoreParts,
// #ratingFor); the unit test recomputes each one.

const AGENT = {
  receiving: 'Receiving agent · Codex',
  quality: 'Quality agent · Claude Code',
  price: 'Price agent · Codex',
  ap: 'AP agent · Claude Code',
  sourcing: 'Sourcing agent · Claude Code',
};
const src = (path) => `https://data.example.com/${path}`;

// [key, name, category, buyer, annual spend, contract, contract end, on-time %, rejected %, price vs contract %, invoices matched %, days to answer, score, rating, backup, summary]
const SUPPLIERS = [
  ['sup-pacific', 'Pacific Pulp Packaging', 'packaging', 'Hannah Lee', 940000, 'Annual supply agreement · cups and lids', '2026-12-31', 78, 2.4, 3.1, 91, 2, 30, 'at-risk', 'None qualified for 12 oz cups', 'Five of the last 23 deliveries were late and 2.4% of lids were rejected for cracking; a resin surcharge appeared on October invoices. We have no second supplier for 12 oz cups.'],
  ['sup-altura', 'Altura Green Coffee Importers', 'green-coffee', 'Marco Ruiz', 1420000, 'Forward contract · 2026–27 crop', '2027-03-31', 84, 1.2, 4.6, 93, 5, 36, 'at-risk', 'Finca Las Nubes Direct (part volume)', 'Two of nine lots arrived above 12% moisture, a freight surcharge pushed invoiced prices 4.6% over contract, and the Colombian harvest is running three weeks late.'],
  ['sup-northline', 'Northline Refrigerated Freight', 'logistics', 'Aisha Okafor', 610000, 'Master services agreement · café deliveries', '2027-01-31', 82, 1.5, 0, 79, 6, 38, 'at-risk', 'Metro Parcel Partners (ambient only)', 'One in five invoices carries accessorial charges that are not on the PO, three loads broke the cold chain in October, and answers take six days.'],
  ['sup-valley', 'Valley Oat Co.', 'dairy', 'Marco Ruiz', 780000, 'Annual supply agreement · oat milk', '2026-12-15', 93, 0.4, 1.8, 91, 3, 68, 'watch', 'Bellweather Dairy (oat line in trial)', 'Good product, slipping on the edges: deliveries 93% on time and a 1.8% price creep. The contract ends in six weeks.'],
  ['sup-bellweather', 'Bellweather Dairy', 'dairy', 'Marco Ruiz', 560000, 'Annual supply agreement · whole and skim milk', '2027-06-30', 96, 0.8, 2.5, 89, 2, 56, 'watch', 'Valley Oat Co. (no dairy line)', 'Reliable deliveries; a fuel surcharge lifted prices 2.5% over contract and one invoice in nine needs fixing.'],
  ['sup-ironleaf', 'Ironleaf Roaster Parts', 'equipment', 'Aisha Okafor', 180000, 'Parts and service agreement', '2027-01-20', 90, 0, 4, '', 6, 54, 'watch', 'Summit Espresso Service (grinders only)', 'Parts arrive sound but cost 4% over the price list, and quotes take six days. Billing moved to one monthly invoice, so there is no match rate yet.'],
  ['sup-sierra', 'Sierra Bakehouse', 'food', 'Hannah Lee', 520000, 'Daily pastry supply', '2027-04-30', 97, 0.3, 0, 96, 1, 100, 'preferred', 'Two local bakeries on call', 'On time to all 38 cafés every morning; nothing to act on.'],
  ['sup-greenfold', 'Greenfold Mailers', 'packaging', 'Hannah Lee', 240000, 'Annual supply agreement · subscription mailers', '2027-02-28', 95, 0.6, 1, 97, 1, 84, 'preferred', 'Pacific Pulp Packaging (mailers)', 'Steady; a print run with misaligned labels lifted rejects to 0.6%.'],
  ['sup-harbor', 'Harbor Syrups', 'food', 'Hannah Lee', 150000, 'Price-list agreement', '2027-05-31', 98, 0.2, 0, 94, 2, 84, 'preferred', 'Two brands stocked by our distributor', 'Two invoices billed the wrong pack size; credit notes already issued.'],
  ['sup-summit', 'Summit Espresso Service', 'equipment', 'Aisha Okafor', 310000, 'Maintenance contract · 38 cafés', '2027-08-31', 92, 0, 0, 98, 1, 92, 'preferred', 'Ironleaf Roaster Parts (roasters only)', 'Quarterly maintenance done in all 38 cafés; three call-outs ran a day late.'],
  ['sup-finca', 'Finca Las Nubes Direct', 'green-coffee', 'Marco Ruiz', 860000, 'Direct-trade contract · fixed price', '2027-09-30', 96, 0.7, 0, 95, 3, 84, 'preferred', 'Altura Green Coffee Importers', 'Fixed price held; one lot showed a few quakers, still within spec.'],
  ['sup-metro', 'Metro Parcel Partners', 'logistics', 'Aisha Okafor', 420000, 'Parcel contract · subscription orders', '2027-03-15', 95, 0.4, 1.5, 96, 2, 84, 'preferred', 'Two national carriers on rate card', 'The fuel index added 1.5% in October, as the contract allows.'],
  ['sup-brightwater', 'Brightwater Filtration', 'equipment', 'Aisha Okafor', 90000, 'Filter subscription', '2027-07-31', 99, 0, 0, 100, 1, 100, 'preferred', 'Catalog alternative available', 'Filters arrive before every change date.'],
  ['sup-cedar', 'Cedar Hill Uniforms', 'services', 'Hannah Lee', 70000, 'Uniform rental and laundry', '2027-02-01', 94, 0.9, 0, 97, 2, 76, 'preferred', 'Two regional laundries quoted', 'Fine overall; a few aprons came back stained.'],
];

const suppliers = SUPPLIERS.map(([key, name, category, buyer, spend, contract, end, onTime, defects, price, invoices, response, score, rating, backup, summary]) => {
  const fields = {
    name, category, buyer, 'annual-spend': spend, contract, 'contract-end': end,
    'on-time-pct': onTime, 'defect-pct': defects, 'price-variance-pct': price, 'response-days': response,
    score, rating, backup, 'scored-by': AGENT.sourcing, 'scored-on': '2026-11-04', summary,
  };
  if (invoices !== '') fields['invoice-match-pct'] = invoices;
  return { key, fields };
});

const signed = (value) => `${value > 0 ? '+' : ''}${value}%`;
const KIND = {
  delivery: [(was, now) => `On-time deliveries: ${was}% → ${now}%`, AGENT.receiving, 'ERP goods receipts'],
  quality: [(was, now) => `Rejected at inspection: ${was}% → ${now}%`, AGENT.quality, 'Incoming inspection log'],
  price: [(was, now) => `Price vs. contract: ${signed(was)} → ${signed(now)}`, AGENT.price, 'Invoice lines against the contract price list'],
  invoice: [(was, now) => `Invoices matched first time: ${was}% → ${now}%`, AGENT.ap, 'Three-way match in accounts payable'],
  response: [(was, now) => `Days to answer: ${was} → ${now}`, AGENT.sourcing, 'Supplier issue inbox'],
};

// [supplier, kind, date, was, now, evidence]. Each signal moves one measure; the
// supplier's field holds the latest one.
const SIGNALS = [
  ['sup-pacific', 'delivery', '2026-10-08', 91, 84, 'Two September container loads of 12 oz cups landed four and six days late at the Oakland DC.'],
  ['sup-pacific', 'price', '2026-10-20', 0, 3.1, 'A resin surcharge of $0.004 per cup appears on invoices PP-8812 and PP-8830; the contract has no surcharge clause.'],
  ['sup-pacific', 'quality', '2026-10-29', 0.9, 2.4, '1,150 of 48,000 lids rejected for cracked rims in lot L-2241.'],
  ['sup-pacific', 'response', '2026-10-30', 1, 2, 'The lid complaint took two days to get a first answer.'],
  ['sup-pacific', 'invoice', '2026-11-01', 96, 91, 'Two of 22 invoices did not match the PO: the resin surcharge.'],
  ['sup-pacific', 'delivery', '2026-11-02', 84, 78, 'Five of the last 23 deliveries were late; cafés in Portland ran short of 12 oz cups for a day.'],
  ['sup-altura', 'quality', '2026-10-17', 0.6, 1.2, 'Lots A-117 and A-121 measured 12.4% and 12.6% moisture against a 12% maximum; both held for re-test.'],
  ['sup-altura', 'price', '2026-10-24', 2, 4.6, 'A new freight surcharge of $0.11/lb on the October shipment; the forward contract prices delivered to Oakland.'],
  ['sup-altura', 'response', '2026-10-31', 2, 5, 'Five days to answer the moisture claim.'],
  ['sup-altura', 'delivery', '2026-11-02', 90, 84, 'The November container slipped eight days on a port delay in Cartagena.'],
  ['sup-northline', 'quality', '2026-10-22', 0.4, 1.5, 'Three of 200 café loads logged above 5 °C for more than 30 minutes; the milk was discarded.'],
  ['sup-northline', 'response', '2026-10-28', 3, 6, 'Six days to answer the temperature claims.'],
  ['sup-northline', 'invoice', '2026-11-01', 90, 79, 'Accessorial charges (waiting time, lift-gate) on 9 of 43 invoices were not on the PO.'],
  ['sup-northline', 'delivery', '2026-11-02', 88, 82, 'Morning delivery windows missed at six cafés; two opened without milk.'],
  ['sup-valley', 'price', '2026-10-15', 0, 1.8, 'Invoices from Oct 1 bill $0.05 more per carton than the contract.'],
  ['sup-valley', 'invoice', '2026-10-30', 95, 91, 'Two invoices billed the new price; the POs carry the contract price.'],
  ['sup-valley', 'delivery', '2026-11-02', 97, 93, 'Two deliveries a day late after the plant moved to a four-day week.'],
  ['sup-bellweather', 'price', '2026-10-12', 1, 2.5, 'A fuel surcharge of 1.5% added from October.'],
  ['sup-bellweather', 'invoice', '2026-10-31', 93, 89, 'Four of 36 invoices carry the fuel surcharge without a PO line.'],
  ['sup-ironleaf', 'price', '2026-10-19', 2, 4, 'Replacement burr sets billed at $412 against $396 on the price list.'],
  ['sup-ironleaf', 'response', '2026-10-27', 3, 6, 'Two quotes for roaster drum bearings took six days.'],
  ['sup-sierra', 'delivery', '2026-11-02', 96, 97, 'One late morning drop in 30 days.'],
  ['sup-greenfold', 'quality', '2026-10-25', 0.3, 0.6, 'One print run of 3,000 mailers with misaligned labels; replaced free.'],
  ['sup-summit', 'delivery', '2026-11-02', 95, 92, 'Three of 38 call-outs ran a day past the service window.'],
  ['sup-finca', 'quality', '2026-10-14', 0.5, 0.7, 'Quakers in lot F-09 slightly above our usual, within the contract spec.'],
  ['sup-metro', 'price', '2026-10-21', 0, 1.5, 'The fuel index added 1.5%, as the contract allows.'],
  ['sup-harbor', 'invoice', '2026-10-29', 97, 94, 'Two invoices billed 1 L bottles for 750 ml; credit notes issued.'],
];

const signals = SIGNALS.map(([supplier, kind, date, was, now, evidence], index) => {
  const [label, writer, source] = KIND[kind];
  return { key: `sig-${index + 1}`, fields: {
    title: label(was, now), supplier, kind, 'recorded-on': date, 'previous-value': was, 'new-value': now,
    'written-by': writer, writer: 'agent', evidence: `${evidence} Source: ${source}.`, 'source-url': src(`${supplier}/${kind}/${date}`),
  } };
});
// Risk news carries no number. One an agent noticed, one a person wrote.
signals.push(
  { key: 'sig-pacific-single', fields: {
    title: 'Single source: no qualified backup for 12 oz cups', supplier: 'sup-pacific', kind: 'risk', 'recorded-on': '2026-10-23',
    'written-by': AGENT.sourcing, writer: 'agent', evidence: 'Pacific Pulp supplies all 12 oz hot cups, about 2.1 million a year. Greenfold makes mailers only; the last cup RFQ was in 2024. Source: supplier master and contract register.',
  } },
  { key: 'sig-altura-call', fields: {
    title: 'Altura: Colombian harvest running three weeks late', supplier: 'sup-altura', kind: 'risk', 'recorded-on': '2026-11-04',
    'written-by': 'Marco Ruiz', writer: 'person', evidence: 'Call with Altura’s account manager. Rain delayed the Huila harvest; the January container may slip into February. They will hold the surcharge “for now” but would not put it in writing.',
  } },
);

const actions = [
  { key: 'act-pacific-backup', fields: { title: 'Qualify a second supplier for 12 oz cups and lids', supplier: 'sup-pacific', status: 'in-progress', owner: 'Hannah Lee', 'due-date': '2026-11-20', 'proposed-by': AGENT.sourcing, cause: 'Pacific Pulp is our only source of 12 oz cups, is late on one delivery in five, and the contract ends Dec 31.', plan: 'RFQ to three cup makers this week; trial 20,000 cups in six cafés; decide before the contract talks.' } },
  { key: 'act-pacific-credit', fields: { title: 'Claim credit for 1,150 cracked lids', supplier: 'sup-pacific', status: 'open', owner: 'Hannah Lee', 'due-date': '2026-11-03', 'proposed-by': AGENT.quality, cause: 'Lot L-2241 failed inspection: 2.4% of lids cracked.', plan: 'Send the inspection photos and lot numbers; ask for a credit note and a corrective action report.' } },
  { key: 'act-altura-surcharge', fields: { title: 'Dispute Altura’s freight surcharge against the contract', supplier: 'sup-altura', status: 'open', owner: 'Marco Ruiz', 'due-date': '2026-11-14', 'proposed-by': AGENT.price, cause: 'The forward contract prices coffee delivered to Oakland; a $0.11/lb surcharge adds about $35K a year.', plan: 'Send the contract clause and the October invoice lines; ask for a credit and written confirmation that the surcharge is dropped.' } },
  { key: 'act-northline-audit', fields: { title: 'Audit Northline’s accessorial charges and temperature logs', supplier: 'sup-northline', status: 'in-progress', owner: 'Aisha Okafor', 'due-date': '2026-11-12', 'proposed-by': AGENT.ap, cause: 'One invoice in five carries charges not on the PO, three loads broke the cold chain, and the contract ends Jan 31.', plan: 'Hold the nine disputed invoices; request the October temperature logs; meet Northline with both before deciding to renew.' } },
  { key: 'act-valley-renewal', fields: { title: 'Settle Valley Oat’s renewal terms before Dec 15', supplier: 'sup-valley', status: 'open', owner: 'Marco Ruiz', 'due-date': '2026-11-25', 'proposed-by': AGENT.sourcing, cause: 'On watch with the contract ending in six weeks: price creep and slower deliveries.', plan: 'Renew only at the contract price with a delivery-day commitment; Bellweather’s oat trial is the fallback.' } },
  { key: 'act-summit-visits', fields: { title: 'Confirm Q4 maintenance visits for all 38 cafés', supplier: 'sup-summit', status: 'done', owner: 'Aisha Okafor', 'due-date': '2026-10-31', 'proposed-by': AGENT.sourcing, cause: 'Routine, not risk: quarterly maintenance before the holiday rush.', plan: 'All 38 visits booked and done by Oct 31.' } },
];

const reviews = [
  { key: 'rev-oct-26', fields: { title: 'Week of Oct 20 – Oct 26', status: 'final', 'period-start': '2026-10-20', 'period-end': '2026-10-26', headline: '$1.42M of spend sits with one at-risk supplier; two more are slipping.', 'spend-at-risk': 1420000, 'at-risk-count': 1, 'written-by': AGENT.sourcing,
    body: '**At risk — $1.42M**\n- **Altura Green Coffee** ($1.42M, contract to Mar 31): two lots over moisture spec, a freight surcharge 4.6% over contract.\n\n**Watch closely**\n- **Pacific Pulp Packaging** ($940K, ends Dec 31): late deliveries and a resin surcharge; we have no backup for 12 oz cups.\n- **Northline Refrigerated Freight** ($610K, ends Jan 31): three cold-chain breaks.\n\n**Changed since last week**\n- Summit Espresso finished all 38 café visits.' } },
  { key: 'rev-nov-02', fields: { title: 'Week of Oct 27 – Nov 2', status: 'draft', 'period-start': '2026-10-27', 'period-end': '2026-11-02', headline: '$2.97M of annual spend is at risk; Pacific Pulp and Northline turned red.', 'spend-at-risk': 2970000, 'at-risk-count': 3, 'written-by': AGENT.sourcing,
    body: '**Spend at risk: $2.97M** with 3 of 14 suppliers (42% of $7.15M), up from $1.42M.\n\n**At risk**\n- **Pacific Pulp Packaging** — $940K, contract ends Dec 31, score 30. 78% on time, 2.4% of lids cracked, single source for 12 oz cups. Actions: qualify a second supplier by Nov 20; lid credit — **overdue since Nov 3**.\n- **Northline Refrigerated Freight** — $610K, ends Jan 31, score 38. 21% of invoices with charges not on the PO; three cold-chain breaks. Action: audit by Nov 12.\n- **Altura Green Coffee** — $1.42M, ends Mar 31, score 36. Surcharge 4.6% over contract; harvest three weeks late. Action: dispute the surcharge by Nov 14.\n\n**Watch, contract ending within 90 days**\n- Valley Oat ($780K, Dec 15, score 68) and Ironleaf Roaster Parts ($180K, Jan 20, score 54).\n\n**Decisions for Monday**\n1. Approve the cup RFQ to three makers.\n2. Hold Northline’s nine disputed invoices.\n3. Renew Valley Oat only at the contract price.' } },
];

export const demoRecords = {
  suppliers,
  signals,
  actions,
  reviews,
};
