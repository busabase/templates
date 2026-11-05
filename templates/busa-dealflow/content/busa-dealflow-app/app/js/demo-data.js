// Sample rows for one fictional investment team. Every company, person and
// conversation here is invented (synthetic sample data), and none of it carries
// fund returns or portfolio-company financials. `scripts/sync-content.mjs`
// writes these into `content/<base>/records.ndjson` (what a fresh install opens
// on), and `?demo=1` reads the same rows, so the two never tell different stories.
//
// The sample is in English, the template's default language. Each company keeps
// its Chinese name in `aliases`, so a Chinese transcript still finds it.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// The week of 2026-11-02 is "this week" for the sample (asOf 2026-11-05).

const SYNTHETIC = 'Synthetic sample data (fictional company)';

const deals = [
  { key: 'deal-spruce', fields: {
    name: 'Spruce Robotics', company: 'Spruce Robotics (Suzhou) Co., Ltd. (fictional)', aliases: '云杉智造, 云杉, Spruce, Yunshan', stage: 'diligence', sector: 'robotics', round: 'Series A', owner: 'Lin Xiao', team: 'tech',
    'one-liner': 'Flexible assembly robots and line-scheduling software for small factories, subscribed per workstation per month.',
    'latest-finding': 'Two auto-parts customers moved to a second deployment; delivery time cut from about six weeks to about three (founder\'s account, to be checked with customers).',
    'next-step': 'Visit two factory customers', 'next-step-due': '2026-11-07', 'last-meeting-on': '2026-10-28', source: SYNTHETIC } },
  { key: 'deal-clearview', fields: {
    name: 'Clearview Data', company: 'Clearview Data Intelligence (Hangzhou) Co., Ltd. (fictional)', aliases: '澄观数据, 澄观, Clearview', stage: 'first-meeting', sector: 'ai-infra', round: 'Pre-A', owner: 'Zhou Ke', team: 'tech',
    'one-liner': 'Turns data scattered across a company\'s systems into a catalog that agents can query directly.',
    'latest-finding': 'Three pilot customers, one of them a brokerage; the team admits permissions stop at the table level.',
    'next-step': 'Send the NDA and the data request list', 'next-step-due': '2026-11-06', 'last-meeting-on': '2026-11-03', source: SYNTHETIC } },
  { key: 'deal-wavecraft', fields: {
    name: 'Wavecraft Health', company: 'Wavecraft Medical Technology (Shanghai) Co., Ltd. (fictional)', aliases: '澜舟医疗, 澜舟, Wavecraft', stage: 'ic', sector: 'healthcare', round: 'Series B', owner: 'Chen Siyuan', team: 'healthcare',
    'one-liner': 'Lung-nodule imaging assistance for county hospitals, with a Class II medical device certificate.',
    'latest-finding': 'The IC has met; its conclusion lives only in the leadership table. Shared line: moving to term discussions.',
    'next-step': 'Send the founder the list of conditions', 'next-step-due': '2026-11-08', 'last-meeting-on': '2026-11-04', source: SYNTHETIC } },
  { key: 'deal-perch', fields: {
    name: 'Perch Coffee', company: 'Perch Food & Beverage (Shenzhen) Co., Ltd. (fictional)', aliases: '栖木咖啡, 栖木, Perch', stage: 'passed', sector: 'consumer', round: 'Angel', owner: 'He Jia', team: 'consumer',
    'one-liner': 'Neighbourhood specialty coffee chain with its own roastery.',
    'latest-finding': 'Expansion depends on franchising, which does not fit our consumer thesis; declined politely.',
    'next-step': 'Stay in touch, revisit in six months', 'last-meeting-on': '2026-10-30', source: SYNTHETIC } },
  { key: 'deal-starplan', fields: {
    name: 'Starplan Software', company: 'Starplan Software (Beijing) Co., Ltd. (fictional)', aliases: '星策软件, 星策, Starplan', stage: 'portfolio', sector: 'enterprise', round: 'Series B (invested)', owner: 'Wang Liheng', team: 'tech',
    'one-liner': 'Sales and service collaboration software for manufacturers. Portfolio company.',
    'latest-finding': 'The new CTO has started; channel partnerships are next quarter\'s focus and the founder asked us for introductions.',
    'next-step': 'Introduce two channel partners', 'next-step-due': '2026-11-15', 'last-meeting-on': '2026-11-04', source: SYNTHETIC } },
  { key: 'deal-polaris', fields: {
    name: 'Polaris Compute', company: 'Polaris Compute Technology (Chengdu) Co., Ltd. (fictional)', aliases: '北辰算力, 北辰, Polaris', stage: 'sourcing', sector: 'ai-infra', round: 'Seed', owner: 'He Jia', team: 'tech',
    'one-liner': 'On-demand inference cluster scheduling for small model teams.',
    'latest-finding': 'Pitch deck received; team not met yet.',
    'next-step': 'Screen the deck and decide on a first meeting', 'next-step-due': '2026-11-06', 'last-meeting-on': '2026-11-02', source: SYNTHETIC } },
];

const meetings = [
  { key: 'mtg-spruce-1', fields: {
    title: '2026-10-14 · Spruce Robotics · First meeting', deal: 'deal-spruce', 'held-on': '2026-10-14', kind: 'intro', phase: 'pre', attendees: 'Lin Xiao; Zhang Yifan, Spruce founder & CEO (fictional)', 'recorded-by': 'Lin Xiao', 'logged-via': 'Codex',
    summary: '- The founding team comes from industrial automation and has built flexible assembly for four years.\n- Product: robot-arm workstations plus line-scheduling software, subscribed per workstation per month.\n- Customers today are mostly auto-parts and electronics assembly plants in the Yangtze River Delta.',
    highlights: '- Small factories accept a subscription more readily than expected.\n- Delivery depends on field engineers; scale is the open question.',
    questions: '- How much delivery effort does each workstation really take?\n- Will customers renew?' } },
  { key: 'mtg-spruce-2', fields: {
    title: '2026-10-28 · Spruce Robotics · Follow-up meeting', deal: 'deal-spruce', 'held-on': '2026-10-28', kind: 'follow-up', phase: 'pre', attendees: 'Lin Xiao, Wang Liheng; Zhang Yifan (fictional)', 'recorded-by': 'Lin Xiao', 'logged-via': 'Codex',
    summary: '- A partner joined for the product demo and the delivery walkthrough.\n- The new scheduling software moves deployment from on-site tuning to mostly remote configuration.\n- Both sides agreed to start due diligence.',
    highlights: '- Remote configuration cuts delivery effort sharply (founder\'s account).\n- The partner\'s concern: stability of the core algorithm team.',
    questions: '- Delivery time needs checking with customers.\n- Has the head of algorithms signed a long-term agreement?' } },
  { key: 'mtg-clearview-1', fields: {
    title: '2026-11-03 · Clearview Data · First meeting', deal: 'deal-clearview', 'held-on': '2026-11-03', kind: 'intro', phase: 'pre', attendees: 'Zhou Ke; Xu Ning, Clearview CEO (fictional)', 'recorded-by': 'Zhou Ke', 'logged-via': 'WorkBuddy',
    summary: '- The product turns data from ERP, CRM and documents into one catalog that agents query.\n- Three pilot customers, one a brokerage.\n- Plans to raise a Pre-A round before year end.',
    highlights: '- Lands exactly on "every employee has an agent, but the data is not shared".\n- Permissions stop at the table level; financial customers will ask about that.',
    questions: '- What does a private deployment cost to deliver?\n- How is it different from the big platforms\' data products?' } },
  { key: 'mtg-wavecraft-dd', fields: {
    title: '2026-10-21 · Wavecraft Health · Diligence interview', deal: 'deal-wavecraft', 'held-on': '2026-10-21', kind: 'diligence', phase: 'during', attendees: 'Chen Siyuan; heads of radiology at two partner hospitals (fictional)', 'recorded-by': 'Chen Siyuan', 'logged-via': 'Claude Code',
    summary: '- Interviewed radiology at two county hospitals: reading volume is high and the software is used mainly as a first-pass prompt.\n- Doctors value fewer misses but complain about false positives.',
    highlights: '- Doctors will keep using it if false positives keep falling.\n- Purchasing is led by the hospital IT department; decisions take long.',
    questions: '- What is the plan for false positives in the next algorithm version?' } },
  { key: 'mtg-wavecraft-ic', fields: {
    title: '2026-11-04 · Wavecraft Health · IC meeting', deal: 'deal-wavecraft', 'held-on': '2026-11-04', kind: 'ic', phase: 'during', attendees: 'Wang Liheng, Chen Siyuan and the investment committee', 'recorded-by': 'Chen Siyuan', 'logged-via': 'Manual',
    summary: '- The investment committee met and the deal team presented its diligence findings.\n- The conclusion and the partners\' view are recorded in "IC notes (leadership only)", not here.',
    highlights: '- Moving to term discussions.',
    questions: '- None (see the leadership table).' } },
  { key: 'mtg-perch-1', fields: {
    title: '2026-10-09 · Perch Coffee · First meeting', deal: 'deal-perch', 'held-on': '2026-10-09', kind: 'intro', phase: 'pre', attendees: 'He Jia; Perch founder (fictional)', 'recorded-by': 'He Jia', 'logged-via': 'Codex',
    summary: '- Neighbourhood specialty coffee with its own roastery.\n- Plans to grow quickly through franchising.',
    highlights: '- Strong product reputation; repeat visits come from regulars in the neighbourhood.',
    questions: '- How is quality kept under franchising?' } },
  { key: 'mtg-perch-2', fields: {
    title: '2026-10-30 · Perch Coffee · Follow-up meeting', deal: 'deal-perch', 'held-on': '2026-10-30', kind: 'follow-up', phase: 'pre', attendees: 'He Jia, Wang Liheng; Perch founder (fictional)', 'recorded-by': 'He Jia', 'logged-via': 'Codex',
    summary: '- Went through the franchise plan in detail.\n- Internal view: growth depends on franchising, which does not fit our consumer thesis.',
    highlights: '- Decided to decline politely and revisit in six months.',
    questions: '' } },
  { key: 'mtg-starplan-q3', fields: {
    title: '2026-09-25 · Starplan Software · Portfolio review', deal: 'deal-starplan', 'held-on': '2026-09-25', kind: 'board', phase: 'post', attendees: 'Wang Liheng; Starplan management (fictional)', 'recorded-by': 'Wang Liheng', 'logged-via': 'Claude Code',
    summary: '- Quarterly review: product roadmap, hiring and the channel plan.\n- A CTO candidate is in final interviews.',
    highlights: '- Hiring is the biggest bottleneck right now.',
    questions: '- When will the CTO start?' } },
  { key: 'mtg-starplan-nov', fields: {
    title: '2026-11-04 · Starplan Software · Portfolio review', deal: 'deal-starplan', 'held-on': '2026-11-04', kind: 'board', phase: 'post', attendees: 'Wang Liheng, He Jia; Starplan CEO and CTO (fictional)', 'recorded-by': 'He Jia', 'logged-via': 'Claude Code',
    summary: '- The new CTO has started and walked through a first technical roadmap.\n- Next quarter\'s focus is channel partnerships; they would like introductions from us.',
    highlights: '- CTO in place; the hiring bottleneck is cleared.\n- Channel partnerships need our introductions.',
    questions: '- The roadmap has no milestones yet.' } },
  { key: 'mtg-starplan-pack', fields: {
    title: '2026-11-04 · Starplan Software · Board pack filed', deal: 'deal-starplan', 'held-on': '2026-11-04', kind: 'document', phase: 'post', attendees: '', 'recorded-by': 'He Jia', 'logged-via': 'Claude Code',
    summary: '- Filed this quarter\'s board pack (no file attached in the sample).\n- New since September: the CTO hire and the channel plan.',
    highlights: '- Operating figures in the pack were not copied into the shared tables (the rule is to keep the original only).',
    questions: '' } },
  { key: 'mtg-polaris-bp', fields: {
    title: '2026-11-02 · Polaris Compute · Pitch deck received', deal: 'deal-polaris', 'held-on': '2026-11-02', kind: 'document', phase: 'pre', attendees: '', 'recorded-by': 'He Jia', 'logged-via': 'WorkBuddy',
    summary: '- Received the Polaris Compute deck (no file attached in the sample) through a friend\'s referral.\n- Inference cluster scheduling for small model teams.',
    highlights: '- Same AI-infrastructure theme as Clearview Data; worth looking at together.',
    questions: '- Team background still to be checked.' } },
];

const followups = [
  { key: 'fu-spruce-visits', fields: { title: 'Visit two factory customers', deal: 'deal-spruce', meeting: 'mtg-spruce-2', owner: 'Lin Xiao', 'due-on': '2026-11-07', status: 'open', priority: 'high' } },
  { key: 'fu-spruce-list', fields: { title: 'Get the list of delivery projects from the last two quarters', deal: 'deal-spruce', meeting: 'mtg-spruce-2', owner: 'Lin Xiao', 'due-on': '2026-11-03', status: 'open', priority: 'normal' } },
  { key: 'fu-clearview-nda', fields: { title: 'Send the NDA and the data request list', deal: 'deal-clearview', meeting: 'mtg-clearview-1', owner: 'Zhou Ke', 'due-on': '2026-11-06', status: 'open', priority: 'normal' } },
  { key: 'fu-wavecraft-terms', fields: { title: 'Send the founder the list of conditions', deal: 'deal-wavecraft', meeting: 'mtg-wavecraft-ic', owner: 'Chen Siyuan', 'due-on': '2026-11-08', status: 'in-progress', priority: 'high' } },
  { key: 'fu-wavecraft-legal', fields: { title: 'Start legal due diligence', deal: 'deal-wavecraft', meeting: 'mtg-wavecraft-ic', owner: 'Chen Siyuan', 'due-on': '2026-11-12', status: 'open', priority: 'normal' } },
  { key: 'fu-starplan-channels', fields: { title: 'Introduce two channel partners', deal: 'deal-starplan', meeting: 'mtg-starplan-nov', owner: 'Wang Liheng', 'due-on': '2026-11-15', status: 'open', priority: 'normal' } },
  { key: 'fu-starplan-roadmap', fields: { title: 'Follow up on milestones for the CTO\'s roadmap', deal: 'deal-starplan', meeting: 'mtg-starplan-q3', owner: 'He Jia', 'due-on': '2026-10-31', status: 'open', priority: 'normal' } },
  { key: 'fu-polaris-screen', fields: { title: 'Screen the deck and decide on a first meeting', deal: 'deal-polaris', meeting: 'mtg-polaris-bp', owner: 'He Jia', 'due-on': '2026-11-06', status: 'open', priority: 'low' } },
  { key: 'fu-perch-decline', fields: { title: 'Send Perch the decline email', deal: 'deal-perch', meeting: 'mtg-perch-2', owner: 'He Jia', 'due-on': '2026-10-31', status: 'done', priority: 'normal', 'done-on': '2026-10-31', notes: 'Sent; agreed to revisit in six months.' } },
  { key: 'fu-starplan-board-date', fields: { title: 'Confirm the next board date', deal: 'deal-starplan', meeting: 'mtg-starplan-q3', owner: 'Wang Liheng', 'due-on': '2026-11-03', status: 'done', priority: 'normal', 'done-on': '2026-11-03', notes: 'Set for the second week of December.' } },
];

const digests = [
  { key: 'digest-w44', fields: {
    title: '2026-W44 Investment team digest', 'period-start': '2026-10-26', 'period-end': '2026-11-01', status: 'final', 'projects-seen': 2, 'meetings-held': 2,
    body: '## Projects seen this week\n- **Spruce Robotics** (due diligence, Lin Xiao): follow-up meeting with a partner; agreed to start diligence.\n- **Perch Coffee** (passed, He Jia): follow-up meeting, then declined.\n\n## Key findings\n- Spruce: remote configuration cuts delivery effort sharply; to be checked in customer visits.\n\n## Stage changes\n- Spruce Robotics: first meeting → due diligence\n- Perch Coffee: first meeting → passed',
    'for-leadership': '- Diligence on Spruce should look hard at the stability of the core algorithm team.' } },
];

// The leadership-only table's sample row is deliberately NOT in this file. The
// AirApp's files are readable — and greppable — by every member, so anything
// here would be visible to people the IC table is hidden from. The package's
// sample IC row lives only in `content/ic-notes/records.ndjson`.
const icNotes = [
  { key: 'ic-demo-placeholder', fields: {
    title: 'Demo mode · sample IC decision', deal: 'deal-wavecraft', 'decided-on': '2026-11-04', decision: 'conditional',
    'partners-view': 'Demo mode carries no IC content. Once installed, this table is visible only to the leadership it is shared with.' } },
];

export const demoRecords = { deals, meetings, followups, digests, 'ic-notes': icNotes };
