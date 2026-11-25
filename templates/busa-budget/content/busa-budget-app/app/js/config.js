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
  `Read the \`busa-budget\` skill in this folder and follow it. ${en}`,
  `先阅读本文件夹里的 \`busa-budget\` Skill，按它的规则做。${zh}`,
);

const APP = 'busa-budget';
const slug = (key) => `${APP}-${key}`;

// One status per cost center. The rule that sets it is in SKILL.md and
// model.js#statusFor: five measures, twenty points each.
const STATUS = choices(
  ['on-track', 'On track', '正常', 'positive'],
  ['watch', 'Watch', '关注', 'warning'],
  ['at-risk', 'At risk', '有风险', 'danger'],
);

const bases = [
  {
    key: 'departments',
    slug: slug('departments'),
    name: 'Cost Centers',
    localizedName: loc('Cost Centers', '部门预算'),
    description: 'Every department or cost center with a budget this year: its division, budget owner, finance partner, annual budget, year-to-date budget and actual, full-year forecast, open purchase orders, the five measures behind its score, and the score itself.',
    localizedDescription: loc('Every department or cost center with a budget this year: its division, budget owner, finance partner, annual budget, year-to-date budget and actual, full-year forecast, open purchase orders, the five measures behind its score, and the score itself.', '今年有预算的每一个部门或成本中心：所属事业线、预算负责人、财务 BP、全年预算、年初至今预算与实际、全年预测、未付采购单，评分背后的五项指标，以及评分本身。'),
    readLimit: 50,
    primary: 'name',
    status: 'status',
    fields: [
      field('name', 'Cost center', '部门 / 成本中心', 'text', {}, true),
      field('division', 'Division', '事业线', 'select', choices(
        ['product', 'Product & Engineering', '产品研发', 'accent'],
        ['gtm', 'Go-to-market', '市场与销售', 'neutral'],
        ['operations', 'Operations', '运营', 'neutral'],
        ['g-and-a', 'G&A', '职能', 'neutral'],
      )),
      field('budget-owner', 'Budget owner', '预算负责人', 'text'),
      field('finance-partner', 'Finance partner', '财务 BP', 'text'),
      field('annual-budget', 'Annual budget ($)', '全年预算（美元）', 'number'),
      field('forecast-on', 'Forecast last refreshed', '预测最近更新', 'date'),
      field('ytd-budget', 'Budget year to date ($)', '年初至今预算（美元）', 'number'),
      field('ytd-actual', 'Actual year to date ($)', '年初至今实际（美元）', 'number'),
      field('ytd-variance-pct', 'Spend vs YTD budget (%)', '实际对比年初至今预算（%）', 'number'),
      field('forecast', 'Full-year forecast ($)', '全年预测（美元）', 'number'),
      field('forecast-variance-pct', 'Forecast vs annual budget (%)', '全年预测对比预算（%）', 'number'),
      field('committed', 'Open purchase orders ($)', '已承诺未付采购单（美元）', 'number'),
      field('headcount-gap', 'Heads over plan', '超编人数', 'number'),
      field('unbudgeted-pos', 'Open POs without a budget line', '无预算科目的采购单', 'number'),
      field('renewals-undecided', 'Renewals in 60 days without a decision', '60 天内到期未决定的续费合同', 'number'),
      field('score', 'Budget score', '预算评分', 'number'),
      field('status', 'Status', '状态', 'select', STATUS),
      field('scored-by', 'Last scored by', '最近评分者', 'text'),
      field('scored-on', 'Last scored', '最近评分', 'date'),
      field('summary', 'Latest word', '最新情况', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All cost centers', description: 'Every cost center, with its status', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'forecast-on', direction: 'desc' }], visibleFieldSlugs: ['name', 'division', 'budget-owner', 'annual-budget', 'forecast', 'forecast-on', 'score', 'status'] } },
      { slug: 'at-risk', name: 'At risk', description: 'Cost centers whose score is under 50', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['name', 'budget-owner', 'annual-budget', 'forecast', 'score', 'summary'] } },
    ],
    agentPrompts: [
      prompt('rescore', loc('Re-score this cost center from its latest measures', '用最新指标给这个部门重新打分'),
        skillBody('For the cost center I name, read its five measures, compute the score and status by the skill’s rule, and update `score`, `status`, `scored-by`, `scored-on` and a one-sentence `summary`. Propose an action if it turned at risk and has none open.', '针对我说的部门，读它的五项指标，按 Skill 的规则算评分和状态，更新 `score`、`status`、`scored-by`、`scored-on` 和一句话的 `summary`。如果变成有风险且没有进行中的措施，提一条。')),
      prompt('owner-brief', loc('Brief me before the budget review with this owner', '和这个部门负责人开预算会之前给我讲讲'),
        skillBody('For the cost center I name, give a one-screen brief: annual budget, spend against the year-to-date budget, the full-year forecast and when it was last refreshed, open purchase orders, heads over plan, POs without a budget line, renewals waiting for a decision, the last five signals and who wrote them, open actions, and three questions to ask. Do not change anything.', '针对我说的部门，给一屏简报：全年预算、实际对比年初至今预算、全年预测及最近更新时间、未付采购单、超编人数、无预算科目的采购单、待决定的续费、最近五条信号及写入者、进行中的措施，以及要问的三个问题。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'signals',
    slug: slug('signals'),
    name: 'Signals',
    localizedName: loc('Signals', '信号'),
    description: 'One row every time a cost center’s measure moves — spend, forecast, headcount, purchasing, renewals — or there is something worth knowing, with the evidence and which agent or person wrote it.',
    localizedDescription: loc('One row every time a cost center’s measure moves — spend, forecast, headcount, purchasing, renewals — or there is something worth knowing, with the evidence and which agent or person wrote it.', '部门的实际支出、全年预测、编制、采购或续费每变动一次、或有值得知道的情况时记一行：依据，以及是哪个 Agent 或哪个人写的。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Signal', '信号', 'text', {}, true),
      field('department', 'Cost center', '部门', 'relation', relation(slug('departments'))),
      field('kind', 'Kind', '类型', 'select', choices(
        ['spend', 'Spend', '实际支出', 'accent'],
        ['forecast', 'Forecast', '全年预测', 'neutral'],
        ['headcount', 'Headcount', '编制', 'neutral'],
        ['purchasing', 'Purchasing', '采购', 'neutral'],
        ['renewals', 'Renewals', '续费', 'neutral'],
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
      { slug: 'latest', name: 'Latest first', description: 'Every signal, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'department', 'kind', 'recorded-on', 'written-by'] } },
      { slug: 'notes', name: 'Notes', description: 'Verbal approvals, vendor price changes, what a finance partner heard', type: 'table', config: { filters: [{ fieldSlug: 'kind', operator: 'equals', value: 'note' }], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'department', 'recorded-on', 'written-by'] } },
    ],
    agentPrompts: [
      prompt('log-signal', loc('Log what I heard about a budget', '记下我听到的预算情况'),
        skillBody('Record what I tell you about the cost center I name as one signal: the kind, today’s date, me as the writer and the evidence in my words. If it changes one of the five measures, update that field and re-score the cost center.', '把我说的关于某个部门的情况记成一条信号：类型、今天的日期、写入者是我、依据用我的原话。如果它改变了五项指标之一，更新那个字段并重新打分。')),
      prompt('what-moved', loc('What moved this week, and who wrote it?', '这周哪些信号变了，是谁写的'),
        skillBody('Summarise the signals of the last seven days by cost center, worst first: what moved, by how much, and which agent or person wrote each one. Do not change anything.', '按部门汇总最近七天的信号，最差的排前面：变了什么、变了多少、每条是哪个 Agent 或哪个人写的。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'actions',
    slug: slug('actions'),
    name: 'Budget Actions',
    localizedName: loc('Budget Actions', '预算措施'),
    description: 'What will be done for a cost center that is heading over budget or whose forecast is stale: the cause, the plan, an owner and a date.',
    localizedDescription: loc('What will be done for a cost center that is heading over budget or whose forecast is stale: the cause, the plan, an owner and a date.', '针对预计超支或预测过期的部门要做什么：原因、计划、负责人和日期。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Action', '措施', 'text', {}, true),
      field('department', 'Cost center', '部门', 'relation', relation(slug('departments'))),
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
      { slug: 'by-due', name: 'By due date', description: 'Every action, soonest due first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'department', 'status', 'owner', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('propose-action', loc('Propose an action for a cost center heading over budget', '为一个预计超支的部门提出措施'),
        skillBody('For the cost center I name, read its signals and score, explain in two or three sentences what is wrong, and add one action with a concrete plan, an owner and a due date. The owner is the person who can fix it — the budget owner or the finance partner.', '针对我说的部门，读它的信号和评分，用两三句话说明问题在哪，然后加一条措施，写清具体计划、负责人和截止日期。负责人是能解决问题的人——预算负责人或财务 BP。')),
      prompt('chase-actions', loc('Which budget actions are overdue?', '哪些预算措施已经超期'),
        skillBody('List open actions past their due date with their owner and cost center, and say whether that cost center’s score has moved since the action was opened. Do not change anything.', '列出超过截止日期仍未完成的措施、负责人和对应部门，并说明措施开出以后这个部门的评分有没有变化。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reviews',
    slug: slug('reviews'),
    name: 'Budget Reviews',
    localizedName: loc('Budget Reviews', '预算周报'),
    description: 'The Monday budget review an agent writes from the records above: the projected overrun, open purchase orders, which cost centers are at risk and why, which forecasts are stale.',
    localizedDescription: loc('The Monday budget review an agent writes from the records above: the projected overrun, open purchase orders, which cost centers are at risk and why, which forecasts are stale.', 'Agent 每周一根据以上记录写的预算周报：全年预计超支多少、未付采购单多少、哪些部门有风险以及原因、哪些预测已经过期。'),
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
      field('projected-overrun', 'Projected overrun ($)', '全年预计超支（美元）', 'number'),
      field('committed-total', 'Open purchase orders ($)', '未付采购单（美元）', 'number'),
      field('on-track-count', 'On track', '正常部门', 'number'),
      field('at-risk-count', 'At risk', '有风险部门', 'number'),
      field('forecast-stale-count', 'Forecasts stale', '预测过期部门', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('body', 'Review', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every budget review, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-end', 'projected-overrun', 'headline'] } },
    ],
    agentPrompts: [
      prompt('write-review', loc('Write this Monday’s budget review', '写本周一的预算周报'),
        skillBody('Write the budget review for last Monday to Sunday from the cost centers, signals and actions: a one-line headline, the projected overrun, open purchase orders, how many cost centers are on track, every at-risk cost center with what is wrong and the action, every forecast older than 30 days, and what changed since last week. Save it as a draft.', '根据部门、信号和措施，写上周一到周日的预算周报：一句话结论、全年预计超支、未付采购单、正常部门数、每个有风险部门的问题和对应措施、超过 30 天没更新的预测、与上周相比的变化。保存为草稿。')),
      prompt('compare-weeks', loc('What got better or worse since last week?', '和上周比哪些变好了、哪些变差了'),
        skillBody('Compare the two latest reviews and the signals between them: the projected overrun, open purchase orders, which cost centers changed status, and which actions closed. Do not change anything.', '对比最近两份周报和期间的信号：全年预计超支、未付采购单、哪些部门换了状态、哪些措施完成了。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the
// AirApp's own prompts, and the guide dialog lists them.
const folderPrompts = [
  prompt('ask-overrun', loc('Which cost centers are heading over budget, and by how much?', '哪些部门预计超支，超多少'),
    skillBody('Answer as the CFO: the projected overrun for the year, open purchase orders and how many cost centers are on track, then every at-risk cost center, lowest score first, with how far its forecast runs over budget, the measure that hurt most, and the open action. Then every forecast older than 30 days. Keep it to one screen. Do not change anything.', '以 CFO 的口吻回答：先说全年预计超支多少、未付采购单多少、多少部门正常，再按评分从低到高列出每个有风险的部门，附预测超出预算多少、拉低最多的指标和对应措施；然后列出超过 30 天没更新的预测。控制在一屏以内。不要修改任何记录。'), 'read-only'),
  prompt('weekly-scan', loc('Run this week’s budget scan', '跑本周预算扫描'),
    skillBody('For each cost center, read spend against the year-to-date budget, the full-year forecast, heads against plan, open POs without a budget line and renewals coming up from their sources, write a signal for anything that moved, re-score it by the skill’s rule, propose an action for any cost center newly at risk, and then write this week’s budget review as a draft.', '为每个部门从数据来源读取实际对比年初至今预算、全年预测、编制对比计划、无预算科目的采购单和即将到期的续费，有变动的写一条信号，按 Skill 的规则重新打分，新变成有风险的提一条措施，最后写一份本周预算周报草稿。')),
  prompt('write-review', loc('Write this Monday’s budget review', '写本周一的预算周报'),
    skillBody('Write the budget review for last Monday to Sunday: a one-line headline, the projected overrun, open purchase orders, how many cost centers are on track, every at-risk cost center with what is wrong and the action, every forecast older than 30 days, and what changed since last week.', '写上周一到周日的预算周报：一句话结论、全年预计超支、未付采购单、正常部门数、每个有风险部门的问题和对应措施、超过 30 天没更新的预测、与上周相比的变化。')),
  prompt('renewals-due', loc('Which renewals need a decision before notice periods close?', '哪些续费合同要在通知期结束前做决定'),
    skillBody('List every cost center with renewals in the next 60 days and no decision, most first: what renews, roughly how much, and who has to decide. Do not change anything.', '列出 60 天内有续费合同且还没决定的部门，数量多的排前面：什么合同到期、大约多少钱、谁来做决定。不要修改任何记录。'), 'read-only'),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'Budget Desk',
  title: loc('Budget Desk', '部门预算执行'),
  description: 'Agents read the ledger, the forecast, headcount, purchase orders and contract renewals for every cost center, score each one by one rule, and flag the departments heading over budget while there is still time to act.',
  localizedDescription: loc(
    'Agents read the ledger, the forecast, headcount, purchase orders and contract renewals for every cost center, score each one by one rule, and flag the departments heading over budget while there is still time to act.',
    'Agent 读取每个部门的总账实际数、全年预测、编制、采购单和续费合同，按同一条规则打分，在还来得及调整的时候标出预计超支的部门。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#0f766e' },
  asOf: '2026-11-16',
  // A cost center whose full-year forecast has not been refreshed in this many
  // days needs attention whatever its score.
  forecastWindowDays: 30,
  folder: { name: 'Budget Desk', slug: APP, description: 'Every cost center’s budget, scored the same way and kept current by agents from the general ledger, the forecast model, the HRIS, the procurement system and the contract register, with the actions that bring the ones heading over back in line.' },
  airApp: { name: 'Budget Desk', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // sort, so a desk with years of signals still opens on the current rows.
  sources: [
    { key: 'departments', base: 'departments', limit: 50, sort: { fieldSlug: 'forecast-on', fieldType: 'date', direction: 'desc' } },
    { key: 'signals', base: 'signals', limit: 50, sort: { fieldSlug: 'recorded-on', fieldType: 'date', direction: 'desc' } },
    { key: 'actions', base: 'actions', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' } },
    { key: 'reviews', base: 'reviews', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow.' },
  ui: {
    summary: loc('Every cost center, one score, while there is time to act', '每个部门一个评分，趁还来得及调整'),
    detail_modes: { departments: 'page', signals: 'drawer', actions: 'split', reviews: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skill in this folder; each agent writes only the measure it reads from its own source. People own budgets and budget transfers, purchase approvals, hiring, contract renewals, and anything paid out.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；每个 Agent 只写它从自己的数据来源读到的指标。预算和预算调拨、采购审批、招聘、合同续签，以及任何付款，都由人来定。',
  ),
};
