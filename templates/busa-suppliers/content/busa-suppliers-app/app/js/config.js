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
  `Read the \`busa-suppliers\` skill in this folder and follow it. ${en}`,
  `先阅读本文件夹里的 \`busa-suppliers\` Skill，按它的规则做。${zh}`,
);

const APP = 'busa-suppliers';
const slug = (key) => `${APP}-${key}`;

// One rating per supplier. The rule that sets it is in SKILL.md and
// model.js#ratingFor: five measures, twenty points each.
const RATING = choices(
  ['preferred', 'Preferred', '优选', 'positive'],
  ['watch', 'Watch', '关注', 'warning'],
  ['at-risk', 'At risk', '有风险', 'danger'],
);

const bases = [
  {
    key: 'suppliers',
    slug: slug('suppliers'),
    name: 'Suppliers',
    localizedName: loc('Suppliers', '供应商'),
    description: 'Every supplier with its annual spend, contract end, the five measures behind its score, and the score itself.',
    localizedDescription: loc('Every supplier with its annual spend, contract end, the five measures behind its score, and the score itself.', '每家供应商：年采购额、合同到期日、评分背后的五项指标，以及评分本身。'),
    readLimit: 50,
    primary: 'name',
    status: 'rating',
    fields: [
      field('name', 'Supplier', '供应商', 'text', {}, true),
      field('category', 'Category', '品类', 'select', choices(
        ['green-coffee', 'Green coffee', '咖啡生豆', 'accent'],
        ['dairy', 'Dairy & oat', '乳品与燕麦奶', 'neutral'],
        ['packaging', 'Packaging', '包材', 'neutral'],
        ['food', 'Food', '食品与原料', 'neutral'],
        ['equipment', 'Equipment', '设备与维修', 'neutral'],
        ['logistics', 'Logistics', '物流', 'neutral'],
        ['services', 'Services', '服务', 'neutral'],
      )),
      field('buyer', 'Buyer', '采购负责人', 'text'),
      field('annual-spend', 'Annual spend (USD)', '年采购额（美元）', 'number'),
      field('contract', 'Contract', '合同', 'text'),
      field('contract-end', 'Contract ends', '合同到期', 'date'),
      field('on-time-pct', 'On-time deliveries, last 90 days (%)', '近 90 天准时交付率（%）', 'number'),
      field('defect-pct', 'Rejected at inspection, last 90 days (%)', '近 90 天来料不良率（%）', 'number'),
      field('price-variance-pct', 'Invoiced price vs. contract (%)', '发票单价比合同价（%）', 'number'),
      field('invoice-match-pct', 'Invoices matched first time (%)', '发票一次匹配率（%）', 'number'),
      field('response-days', 'Days to answer an issue', '问题响应天数', 'number'),
      field('score', 'Supplier score', '供应商评分', 'number'),
      field('rating', 'Rating', '评级', 'select', RATING),
      field('backup', 'Backup supplier', '备选供应商', 'text'),
      field('scored-by', 'Last scored by', '最近评分者', 'text'),
      field('scored-on', 'Last scored', '最近评分', 'date'),
      field('summary', 'Latest word', '最新情况', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All suppliers', description: 'Every supplier with its rating and contract end', type: 'table', config: { filters: [], sorts: [], visibleFieldSlugs: ['name', 'category', 'buyer', 'annual-spend', 'contract-end', 'score', 'rating'] } },
      { slug: 'at-risk', name: 'At risk', description: 'Suppliers rated at risk', type: 'table', config: { filters: [{ fieldSlug: 'rating', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['name', 'buyer', 'annual-spend', 'contract-end', 'score', 'summary'] } },
    ],
    agentPrompts: [
      prompt('rescore', loc('Re-score this supplier from its latest measures', '用最新指标给这家供应商重新打分'),
        skillBody('For the supplier I name, read its five measures, compute the score and rating by the skill’s rule, and update `score`, `rating`, `scored-by`, `scored-on` and a one-sentence `summary`. Propose an action if it turned at risk and has none open.', '针对我说的供应商，读它的五项指标，按 Skill 的规则算评分和评级，更新 `score`、`rating`、`scored-by`、`scored-on` 和一句话的 `summary`。如果变成有风险且没有进行中的改进措施，提一条。')),
      prompt('supplier-brief', loc('Brief me on this supplier before a negotiation', '谈判前给我讲讲这家供应商'),
        skillBody('For the supplier I name, give a one-screen brief: annual spend, contract end, the score with each of its five parts, the last five signals and who wrote them, open actions, the backup supplier, and two points worth raising. Do not change anything.', '针对我说的供应商，给一屏简报：年采购额、合同到期日、评分及五项得分、最近五条信号及写入者、进行中的改进措施、备选供应商，以及谈判中值得提的两点。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'signals',
    slug: slug('signals'),
    name: 'Signals',
    localizedName: loc('Signals', '信号'),
    description: 'One row every time a supplier’s measure moves — deliveries, inspection, price, invoices, response — or there is risk news, with the evidence and which agent or person wrote it.',
    localizedDescription: loc('One row every time a supplier’s measure moves — deliveries, inspection, price, invoices, response — or there is risk news, with the evidence and which agent or person wrote it.', '供应商的交付、质检、价格、发票或响应指标每变动一次、或出现风险消息时记一行：依据，以及是哪个 Agent 或哪个人写的。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Signal', '信号', 'text', {}, true),
      field('supplier', 'Supplier', '供应商', 'relation', relation(slug('suppliers'))),
      field('kind', 'Kind', '类型', 'select', choices(
        ['delivery', 'Delivery', '交付', 'accent'],
        ['quality', 'Quality', '质量', 'neutral'],
        ['price', 'Price', '价格', 'neutral'],
        ['invoice', 'Invoice', '发票', 'neutral'],
        ['response', 'Response', '响应', 'neutral'],
        ['risk', 'Risk news', '风险消息', 'warning'],
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
      { slug: 'latest', name: 'Latest first', description: 'Every signal, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'supplier', 'kind', 'recorded-on', 'written-by'] } },
      { slug: 'risk', name: 'Risk news', description: 'Single sources, capacity warnings, disruptions', type: 'table', config: { filters: [{ fieldSlug: 'kind', operator: 'equals', value: 'risk' }], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'supplier', 'recorded-on', 'written-by'] } },
    ],
    agentPrompts: [
      prompt('log-signal', loc('Log what I just heard from a supplier', '记下我刚从供应商那里听到的情况'),
        skillBody('Record what I tell you about the supplier I name as one signal: the kind, today’s date, me as the writer and the evidence in my words. If it changes one of the five measures, update that field and re-score the supplier.', '把我说的关于某家供应商的情况记成一条信号：类型、今天的日期、写入者是我、依据用我的原话。如果它改变了五项指标之一，更新那个字段并给供应商重新打分。')),
      prompt('what-moved', loc('What moved this week, and who wrote it?', '这周哪些信号变了，是谁写的'),
        skillBody('Summarise the signals of the last seven days by supplier, worst supplier first: what moved, by how much, and which agent or person wrote each one. Do not change anything.', '按供应商汇总最近七天的信号，最差的排前面：变了什么、变了多少、每条是哪个 Agent 或哪个人写的。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'actions',
    slug: slug('actions'),
    name: 'Supplier Actions',
    localizedName: loc('Supplier Actions', '改进措施'),
    description: 'What we will do about a supplier that is slipping: the cause, the plan, an owner and a date.',
    localizedDescription: loc('What we will do about a supplier that is slipping: the cause, the plan, an owner and a date.', '针对正在下滑的供应商要做什么：原因、计划、负责人和日期。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Action', '改进措施', 'text', {}, true),
      field('supplier', 'Supplier', '供应商', 'relation', relation(slug('suppliers'))),
      field('status', 'Status', '状态', 'select', choices(
        ['open', 'Open', '待开始', 'warning'],
        ['in-progress', 'In progress', '进行中', 'accent'],
        ['done', 'Done', '已完成', 'positive'],
        ['dropped', 'Dropped', '已放弃', 'neutral'],
      )),
      field('owner', 'Owner', '负责人', 'text'),
      field('due-date', 'Due', '截止', 'date'),
      field('proposed-by', 'Proposed by', '提出者', 'text'),
      field('cause', 'Why it is slipping', '下滑原因', 'longtext'),
      field('plan', 'What we will do', '应对计划', 'longtext'),
    ],
    views: [
      { slug: 'by-due', name: 'By due date', description: 'Every action, soonest due first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'supplier', 'status', 'owner', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('propose-action', loc('Propose an action for an at-risk supplier', '为一家有风险的供应商提出改进措施'),
        skillBody('For the supplier I name, read its signals and score, explain in two or three sentences why it is slipping, and add one action with a concrete plan, an owner and a due date before its contract ends. The owner is the supplier’s buyer unless I say otherwise.', '针对我说的供应商，读它的信号和评分，用两三句话说明为什么在下滑，然后加一条改进措施，写清具体计划、负责人和合同到期前的截止日期。负责人默认是这家供应商的采购负责人，除非我另有指定。')),
      prompt('chase-actions', loc('Which supplier actions are overdue?', '哪些改进措施已经超期'),
        skillBody('List open actions past their due date with their owner and supplier, and say whether that supplier’s score has moved since the action was opened. Do not change anything.', '列出超过截止日期仍未完成的改进措施、负责人和对应供应商，并说明措施开出以后这家供应商的评分有没有变化。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reviews',
    slug: slug('reviews'),
    name: 'Procurement Reviews',
    localizedName: loc('Procurement Reviews', '采购周报'),
    description: 'The Monday procurement review an agent writes from the records above: spend at risk, every red supplier, every contract coming up.',
    localizedDescription: loc('The Monday procurement review an agent writes from the records above: spend at risk, every red supplier, every contract coming up.', 'Agent 每周一根据以上记录写的采购周报：有风险的采购额、每家红灯供应商、每份临近到期的合同。'),
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
      field('spend-at-risk', 'Spend at risk (USD)', '有风险的采购额（美元）', 'number'),
      field('at-risk-count', 'Suppliers at risk', '有风险的供应商数', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('body', 'Review', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every procurement review, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-end', 'spend-at-risk', 'headline'] } },
    ],
    agentPrompts: [
      prompt('write-review', loc('Write this Monday’s procurement review', '写本周一的采购周报'),
        skillBody('Write the procurement review for last Monday to Sunday from the suppliers, signals and actions: a one-line headline, spend at risk and how it changed, every at-risk supplier with its cause and action, watch suppliers whose contract ends in the next 90 days, and what changed since last week. Save it as a draft.', '根据供应商、信号和改进措施，写上周一到周日的采购周报：一句话结论、有风险的采购额及变化、每家有风险供应商的原因和改进措施、未来 90 天内合同到期的关注供应商、与上周相比的变化。保存为草稿。')),
      prompt('compare-weeks', loc('What got better or worse since last week?', '和上周比哪些变好了、哪些变差了'),
        skillBody('Compare the two latest reviews and the signals between them: which suppliers changed rating, how spend at risk moved, and which actions closed. Do not change anything.', '对比最近两份周报和期间的信号：哪些供应商换了评级、有风险的采购额怎么变、哪些改进措施完成了。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the
// AirApp's own prompts, and the guide dialog lists them.
const folderPrompts = [
  prompt('ask-risk', loc('Which suppliers put our supply at risk, and how much spend is exposed?', '哪些供应商会影响供货，涉及多少采购额'),
    skillBody('Answer as the head of procurement: total annual spend with at-risk suppliers, then every at-risk supplier, soonest contract end first, with its score, the measure that hurt it most, whether it has a backup, and the open action. Then watch suppliers whose contract ends in the next 90 days. Keep it to one screen. Do not change anything.', '以采购负责人的口吻回答：先说有风险供应商的年采购额总数，再按合同到期日从近到远列出每家有风险的供应商，附评分、拉低最多的指标、有没有备选供应商和对应的改进措施；然后列出未来 90 天内合同到期的关注供应商。控制在一屏以内。不要修改任何记录。'), 'read-only'),
  prompt('weekly-scan', loc('Run this week’s supplier scan', '跑本周供应商扫描'),
    skillBody('For each supplier, read deliveries, inspection results, invoiced prices, invoice matching and response times from their sources, write a signal for anything that moved, re-score it by the skill’s rule, propose an action for anything newly at risk, and then write this week’s procurement review as a draft.', '为每家供应商从数据来源读取交付、质检、发票单价、发票匹配和响应时间，有变动的写一条信号，按 Skill 的规则重新打分，新变成有风险的提一条改进措施，最后写一份本周采购周报草稿。')),
  prompt('write-review', loc('Write this Monday’s procurement review', '写本周一的采购周报'),
    skillBody('Write the procurement review for last Monday to Sunday: a one-line headline, spend at risk, every at-risk supplier with its cause and action, watch suppliers whose contract ends in the next 90 days, and what changed since last week.', '写上周一到周日的采购周报：一句话结论、有风险的采购额、每家有风险供应商的原因和改进措施、未来 90 天内合同到期的关注供应商、与上周相比的变化。')),
  prompt('contracts', loc('Which contracts ending in the next 90 days need a decision?', '未来 90 天到期的合同里哪些要做决定'),
    skillBody('List every supplier whose contract ends in the next 90 days, soonest first, with its annual spend, score and rating; for each, say renew, renegotiate or re-source, and why, in one line. Do not change anything.', '按日期列出未来 90 天内合同到期的所有供应商，附年采购额、评分和评级；每家用一句话说明建议续约、重新谈判还是换供应商，以及理由。不要修改任何记录。'), 'read-only'),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'Supplier Scorecard',
  title: loc('Supplier Scorecard', '采购与供应商'),
  description: 'Agents read deliveries, inspections, prices, invoices and response times for every supplier, score each one by one rule, and flag the spend at risk before contracts come up.',
  localizedDescription: loc(
    'Agents read deliveries, inspections, prices, invoices and response times for every supplier, score each one by one rule, and flag the spend at risk before contracts come up.',
    'Agent 读取每家供应商的交付、质检、价格、发票和响应时间，按同一条规则打分，在合同到期前就标出有风险的采购额。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#4553c4' },
  asOf: '2026-11-05',
  // A contract ending inside this many days is "coming up": a watch supplier
  // inside it needs a decision, and the overview counts it.
  contractWindowDays: 90,
  folder: { name: 'Supplier Scorecard', slug: APP, description: 'Every supplier scored the same way, kept current by agents from deliveries, inspections, prices, invoices and response times, with the spend at risk and the actions to fix it.' },
  airApp: { name: 'Supplier Scorecard', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // sort, so a desk with years of signals still opens on the current rows.
  sources: [
    { key: 'suppliers', base: 'suppliers', limit: 50 },
    { key: 'signals', base: 'signals', limit: 50, sort: { fieldSlug: 'recorded-on', fieldType: 'date', direction: 'desc' } },
    { key: 'actions', base: 'actions', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' } },
    { key: 'reviews', base: 'reviews', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow.' },
  ui: {
    summary: loc('Every supplier, one score, the spend at risk', '每家供应商一个评分，供货风险一眼看清'),
    detail_modes: { suppliers: 'page', signals: 'drawer', actions: 'split', reviews: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skill in this folder; each agent writes only the measure it reads from its own source, and people own contracts, prices and the choice of supplier.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；每个 Agent 只写它从自己的数据来源读到的指标，合同、价格和选哪家供应商由人来定。',
  ),
};
