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
  `Read the \`busa-client-delivery\` skill in this folder and follow it. ${en}`,
  `先阅读本文件夹里的 \`busa-client-delivery\` Skill，按它的规则做。${zh}`,
);

const APP = 'busa-client-delivery';
const slug = (key) => `${APP}-${key}`;

// One status per project. The rule that sets it is in SKILL.md and
// model.js#statusFor: five measures, twenty points each.
const STATUS = choices(
  ['on-track', 'On track', '正常', 'positive'],
  ['watch', 'Watch', '关注', 'warning'],
  ['at-risk', 'At risk', '有风险', 'danger'],
);

const bases = [
  {
    key: 'projects',
    slug: slug('projects'),
    name: 'Client Projects',
    localizedName: loc('Client Projects', '客户项目'),
    description: 'Every client project in delivery: the client, service line, account lead, project manager, contract value, the date of the last client check-in, the five measures behind its score, and the score itself.',
    localizedDescription: loc('Every client project in delivery: the client, service line, account lead, project manager, contract value, the date of the last client check-in, the five measures behind its score, and the score itself.', '正在交付的每一个客户项目：客户、服务线、客户负责人、项目经理、合同额、最近一次客户沟通日期、项目评分背后的五项指标，以及评分本身。'),
    readLimit: 50,
    primary: 'name',
    status: 'status',
    fields: [
      field('name', 'Project', '项目', 'text', {}, true),
      field('client', 'Client', '客户', 'text'),
      field('service', 'Service line', '服务线', 'select', choices(
        ['web', 'Website', '网站', 'accent'],
        ['product', 'Product', '产品', 'neutral'],
        ['brand', 'Brand', '品牌', 'neutral'],
        ['campaign', 'Campaign', '营销活动', 'neutral'],
      )),
      field('account-lead', 'Account lead', '客户负责人', 'text'),
      field('project-manager', 'Project manager', '项目经理', 'text'),
      field('contract-value', 'Contract value ($)', '合同额（美元）', 'number'),
      field('checked-in-on', 'Last client check-in', '最近一次客户沟通', 'date'),
      field('budget-used-pct', 'Budget used (%)', '预算已用（%）', 'number'),
      field('complete-pct', 'Work complete (%)', '工作完成度（%）', 'number'),
      field('burn-gap', 'Budget ahead of work (points)', '预算超前完成度（百分点）', 'number'),
      field('slip-days', 'Next milestone, days late', '下一个里程碑延期天数', 'number'),
      field('wip-days', 'Oldest unbilled work (days)', '最早一笔未开票工作（天）', 'number'),
      field('unbilled', 'Unbilled work ($)', '未开票金额（美元）', 'number'),
      field('unsigned-changes', 'Scope changes not signed', '未签字的范围变更', 'number'),
      field('client-pulse', 'Client pulse, last check-in (1–5)', '最近一次客户满意度（1–5）', 'number'),
      field('score', 'Project score', '项目评分', 'number'),
      field('status', 'Status', '状态', 'select', STATUS),
      field('scored-by', 'Last scored by', '最近评分者', 'text'),
      field('scored-on', 'Last scored', '最近评分', 'date'),
      field('summary', 'Latest word', '最新情况', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All projects', description: 'Every project in delivery, with its status', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'checked-in-on', direction: 'desc' }], visibleFieldSlugs: ['name', 'client', 'service', 'account-lead', 'contract-value', 'checked-in-on', 'score', 'status'] } },
      { slug: 'at-risk', name: 'At risk', description: 'Projects whose score is under 50', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['name', 'client', 'account-lead', 'contract-value', 'score', 'summary'] } },
    ],
    agentPrompts: [
      prompt('rescore', loc('Re-score this project from its latest measures', '用最新指标给这个项目重新打分'),
        skillBody('For the project I name, read its five measures, compute the score and status by the skill’s rule, and update `score`, `status`, `scored-by`, `scored-on` and a one-sentence `summary`. Propose an action if it turned at risk and has none open.', '针对我说的项目，读它的五项指标，按 Skill 的规则算评分和状态，更新 `score`、`status`、`scored-by`、`scored-on` 和一句话的 `summary`。如果变成有风险且没有进行中的跟进措施，提一条。')),
      prompt('client-brief', loc('Brief me before I call this client', '给客户打电话之前给我讲讲这个项目'),
        skillBody('For the project I name, give a one-screen brief: client, contract value, budget used against work done, the next milestone, unbilled work, unsigned scope changes, the client pulse and when we last spoke, the last five signals and who wrote them, open actions, and three things to raise on the call. Do not change anything.', '针对我说的项目，给一屏简报：客户、合同额、预算消耗和完成度、下一个里程碑、未开票金额、未签字的范围变更、客户满意度和上次沟通时间、最近五条信号及写入者、进行中的跟进措施，以及这次通话要提的三件事。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'signals',
    slug: slug('signals'),
    name: 'Signals',
    localizedName: loc('Signals', '信号'),
    description: 'One row every time a project’s measure moves — budget burn, schedule, billing, scope, client pulse — or there is something worth knowing, with the evidence and which agent or person wrote it.',
    localizedDescription: loc('One row every time a project’s measure moves — budget burn, schedule, billing, scope, client pulse — or there is something worth knowing, with the evidence and which agent or person wrote it.', '项目的预算消耗、进度、开票、范围或客户满意度每变动一次、或有值得知道的情况时记一行：依据，以及是哪个 Agent 或哪个人写的。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Signal', '信号', 'text', {}, true),
      field('project', 'Project', '项目', 'relation', relation(slug('projects'))),
      field('kind', 'Kind', '类型', 'select', choices(
        ['budget', 'Budget burn', '预算消耗', 'accent'],
        ['schedule', 'Schedule', '进度', 'neutral'],
        ['billing', 'Billing', '开票', 'neutral'],
        ['scope', 'Scope', '范围变更', 'neutral'],
        ['client', 'Client pulse', '客户满意度', 'neutral'],
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
      { slug: 'latest', name: 'Latest first', description: 'Every signal, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'project', 'kind', 'recorded-on', 'written-by'] } },
      { slug: 'notes', name: 'Notes', description: 'What a client said, vendor delays, what an account lead heard', type: 'table', config: { filters: [{ fieldSlug: 'kind', operator: 'equals', value: 'note' }], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'project', 'recorded-on', 'written-by'] } },
    ],
    agentPrompts: [
      prompt('log-signal', loc('Log what I heard from a client', '记下我从客户那里听到的情况'),
        skillBody('Record what I tell you about the project I name as one signal: the kind, today’s date, me as the writer and the evidence in my words. If it changes one of the five measures, update that field and re-score the project.', '把我说的关于某个项目的情况记成一条信号：类型、今天的日期、写入者是我、依据用我的原话。如果它改变了五项指标之一，更新那个字段并重新打分。')),
      prompt('what-moved', loc('What moved this week, and who wrote it?', '这周哪些信号变了，是谁写的'),
        skillBody('Summarise the signals of the last seven days by project, worst first: what moved, by how much, and which agent or person wrote each one. Do not change anything.', '按项目汇总最近七天的信号，最差的排前面：变了什么、变了多少、每条是哪个 Agent 或哪个人写的。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'actions',
    slug: slug('actions'),
    name: 'Delivery Actions',
    localizedName: loc('Delivery Actions', '跟进措施'),
    description: 'What we will do for a project that is slipping or has gone quiet with the client: the cause, the plan, an owner and a date.',
    localizedDescription: loc('What we will do for a project that is slipping or has gone quiet with the client: the cause, the plan, an owner and a date.', '针对下滑或很久没和客户沟通的项目要做什么：原因、计划、负责人和日期。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Action', '跟进措施', 'text', {}, true),
      field('project', 'Project', '项目', 'relation', relation(slug('projects'))),
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
      { slug: 'by-due', name: 'By due date', description: 'Every action, soonest due first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'project', 'status', 'owner', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('propose-action', loc('Propose an action for a project that is slipping', '为一个下滑的项目提出跟进措施'),
        skillBody('For the project I name, read its signals and score, explain in two or three sentences what is wrong, and add one action with a concrete plan, an owner and a due date. The owner is the person who can fix it — the account lead, the project manager or finance.', '针对我说的项目，读它的信号和评分，用两三句话说明问题在哪，然后加一条跟进措施，写清具体计划、负责人和截止日期。负责人是能解决问题的人——客户负责人、项目经理或财务。')),
      prompt('chase-actions', loc('Which delivery actions are overdue?', '哪些跟进措施已经超期'),
        skillBody('List open actions past their due date with their owner and project, and say whether that project’s score has moved since the action was opened. Do not change anything.', '列出超过截止日期仍未完成的跟进措施、负责人和对应项目，并说明措施开出以后这个项目的评分有没有变化。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reviews',
    slug: slug('reviews'),
    name: 'Delivery Reviews',
    localizedName: loc('Delivery Reviews', '交付周报'),
    description: 'The Monday delivery review an agent writes from the records above: contract value at risk, unbilled work, which projects slipped and why, which clients have gone quiet.',
    localizedDescription: loc('The Monday delivery review an agent writes from the records above: contract value at risk, unbilled work, which projects slipped and why, which clients have gone quiet.', 'Agent 每周一根据以上记录写的交付周报：多少合同额有风险、多少工作还没开票、哪些项目下滑以及原因、哪些客户很久没沟通。'),
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
      field('value-at-risk', 'Contract value at risk ($)', '有风险的合同额（美元）', 'number'),
      field('unbilled-total', 'Unbilled work ($)', '未开票金额（美元）', 'number'),
      field('on-track-count', 'On track', '正常项目', 'number'),
      field('at-risk-count', 'At risk', '有风险项目', 'number'),
      field('checkin-overdue-count', 'Check-ins overdue', '沟通逾期项目', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('body', 'Review', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every delivery review, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-end', 'value-at-risk', 'headline'] } },
    ],
    agentPrompts: [
      prompt('write-review', loc('Write this Monday’s delivery review', '写本周一的交付周报'),
        skillBody('Write the delivery review for last Monday to Sunday from the projects, signals and actions: a one-line headline, contract value at risk, unbilled work, how many projects are on track, every at-risk project with what is wrong and the action, every client we have not checked in with for 14 days, and what changed since last week. Save it as a draft.', '根据项目、信号和跟进措施，写上周一到周日的交付周报：一句话结论、有风险的合同额、未开票金额、正常项目数、每个有风险项目的问题和对应措施、14 天没沟通的客户、与上周相比的变化。保存为草稿。')),
      prompt('compare-weeks', loc('What got better or worse since last week?', '和上周比哪些变好了、哪些变差了'),
        skillBody('Compare the two latest reviews and the signals between them: contract value at risk, unbilled work, which projects changed status, and which actions closed. Do not change anything.', '对比最近两份周报和期间的信号：有风险的合同额、未开票金额、哪些项目换了状态、哪些跟进措施完成了。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the
// AirApp's own prompts, and the guide dialog lists them.
const folderPrompts = [
  prompt('ask-risk', loc('Which client projects are slipping, and how much contract value is at risk?', '哪些客户项目在下滑，多少合同额有风险'),
    skillBody('Answer as the head of delivery: contract value at risk, unbilled work and how many projects are on track, then every at-risk project, lowest score first, with its contract value, the measure that hurt most, and the open action. Then every client we have not checked in with for 14 days. Keep it to one screen. Do not change anything.', '以交付负责人的口吻回答：先说多少合同额有风险、多少工作没开票、多少项目正常，再按评分从低到高列出每个有风险的项目，附合同额、拉低最多的指标和对应的跟进措施；然后列出 14 天没沟通的客户。控制在一屏以内。不要修改任何记录。'), 'read-only'),
  prompt('weekly-scan', loc('Run this week’s delivery scan', '跑本周交付扫描'),
    skillBody('For each project, read budget burn, the next milestone, unbilled work, unsigned scope changes and the client pulse from their sources, write a signal for anything that moved, re-score it by the skill’s rule, propose an action for any project newly at risk, and then write this week’s delivery review as a draft.', '为每个项目从数据来源读取预算消耗、下一个里程碑、未开票工作、未签字的范围变更和客户满意度，有变动的写一条信号，按 Skill 的规则重新打分，新变成有风险的提一条跟进措施，最后写一份本周交付周报草稿。')),
  prompt('write-review', loc('Write this Monday’s delivery review', '写本周一的交付周报'),
    skillBody('Write the delivery review for last Monday to Sunday: a one-line headline, contract value at risk, unbilled work, how many projects are on track, every at-risk project with what is wrong and the action, every client we have not checked in with for 14 days, and what changed since last week.', '写上周一到周日的交付周报：一句话结论、有风险的合同额、未开票金额、正常项目数、每个有风险项目的问题和对应措施、14 天没沟通的客户、与上周相比的变化。')),
  prompt('billing-chase', loc('What can we invoice this week?', '这周能开哪些票'),
    skillBody('List every project with unbilled work, largest amount first: how much, how old the oldest piece is, and what is stopping the invoice — an unsigned change order, a missing purchase order, or nothing. Do not change anything.', '列出每个有未开票工作的项目，金额大的排前面：多少钱、最早一笔多少天了、卡在哪里——未签字的变更单、客户没下采购单，还是没有阻碍。不要修改任何记录。'), 'read-only'),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'Client Delivery Desk',
  title: loc('Client Delivery Desk', '客户项目交付'),
  description: 'Agents read budget burn, milestones, unbilled work, scope changes and client pulse for every client project, score each one by one rule, and flag the projects that slip before the margin does.',
  localizedDescription: loc(
    'Agents read budget burn, milestones, unbilled work, scope changes and client pulse for every client project, score each one by one rule, and flag the projects that slip before the margin does.',
    'Agent 读取每个客户项目的预算消耗、里程碑、未开票工作、范围变更和客户满意度，按同一条规则打分，在利润被吃掉之前标出正在下滑的项目。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#4338ca' },
  asOf: '2026-11-16',
  // A project with no client check-in in this many days has gone quiet and
  // needs attention whatever its score.
  checkinWindowDays: 14,
  folder: { name: 'Client Delivery Desk', slug: APP, description: 'Every client project in delivery, scored the same way and kept current by agents from time tracking, the project plan, the accounting system, the change-order log and client check-ins, with the actions that fix the ones that slip.' },
  airApp: { name: 'Client Delivery Desk', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // sort, so a desk with years of signals still opens on the current rows.
  sources: [
    { key: 'projects', base: 'projects', limit: 50, sort: { fieldSlug: 'checked-in-on', fieldType: 'date', direction: 'desc' } },
    { key: 'signals', base: 'signals', limit: 50, sort: { fieldSlug: 'recorded-on', fieldType: 'date', direction: 'desc' } },
    { key: 'actions', base: 'actions', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' } },
    { key: 'reviews', base: 'reviews', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow.' },
  ui: {
    summary: loc('Every client project, one score, before the margin slips', '每个客户项目一个评分，在利润被吃掉之前'),
    detail_modes: { projects: 'page', signals: 'drawer', actions: 'split', reviews: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skill in this folder; each agent writes only the measure it reads from its own source. People own prices, contracts and change orders, invoices sent to clients, staffing, and anything said to a client.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；每个 Agent 只写它从自己的数据来源读到的指标。报价、合同和变更单、发给客户的发票、人员安排，以及对客户说的话，都由人来定。',
  ),
};
