// The app's own declaration of the workspace it reads. This file is the source:
// `scripts/sync-content.mjs` (template root) generates every
// `content/<base>/base.json` and `records.ndjson` from it, so edit fields,
// views and node prompts here and re-run the script — never the generated files.

const loc = (en, zh) => ({ en, 'zh-CN': zh });

// A field as the app reads it: `name` is what the installed Base shows
// (English, one language), `localizedName` is what this UI shows in the
// viewer's language.
const field = (slug, en, zh, type, options = {}, required = false) => ({
  slug, name: en, localizedName: loc(en, zh), type, required, options,
});
// Choice ids are the stable values agents write; names are for people.
const choices = (...items) => ({
  choices: items.map(([id, en, zh, tone = 'neutral']) => ({ id, name: en, localizedName: loc(en, zh), tone })),
});
const relation = (targetBaseSlug, multiple = false) => ({ targetBaseSlug, multiple });

// Every prompt body names the skill that owns the job, so the agent reads the
// playbook before it touches data. Busabase adds the line naming the node.
const prompt = (key, label, body, intent = 'change') => ({ key, label, body, intent });
const skillBody = (en, zh) => loc(
  `Read the \`busa-store-ops\` skill in this folder and follow it. ${en}`,
  `先阅读本文件夹里的 \`busa-store-ops\` Skill，按它的规则做。${zh}`,
);

const APP = 'busa-store-ops';
const slug = (key) => `${APP}-${key}`;

// One status per store. The rule that sets it is in SKILL.md and
// model.js#statusFor: five measures, twenty points each.
const STATUS = choices(
  ['on-track', 'On standard', '达标', 'positive'],
  ['watch', 'Watch', '关注', 'warning'],
  ['at-risk', 'At risk', '有风险', 'danger'],
);

const bases = [
  {
    key: 'stores',
    slug: slug('stores'),
    name: 'Stores',
    localizedName: loc('Stores', '门店'),
    description: 'Every store in the chain: region, area manager, store manager, revenue, the date of its last standards audit, the five measures behind its score, and the score itself.',
    localizedDescription: loc('Every store in the chain: region, area manager, store manager, revenue, the date of its last standards audit, the five measures behind its score, and the score itself.', '连锁里的每一家门店：区域、区域经理、店长、营收、最近一次巡店日期、门店评分背后的五项指标，以及评分本身。'),
    readLimit: 50,
    primary: 'name',
    status: 'status',
    fields: [
      field('name', 'Store', '门店', 'text', {}, true),
      field('region', 'Region', '区域', 'select', choices(
        ['bay-area', 'Bay Area', '湾区', 'accent'],
        ['seattle', 'Seattle', '西雅图', 'neutral'],
        ['portland', 'Portland', '波特兰', 'neutral'],
        ['los-angeles', 'Los Angeles', '洛杉矶', 'neutral'],
      )),
      field('area-manager', 'Area manager', '区域经理', 'text'),
      field('store-manager', 'Store manager', '店长', 'text'),
      field('address', 'Address', '地址', 'text'),
      field('revenue-30d', 'Revenue, last 30 days ($)', '近 30 天营收（美元）', 'number'),
      field('audited-on', 'Last standards audit', '最近一次巡店', 'date'),
      field('audit-score', 'Standards audit score (0–100)', '巡店得分（0–100）', 'number'),
      field('sales-pct', 'Sales vs target, month to date (%)', '本月销售达成率（%）', 'number'),
      field('rating', 'Review rating, last 30 days (1–5)', '近 30 天点评评分（1–5）', 'number'),
      field('staffing-pct', 'Shifts filled, last 14 days (%)', '近 14 天排班到岗率（%）', 'number'),
      field('overdue-fixes', 'Audit fixes past due', '逾期未整改项', 'number'),
      field('score', 'Store score', '门店评分', 'number'),
      field('status', 'Status', '状态', 'select', STATUS),
      field('scored-by', 'Last scored by', '最近评分者', 'text'),
      field('scored-on', 'Last scored', '最近评分', 'date'),
      field('summary', 'Latest word', '最新情况', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All stores', description: 'Every store, by region, with its status', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'audited-on', direction: 'desc' }], visibleFieldSlugs: ['name', 'region', 'area-manager', 'revenue-30d', 'audited-on', 'score', 'status'] } },
      { slug: 'at-risk', name: 'At risk', description: 'Stores whose score is under 50', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['name', 'region', 'area-manager', 'revenue-30d', 'score', 'summary'] } },
    ],
    agentPrompts: [
      prompt('rescore', loc('Re-score this store from its latest measures', '用最新指标给这家门店重新打分'),
        skillBody('For the store I name, read its five measures, compute the score and status by the skill’s rule, and update `score`, `status`, `scored-by`, `scored-on` and a one-sentence `summary`. Propose an action if it turned at risk and has none open.', '针对我说的门店，读它的五项指标，按 Skill 的规则算评分和状态，更新 `score`、`status`、`scored-by`、`scored-on` 和一句话的 `summary`。如果变成有风险且没有进行中的跟进措施，提一条。')),
      prompt('store-brief', loc('Brief me before I visit this store', '巡店之前给我讲讲这家店'),
        skillBody('For the store I name, give a one-screen brief: region, store manager, revenue, when it was last audited, the score with each of its five parts, the last five signals and who wrote them, open actions, and three things to check on the visit. Do not change anything.', '针对我说的门店，给一屏简报：区域、店长、营收、上次巡店时间、评分及五项得分、最近五条信号及写入者、进行中的跟进措施，以及这次到店要查的三件事。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'signals',
    slug: slug('signals'),
    name: 'Signals',
    localizedName: loc('Signals', '信号'),
    description: 'One row every time a store’s measure moves — audit score, sales, reviews, staffing, overdue fixes — or there is something worth knowing, with the evidence and which agent or person wrote it.',
    localizedDescription: loc('One row every time a store’s measure moves — audit score, sales, reviews, staffing, overdue fixes — or there is something worth knowing, with the evidence and which agent or person wrote it.', '门店的巡店得分、销售、点评、排班或逾期整改每变动一次、或有值得知道的情况时记一行：依据，以及是哪个 Agent 或哪个人写的。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Signal', '信号', 'text', {}, true),
      field('store', 'Store', '门店', 'relation', relation(slug('stores'))),
      field('kind', 'Kind', '类型', 'select', choices(
        ['audit', 'Standards audit', '巡店', 'accent'],
        ['sales', 'Sales', '销售', 'neutral'],
        ['rating', 'Reviews', '点评', 'neutral'],
        ['staffing', 'Staffing', '排班', 'neutral'],
        ['fixes', 'Overdue fixes', '逾期整改', 'neutral'],
        ['note', 'Note', '情况备注', 'warning'],
      )),
      field('recorded-on', 'Date', '日期', 'date'),
      field('previous-value', 'Was', '原值', 'number'),
      field('new-value', 'Now', '新值', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('writer', 'Writer', '写入方', 'select', choices(
        ['agent', 'Agent', 'Agent', 'accent'],
        ['person', 'Person', '人', 'neutral'],
      )),
      field('evidence', 'Evidence', '依据', 'longtext'),
      field('source-url', 'Source link', '来源链接', 'url'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every signal, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'store', 'kind', 'recorded-on', 'written-by'] } },
      { slug: 'notes', name: 'Notes', description: 'Equipment failures, staff changes, what an area manager noticed', type: 'table', config: { filters: [{ fieldSlug: 'kind', operator: 'equals', value: 'note' }], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'store', 'recorded-on', 'written-by'] } },
    ],
    agentPrompts: [
      prompt('log-signal', loc('Log what I noticed at a store', '记下我在门店注意到的情况'),
        skillBody('Record what I tell you about the store I name as one signal: the kind, today’s date, me as the writer and the evidence in my words. If it changes one of the five measures, update that field and re-score the store.', '把我说的关于某家门店的情况记成一条信号：类型、今天的日期、写入者是我、依据用我的原话。如果它改变了五项指标之一，更新那个字段并重新打分。')),
      prompt('what-moved', loc('What moved this week, and who wrote it?', '这周哪些信号变了，是谁写的'),
        skillBody('Summarise the signals of the last seven days by store, worst first: what moved, by how much, and which agent or person wrote each one. Do not change anything.', '按门店汇总最近七天的信号，最差的排前面：变了什么、变了多少、每条是哪个 Agent 或哪个人写的。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'actions',
    slug: slug('actions'),
    name: 'Store Actions',
    localizedName: loc('Store Actions', '整改措施'),
    description: 'What we will do for a store that is slipping or overdue for an audit: the cause, the plan, an owner and a date.',
    localizedDescription: loc('What we will do for a store that is slipping or overdue for an audit: the cause, the plan, an owner and a date.', '针对下滑或巡店逾期的门店要做什么：原因、计划、负责人和日期。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Action', '整改措施', 'text', {}, true),
      field('store', 'Store', '门店', 'relation', relation(slug('stores'))),
      field('status', 'Status', '状态', 'select', choices(
        ['open', 'Open', '待开始', 'warning'],
        ['in-progress', 'In progress', '进行中', 'accent'],
        ['done', 'Done', '已完成', 'positive'],
        ['dropped', 'Dropped', '已放弃', 'neutral'],
      )),
      field('owner', 'Owner', '负责人', 'text'),
      field('due-date', 'Due', '截止', 'date'),
      field('proposed-by', 'Proposed by', '提出者', 'text'),
      field('cause', 'What is wrong', '问题在哪', 'longtext'),
      field('plan', 'What we will do', '应对计划', 'longtext'),
    ],
    views: [
      { slug: 'by-due', name: 'By due date', description: 'Every action, soonest due first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'store', 'status', 'owner', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('propose-action', loc('Propose an action for a store that is slipping', '为一家下滑的门店提出整改措施'),
        skillBody('For the store I name, read its signals and score, explain in two or three sentences what is wrong, and add one action with a concrete plan, an owner and a due date. The owner is the person who can fix it — the store manager, the area manager or facilities.', '针对我说的门店，读它的信号和评分，用两三句话说明问题在哪，然后加一条整改措施，写清具体计划、负责人和截止日期。负责人是能解决问题的人——店长、区域经理或设施维修。')),
      prompt('chase-actions', loc('Which store actions are overdue?', '哪些整改措施已经超期'),
        skillBody('List open actions past their due date with their owner and store, and say whether that store’s score has moved since the action was opened. Do not change anything.', '列出超过截止日期仍未完成的整改措施、负责人和对应门店，并说明措施开出以后这家门店的评分有没有变化。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reviews',
    slug: slug('reviews'),
    name: 'Store Reviews',
    localizedName: loc('Store Reviews', '门店周报'),
    description: 'The Monday store review an agent writes from the records above: revenue at risk, which stores slipped and why, which audits are overdue.',
    localizedDescription: loc('The Monday store review an agent writes from the records above: revenue at risk, which stores slipped and why, which audits are overdue.', 'Agent 每周一根据以上记录写的门店周报：多少营收有风险、哪些门店下滑以及原因、哪些巡店逾期。'),
    readLimit: 20,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Review', '周报', 'text', {}, true),
      field('status', 'Status', '状态', 'select', choices(
        ['draft', 'Draft', '草稿', 'warning'],
        ['final', 'Final', '定稿', 'positive'],
      )),
      field('period-start', 'From', '开始', 'date'),
      field('period-end', 'To', '结束', 'date'),
      field('headline', 'Headline', '一句话结论', 'text'),
      field('revenue-at-risk', 'Revenue at risk, 30 days ($)', '有风险的近 30 天营收（美元）', 'number'),
      field('on-track-count', 'On standard', '达标门店', 'number'),
      field('at-risk-count', 'At risk', '有风险门店', 'number'),
      field('audit-overdue-count', 'Audits overdue', '巡店逾期门店', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('body', 'Review', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every store review, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-end', 'revenue-at-risk', 'headline'] } },
    ],
    agentPrompts: [
      prompt('write-review', loc('Write this Monday’s store review', '写本周一的门店周报'),
        skillBody('Write the store review for last Monday to Sunday from the stores, signals and actions: a one-line headline, revenue at risk, how many stores are on standard, every at-risk store with what is wrong and the action, every store whose audit is overdue, and what changed since last week. Save it as a draft.', '根据门店、信号和整改措施，写上周一到周日的门店周报：一句话结论、有风险的营收、达标门店数、每家有风险门店的问题和对应措施、巡店逾期的门店、与上周相比的变化。保存为草稿。')),
      prompt('compare-weeks', loc('What got better or worse since last week?', '和上周比哪些变好了、哪些变差了'),
        skillBody('Compare the two latest reviews and the signals between them: revenue at risk, which stores changed status, how the at-risk count moved, and which actions closed. Do not change anything.', '对比最近两份周报和期间的信号：有风险的营收、哪些门店换了状态、有风险门店数怎么变、哪些整改措施完成了。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the
// AirApp's own prompts, and the guide dialog lists them.
const folderPrompts = [
  prompt('ask-risk', loc('Which stores are slipping, and how much revenue is at risk?', '哪些门店在下滑，多少营收有风险'),
    skillBody('Answer as the head of store operations: revenue at risk and how many stores are on standard, then every at-risk store, lowest score first, with its revenue, the measure that hurt most, and the open action. Then every store whose standards audit is overdue. Keep it to one screen. Do not change anything.', '以门店运营负责人的口吻回答：先说多少营收有风险、多少门店达标，再按评分从低到高列出每家有风险的门店，附营收、拉低最多的指标和对应的整改措施；然后列出巡店逾期的门店。控制在一屏以内。不要修改任何记录。'), 'read-only'),
  prompt('weekly-scan', loc('Run this week’s store scan', '跑本周门店扫描'),
    skillBody('For each store, read the audit score, sales, reviews, staffing and overdue fixes from their sources, write a signal for anything that moved, re-score it by the skill’s rule, propose an action for any store newly at risk, and then write this week’s store review as a draft.', '为每家门店从数据来源读取巡店得分、销售、点评、排班和逾期整改，有变动的写一条信号，按 Skill 的规则重新打分，新变成有风险的提一条整改措施，最后写一份本周门店周报草稿。')),
  prompt('write-review', loc('Write this Monday’s store review', '写本周一的门店周报'),
    skillBody('Write the store review for last Monday to Sunday: a one-line headline, revenue at risk, how many stores are on standard, every at-risk store with what is wrong and the action, every store whose audit is overdue, and what changed since last week.', '写上周一到周日的门店周报：一句话结论、有风险的营收、达标门店数、每家有风险门店的问题和对应措施、巡店逾期的门店、与上周相比的变化。')),
  prompt('plan-visits', loc('Plan this week’s store visits', '排本周的巡店计划'),
    skillBody('List the stores an area manager should visit this week, most urgent first: every at-risk store and every store with no audit in the last 30 days, grouped by region, with what to check at each. Do not change anything.', '列出本周区域经理该去的门店，最急的排前面：每家有风险的门店，以及近 30 天没巡过的门店，按区域分组，写清每家要查什么。不要修改任何记录。'), 'read-only'),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'Store Ops Desk',
  title: loc('Store Ops Desk', '连锁门店巡店'),
  description: 'Agents read audits, sales, reviews, staffing and overdue fixes for every store, score each one by one rule, and flag the stores that slip before revenue does.',
  localizedDescription: loc(
    'Agents read audits, sales, reviews, staffing and overdue fixes for every store, score each one by one rule, and flag the stores that slip before revenue does.',
    'Agent 读取每家门店的巡店结果、销售、点评、排班和逾期整改，按同一条规则打分，在营收掉下来之前标出正在下滑的门店。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#4d7c0f' },
  asOf: '2026-11-16',
  // A store with no standards audit in this many days is overdue for one and
  // needs attention whatever its score.
  auditWindowDays: 30,
  folder: { name: 'Store Ops Desk', slug: APP, description: 'Every store in the chain, scored the same way and kept current by agents from standards audits, the POS, review sites, the scheduling system and the facilities queue, with the actions that fix the ones that slip.' },
  airApp: { name: 'Store Ops Desk', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // sort, so a desk with years of signals still opens on the current rows.
  sources: [
    { key: 'stores', base: 'stores', limit: 50, sort: { fieldSlug: 'audited-on', fieldType: 'date', direction: 'desc' } },
    { key: 'signals', base: 'signals', limit: 50, sort: { fieldSlug: 'recorded-on', fieldType: 'date', direction: 'desc' } },
    { key: 'actions', base: 'actions', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' } },
    { key: 'reviews', base: 'reviews', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow.' },
  ui: {
    summary: loc('Every store, one score, before revenue slips', '每家门店一个评分，在营收下滑之前'),
    detail_modes: { stores: 'page', signals: 'drawer', actions: 'split', reviews: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skill in this folder; each agent writes only the measure it reads from its own source. People own sales targets, schedules, hiring, prices, repairs that cost money and anything said to staff or customers.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；每个 Agent 只写它从自己的数据来源读到的指标。销售目标、排班、招人、价格、要花钱的维修，以及对员工和顾客说的话，都由人来定。',
  ),
};
