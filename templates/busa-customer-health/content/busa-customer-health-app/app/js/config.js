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
  `Read the \`busa-customer-health\` skill in this folder and follow it. ${en}`,
  `先阅读本文件夹里的 \`busa-customer-health\` Skill，按它的规则做。${zh}`,
);

const APP = 'busa-customer-health';
const slug = (key) => `${APP}-${key}`;

// One light per account. The rule that sets it is in SKILL.md and
// model.js#healthFor: five signals, twenty points each.
const HEALTH = choices(
  ['healthy', 'Healthy', '健康', 'positive'],
  ['watch', 'Watch', '关注', 'warning'],
  ['at-risk', 'At risk', '有流失风险', 'danger'],
);

const bases = [
  {
    key: 'accounts',
    slug: slug('accounts'),
    name: 'Accounts',
    localizedName: loc('Accounts', '客户'),
    description: 'Every paying customer with its revenue, renewal date, the five signals behind its health score, and the score itself.',
    localizedDescription: loc('Every paying customer with its revenue, renewal date, the five signals behind its health score, and the score itself.', '每个付费客户：年收入、续费日期、健康分背后的五个信号，以及健康分本身。'),
    readLimit: 50,
    primary: 'name',
    status: 'health',
    fields: [
      field('name', 'Account', '客户', 'text', {}, true),
      field('segment', 'Segment', '客户分层', 'select', choices(
        ['enterprise', 'Enterprise', '大客户', 'accent'],
        ['mid-market', 'Mid-market', '中型客户', 'neutral'],
        ['smb', 'Small business', '小微客户', 'neutral'],
      )),
      field('csm', 'Customer success manager', '客户成功经理', 'text'),
      field('arr', 'ARR (USD)', '年收入（美元）', 'number'),
      field('plan', 'Plan', '套餐', 'text'),
      field('renewal-date', 'Renewal date', '续费日期', 'date'),
      field('seats-licensed', 'Seats paid for', '购买席位', 'number'),
      field('seats-active', 'Active seats (last 30 days)', '活跃席位（近 30 天）', 'number'),
      field('seats-active-prior', 'Active seats (30 days before)', '活跃席位（再往前 30 天）', 'number'),
      field('urgent-tickets', 'Open urgent tickets', '未解决的紧急工单', 'number'),
      field('nps', 'Latest NPS answer (0–10)', '最近一次 NPS 打分（0–10）', 'number'),
      field('days-overdue', 'Invoice days overdue', '账单逾期天数', 'number'),
      field('health-score', 'Health score', '健康分', 'number'),
      field('health', 'Health', '健康状态', 'select', HEALTH),
      field('champion', 'Champion', '对接人', 'text'),
      field('scored-by', 'Last scored by', '最近评分者', 'text'),
      field('scored-on', 'Last scored', '最近评分', 'date'),
      field('summary', 'Latest word', '最新情况', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All accounts', description: 'Every account with its health and renewal', type: 'table', config: { filters: [], sorts: [], visibleFieldSlugs: ['name', 'segment', 'csm', 'arr', 'renewal-date', 'health-score', 'health'] } },
      { slug: 'at-risk', name: 'At risk', description: 'Accounts whose health is at risk', type: 'table', config: { filters: [{ fieldSlug: 'health', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['name', 'csm', 'arr', 'renewal-date', 'health-score', 'summary'] } },
    ],
    agentPrompts: [
      prompt('rescore', loc('Re-score this account from its latest signals', '用最新信号给这个客户重新打分'),
        skillBody('For the account I name, read its five signal fields, compute the health score and light by the skill’s rule, and update `health-score`, `health`, `scored-by`, `scored-on` and a one-sentence `summary`. Open a save play if it turned at risk and has none.', '针对我说的客户，读它的五个信号字段，按 Skill 的规则算健康分和状态，更新 `health-score`、`health`、`scored-by`、`scored-on` 和一句话的 `summary`。如果变成有流失风险且还没有挽留动作，开一条。')),
      prompt('account-brief', loc('Brief me on this account before a call', '通话前给我讲讲这个客户'),
        skillBody('For the account I name, give a one-screen brief: revenue, renewal date, the score with each of its five parts, the last five signals and who wrote them, open save plays, and two questions worth asking on the call. Do not change anything.', '针对我说的客户，给一屏简报：年收入、续费日期、健康分及五项得分、最近五条信号及写入者、未完成的挽留动作，以及通话里值得问的两个问题。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'signals',
    slug: slug('signals'),
    name: 'Signals',
    localizedName: loc('Signals', '信号'),
    description: 'One row every time something about an account moves — usage, urgent tickets, NPS, billing or the relationship — with the evidence and which agent or person wrote it.',
    localizedDescription: loc('One row every time something about an account moves — usage, urgent tickets, NPS, billing or the relationship — with the evidence and which agent or person wrote it.', '客户的用量、紧急工单、NPS、账单或关系每变动一次记一行：依据，以及是哪个 Agent 或哪个人写的。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Signal', '信号', 'text', {}, true),
      field('account', 'Account', '客户', 'relation', relation(slug('accounts'))),
      field('kind', 'Kind', '类型', 'select', choices(
        ['usage', 'Usage', '用量', 'accent'],
        ['support', 'Support', '工单', 'neutral'],
        ['sentiment', 'Sentiment', '满意度', 'neutral'],
        ['billing', 'Billing', '账单', 'neutral'],
        ['relationship', 'Relationship', '关系', 'warning'],
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
      { slug: 'latest', name: 'Latest first', description: 'Every signal, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'account', 'kind', 'recorded-on', 'written-by'] } },
      { slug: 'relationship', name: 'Relationship changes', description: 'Champions leaving, sponsors changing, escalations', type: 'table', config: { filters: [{ fieldSlug: 'kind', operator: 'equals', value: 'relationship' }], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'account', 'recorded-on', 'written-by'] } },
    ],
    agentPrompts: [
      prompt('log-signal', loc('Log what I just heard from a customer', '记下我刚从客户那里听到的情况'),
        skillBody('Record what I tell you about the account I name as one signal: the kind, today’s date, me as the writer and the evidence in my words. If it changes one of the five signal fields, update that field and re-score the account.', '把我说的关于某个客户的情况记成一条信号：类型、今天的日期、写入者是我、依据用我的原话。如果它改变了五个信号字段之一，更新那个字段并给客户重新打分。')),
      prompt('what-moved', loc('What moved this week, and who wrote it?', '这周哪些信号变了，是谁写的'),
        skillBody('Summarise the signals of the last seven days by account, worst account first: what moved, by how much, and which agent or person wrote each one. Do not change anything.', '按客户汇总最近七天的信号，最差的客户排前面：变了什么、变了多少、每条是哪个 Agent 或哪个人写的。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'plays',
    slug: slug('plays'),
    name: 'Save Plays',
    localizedName: loc('Save Plays', '挽留动作'),
    description: 'What we will do about an account that is slipping: why it is slipping, the plan, an owner and a date.',
    localizedDescription: loc('What we will do about an account that is slipping: why it is slipping, the plan, an owner and a date.', '针对正在下滑的客户要做什么：下滑原因、计划、负责人和日期。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Play', '挽留动作', 'text', {}, true),
      field('account', 'Account', '客户', 'relation', relation(slug('accounts'))),
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
      { slug: 'by-due', name: 'By due date', description: 'Every save play, soonest due first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'account', 'status', 'owner', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('propose-play', loc('Propose a save play for an at-risk account', '为一个有流失风险的客户提出挽留方案'),
        skillBody('For the account I name, read its signals and score, explain in two or three sentences why it is slipping, and add one save play with a concrete plan, an owner and a due date before its renewal. The owner is the account’s customer success manager unless I say otherwise.', '针对我说的客户，读它的信号和健康分，用两三句话说明为什么在下滑，然后加一条挽留动作，写清具体计划、负责人和续费前的截止日期。负责人默认是该客户的客户成功经理，除非我另有指定。')),
      prompt('chase-plays', loc('Which save plays are overdue?', '哪些挽留动作已经超期'),
        skillBody('List open save plays past their due date with their owner and account, and say whether that account’s score has moved since the play was opened. Do not change anything.', '列出超过截止日期仍未完成的挽留动作、负责人和对应客户，并说明动作开出以后这个客户的健康分有没有变化。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reviews',
    slug: slug('reviews'),
    name: 'Retention Reviews',
    localizedName: loc('Retention Reviews', '留存周报'),
    description: 'The Monday retention review an agent writes from the records above: revenue at risk, every red account, every renewal coming up.',
    localizedDescription: loc('The Monday retention review an agent writes from the records above: revenue at risk, every red account, every renewal coming up.', 'Agent 每周一根据以上记录写的留存周报：有风险的年收入、每个红灯客户、每个临近的续费。'),
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
      field('arr-at-risk', 'ARR at risk (USD)', '有风险的年收入（美元）', 'number'),
      field('at-risk-count', 'Accounts at risk', '有风险的客户数', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('body', 'Review', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every retention review, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-end', 'arr-at-risk', 'headline'] } },
    ],
    agentPrompts: [
      prompt('write-review', loc('Write this Monday’s retention review', '写本周一的留存周报'),
        skillBody('Write the retention review for last Monday to Sunday from the accounts, signals and save plays: a one-line headline, ARR at risk and how it changed, every at-risk account with its cause and play, watch accounts renewing in the next 90 days, and what changed since last week. Save it as a draft.', '根据客户、信号和挽留动作，写上周一到周日的留存周报：一句话结论、有风险的年收入及变化、每个有流失风险客户的原因和挽留动作、未来 90 天内续费的关注客户、与上周相比的变化。保存为草稿。')),
      prompt('compare-weeks', loc('What got better or worse since last week?', '和上周比哪些变好了、哪些变差了'),
        skillBody('Compare the two latest reviews and the signals between them: which accounts changed light, how ARR at risk moved, and which save plays closed. Do not change anything.', '对比最近两份周报和期间的信号：哪些客户换了灯、有风险的年收入怎么变、哪些挽留动作完成了。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the
// AirApp's own prompts, and the guide dialog lists them.
const folderPrompts = [
  prompt('ask-churn', loc('Which customers might churn, and how much revenue is at risk?', '哪些客户可能流失，涉及多少年收入'),
    skillBody('Answer as the head of customer success: total ARR at risk, then every at-risk account, soonest renewal first, with its score, the signal that hurt it most, and the open save play. Then watch accounts renewing in the next 90 days. Keep it to one screen. Do not change anything.', '以客户成功负责人的口吻回答：先说有风险的年收入总额，再按续费日期从近到远列出每个有流失风险的客户，附健康分、拉低最多的信号和对应的挽留动作；然后列出未来 90 天内续费的关注客户。控制在一屏以内。不要修改任何记录。'), 'read-only'),
  prompt('weekly-scan', loc('Run this week’s health scan for every account', '为所有客户跑本周健康扫描'),
    skillBody('For each account, read its usage, urgent tickets, latest NPS answer and invoice status from their sources, write a signal for anything that moved, re-score it by the skill’s rule, open a save play for anything newly at risk, and then write this week’s retention review as a draft.', '为每个客户从数据来源读取用量、紧急工单、最近一次 NPS 和账单状态，有变动的写一条信号，按 Skill 的规则重新打分，新变成有流失风险的开一条挽留动作，最后写一份本周留存周报草稿。')),
  prompt('write-review', loc('Write this Monday’s retention review', '写本周一的留存周报'),
    skillBody('Write the retention review for last Monday to Sunday: a one-line headline, ARR at risk, every at-risk account with its cause and play, watch accounts renewing in the next 90 days, and what changed since last week.', '写上周一到周日的留存周报：一句话结论、有风险的年收入、每个有流失风险客户的原因和挽留动作、未来 90 天内续费的关注客户、与上周相比的变化。')),
  prompt('renewals', loc('Which renewals in the next 90 days need help?', '未来 90 天的续费里哪些需要帮忙'),
    skillBody('List every account renewing in the next 90 days, soonest first, with its ARR, score and light; for each that is not healthy, say what would most improve its score and whether a save play exists. Do not change anything.', '按日期列出未来 90 天内续费的所有客户，附年收入、健康分和状态；对不健康的客户，说明最能提高健康分的是哪一项，以及是否已有挽留动作。不要修改任何记录。'), 'read-only'),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'Customer Health',
  title: loc('Customer Health', '客户健康与流失预警'),
  description: 'Agents read usage, support, NPS and billing for every customer, score each account’s health by one rule, and flag the revenue at risk months before renewal.',
  localizedDescription: loc(
    'Agents read usage, support, NPS and billing for every customer, score each account’s health by one rule, and flag the revenue at risk months before renewal.',
    'Agent 读取每个客户的用量、工单、NPS 和账单，按同一条规则给客户打健康分，在续费前几个月就标出有流失风险的年收入。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#0f7b6c' },
  asOf: '2026-11-05',
  // A renewal inside this many days is "coming up": a watch account renewing
  // inside it needs a look, and the overview counts it.
  renewalWindowDays: 90,
  folder: { name: 'Customer Health', slug: APP, description: 'Every customer’s health score, kept current by agents from usage, support, NPS and billing, with the revenue at risk and the plays to save it.' },
  airApp: { name: 'Customer Health', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // sort, so a desk with years of signals still opens on the current rows.
  sources: [
    { key: 'accounts', base: 'accounts', limit: 50 },
    { key: 'signals', base: 'signals', limit: 50, sort: { fieldSlug: 'recorded-on', fieldType: 'date', direction: 'desc' } },
    { key: 'plays', base: 'plays', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' } },
    { key: 'reviews', base: 'reviews', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow.' },
  ui: {
    summary: loc('Every customer, one score, the revenue at risk', '每个客户一个健康分，流失风险一眼看清'),
    detail_modes: { accounts: 'page', signals: 'drawer', plays: 'split', reviews: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skill in this folder; each agent writes only the signals it reads from its own source, and people own the accounts’ commercial terms.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；每个 Agent 只写它从自己的数据来源读到的信号，客户的合同条款由人来管。',
  ),
};
