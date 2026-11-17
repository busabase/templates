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
  `Read the \`busa-onboarding\` skill in this folder and follow it. ${en}`,
  `先阅读本文件夹里的 \`busa-onboarding\` Skill，按它的规则做。${zh}`,
);

const APP = 'busa-onboarding';
const slug = (key) => `${APP}-${key}`;

// One status per new hire. The rule that sets it is in SKILL.md and
// model.js#statusFor: five measures, twenty points each.
const STATUS = choices(
  ['on-track', 'On track', '顺利', 'positive'],
  ['watch', 'Watch', '关注', 'warning'],
  ['at-risk', 'At risk', '有风险', 'danger'],
);

const bases = [
  {
    key: 'hires',
    slug: slug('hires'),
    name: 'New Hires',
    localizedName: loc('New Hires', '新员工'),
    description: 'Everyone from signed offer to day 90: start date, manager and buddy, the five measures behind their onboarding score, and the score itself.',
    localizedDescription: loc('Everyone from signed offer to day 90: start date, manager and buddy, the five measures behind their onboarding score, and the score itself.', '从签下 offer 到入职第 90 天的每个人：入职日期、直属经理和导师、入职评分背后的五项指标，以及评分本身。'),
    readLimit: 50,
    primary: 'name',
    status: 'status',
    fields: [
      field('name', 'New hire', '新员工', 'text', {}, true),
      field('role', 'Role', '岗位', 'text'),
      field('team', 'Team', '团队', 'select', choices(
        ['engineering', 'Engineering', '研发', 'accent'],
        ['sales', 'Sales', '销售', 'neutral'],
        ['support', 'Customer success', '客户成功', 'neutral'],
        ['design', 'Design', '设计', 'neutral'],
        ['marketing', 'Marketing', '市场', 'neutral'],
        ['operations', 'Operations', '运营', 'neutral'],
        ['finance', 'Finance', '财务', 'neutral'],
        ['people', 'People', '人力', 'neutral'],
      )),
      field('manager', 'Manager', '直属经理', 'text'),
      field('buddy', 'Buddy', '入职导师', 'text'),
      field('start-date', 'Start date', '入职日期', 'date'),
      field('location', 'Location', '工作地点', 'text'),
      field('access-pct', 'Accounts and equipment ready, of those due (%)', '到期应开通的账号与设备完成率（%）', 'number'),
      field('paperwork-pct', 'Paperwork done, of what is due (%)', '到期应完成的入职手续完成率（%）', 'number'),
      field('training-pct', 'Training done, of what is due (%)', '到期应完成的培训完成率（%）', 'number'),
      field('checkins-missed', '1:1s missed, last 30 days', '近 30 天错过的 1:1 次数', 'number'),
      field('pulse', 'Latest pulse (1–5)', '最近一次脉搏问卷（1–5）', 'number'),
      field('score', 'Onboarding score', '入职评分', 'number'),
      field('status', 'Status', '状态', 'select', STATUS),
      field('scored-by', 'Last scored by', '最近评分者', 'text'),
      field('scored-on', 'Last scored', '最近评分', 'date'),
      field('summary', 'Latest word', '最新情况', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All new hires', description: 'Everyone from signed offer to day 90, with their status', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'start-date', direction: 'desc' }], visibleFieldSlugs: ['name', 'role', 'team', 'manager', 'start-date', 'score', 'status'] } },
      { slug: 'at-risk', name: 'At risk', description: 'New hires whose onboarding is at risk', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['name', 'role', 'manager', 'start-date', 'score', 'summary'] } },
    ],
    agentPrompts: [
      prompt('rescore', loc('Re-score this new hire from their latest measures', '用最新指标给这位新员工重新打分'),
        skillBody('For the new hire I name, read their five measures, compute the score and status by the skill’s rule, and update `score`, `status`, `scored-by`, `scored-on` and a one-sentence `summary`. Propose an action if they turned at risk and have none open.', '针对我说的新员工，读他的五项指标，按 Skill 的规则算评分和状态，更新 `score`、`status`、`scored-by`、`scored-on` 和一句话的 `summary`。如果变成有风险且没有进行中的跟进措施，提一条。')),
      prompt('hire-brief', loc('Brief me before my 1:1 with this new hire', '和这位新员工 1:1 之前给我讲讲'),
        skillBody('For the new hire I name, give a one-screen brief: role, start date and which day they are on, the score with each of its five parts, the last five signals and who wrote them, open actions, and two questions worth asking. Do not change anything.', '针对我说的新员工，给一屏简报：岗位、入职日期和今天是第几天、评分及五项得分、最近五条信号及写入者、进行中的跟进措施，以及值得问的两个问题。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'signals',
    slug: slug('signals'),
    name: 'Signals',
    localizedName: loc('Signals', '信号'),
    description: 'One row every time a new hire’s measure moves — accounts and equipment, paperwork, training, 1:1s, pulse — or there is something worth knowing, with the evidence and which agent or person wrote it.',
    localizedDescription: loc('One row every time a new hire’s measure moves — accounts and equipment, paperwork, training, 1:1s, pulse — or there is something worth knowing, with the evidence and which agent or person wrote it.', '新员工的账号设备、入职手续、培训、1:1 或脉搏问卷每变动一次、或有值得知道的情况时记一行：依据，以及是哪个 Agent 或哪个人写的。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Signal', '信号', 'text', {}, true),
      field('hire', 'New hire', '新员工', 'relation', relation(slug('hires'))),
      field('kind', 'Kind', '类型', 'select', choices(
        ['access', 'Accounts & equipment', '账号与设备', 'accent'],
        ['paperwork', 'Paperwork', '入职手续', 'neutral'],
        ['training', 'Training', '培训', 'neutral'],
        ['checkins', '1:1s', '1:1', 'neutral'],
        ['pulse', 'Pulse', '脉搏问卷', 'neutral'],
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
      { slug: 'latest', name: 'Latest first', description: 'Every signal, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'hire', 'kind', 'recorded-on', 'written-by'] } },
      { slug: 'notes', name: 'Notes', description: 'Visa delays, role changes, what a manager or buddy noticed', type: 'table', config: { filters: [{ fieldSlug: 'kind', operator: 'equals', value: 'note' }], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'hire', 'recorded-on', 'written-by'] } },
    ],
    agentPrompts: [
      prompt('log-signal', loc('Log what I noticed about a new hire', '记下我注意到的新员工情况'),
        skillBody('Record what I tell you about the new hire I name as one signal: the kind, today’s date, me as the writer and the evidence in my words. If it changes one of the five measures, update that field and re-score them.', '把我说的关于某位新员工的情况记成一条信号：类型、今天的日期、写入者是我、依据用我的原话。如果它改变了五项指标之一，更新那个字段并重新打分。')),
      prompt('what-moved', loc('What moved this week, and who wrote it?', '这周哪些信号变了，是谁写的'),
        skillBody('Summarise the signals of the last seven days by new hire, worst first: what moved, by how much, and which agent or person wrote each one. Do not change anything.', '按新员工汇总最近七天的信号，最差的排前面：变了什么、变了多少、每条是哪个 Agent 或哪个人写的。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'actions',
    slug: slug('actions'),
    name: 'Onboarding Actions',
    localizedName: loc('Onboarding Actions', '跟进措施'),
    description: 'What we will do for a new hire who is stuck: the cause, the plan, an owner and a date.',
    localizedDescription: loc('What we will do for a new hire who is stuck: the cause, the plan, an owner and a date.', '针对卡住的新员工要做什么：原因、计划、负责人和日期。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Action', '跟进措施', 'text', {}, true),
      field('hire', 'New hire', '新员工', 'relation', relation(slug('hires'))),
      field('status', 'Status', '状态', 'select', choices(
        ['open', 'Open', '待开始', 'warning'],
        ['in-progress', 'In progress', '进行中', 'accent'],
        ['done', 'Done', '已完成', 'positive'],
        ['dropped', 'Dropped', '已放弃', 'neutral'],
      )),
      field('owner', 'Owner', '负责人', 'text'),
      field('due-date', 'Due', '截止', 'date'),
      field('proposed-by', 'Proposed by', '提出者', 'text'),
      field('cause', 'Where it is stuck', '卡在哪里', 'longtext'),
      field('plan', 'What we will do', '应对计划', 'longtext'),
    ],
    views: [
      { slug: 'by-due', name: 'By due date', description: 'Every action, soonest due first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'hire', 'status', 'owner', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('propose-action', loc('Propose an action for a new hire who is stuck', '为一位卡住的新员工提出跟进措施'),
        skillBody('For the new hire I name, read their signals and score, explain in two or three sentences where they are stuck, and add one action with a concrete plan, an owner and a due date. Before the start date, the date is before day one. The owner is the person who can fix it — IT, People or the manager — not the new hire.', '针对我说的新员工，读他的信号和评分，用两三句话说明卡在哪里，然后加一条跟进措施，写清具体计划、负责人和截止日期。还没入职的，截止日期要在入职第一天之前。负责人是能解决问题的人——IT、人力或直属经理——而不是新员工本人。')),
      prompt('chase-actions', loc('Which onboarding actions are overdue?', '哪些跟进措施已经超期'),
        skillBody('List open actions past their due date with their owner and new hire, and say whether that new hire’s score has moved since the action was opened. Do not change anything.', '列出超过截止日期仍未完成的跟进措施、负责人和对应新员工，并说明措施开出以后这位新员工的评分有没有变化。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reviews',
    slug: slug('reviews'),
    name: 'Onboarding Reviews',
    localizedName: loc('Onboarding Reviews', '入职周报'),
    description: 'The Monday onboarding review an agent writes from the records above: who is at risk, who starts soon without a laptop, what changed.',
    localizedDescription: loc('The Monday onboarding review an agent writes from the records above: who is at risk, who starts soon without a laptop, what changed.', 'Agent 每周一根据以上记录写的入职周报：谁有风险、谁快入职了还没准备好、和上周比有什么变化。'),
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
      field('on-track-count', 'On track', '顺利人数', 'number'),
      field('at-risk-count', 'At risk', '有风险人数', 'number'),
      field('not-ready-count', 'Starting soon, not ready', '即将入职但未就绪', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('body', 'Review', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every onboarding review, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-end', 'at-risk-count', 'headline'] } },
    ],
    agentPrompts: [
      prompt('write-review', loc('Write this Monday’s onboarding review', '写本周一的入职周报'),
        skillBody('Write the onboarding review for last Monday to Sunday from the new hires, signals and actions: a one-line headline, how many are on track, every at-risk new hire with where they are stuck and the action, everyone starting in the next 14 days who is not ready, and what changed since last week. Save it as a draft.', '根据新员工、信号和跟进措施，写上周一到周日的入职周报：一句话结论、顺利人数、每位有风险新员工卡在哪里和对应措施、未来 14 天内入职但还没准备好的人、与上周相比的变化。保存为草稿。')),
      prompt('compare-weeks', loc('What got better or worse since last week?', '和上周比哪些变好了、哪些变差了'),
        skillBody('Compare the two latest reviews and the signals between them: which new hires changed status, how the at-risk count moved, and which actions closed. Do not change anything.', '对比最近两份周报和期间的信号：哪些新员工换了状态、有风险人数怎么变、哪些跟进措施完成了。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the
// AirApp's own prompts, and the guide dialog lists them.
const folderPrompts = [
  prompt('ask-risk', loc('Which new hires are stuck, and who starts next week without a laptop?', '哪些新员工卡住了，谁下周入职还没拿到电脑'),
    skillBody('Answer as the head of People: how many new hires are on track, then every at-risk new hire, earliest start first, with their score, the measure that hurt most, and the open action. Then everyone starting in the next 14 days who is not ready, and what is missing. Keep it to one screen. Do not change anything.', '以人力负责人的口吻回答：先说多少新员工进展顺利，再按入职日期从早到晚列出每位有风险的新员工，附评分、拉低最多的指标和对应的跟进措施；然后列出未来 14 天内入职但还没准备好的人，以及缺什么。控制在一屏以内。不要修改任何记录。'), 'read-only'),
  prompt('weekly-scan', loc('Run this week’s onboarding scan', '跑本周入职扫描'),
    skillBody('For each new hire, read accounts and equipment, paperwork, training, 1:1s and pulse from their sources, write a signal for anything that moved, re-score them by the skill’s rule, propose an action for anyone newly at risk, and then write this week’s onboarding review as a draft.', '为每位新员工从数据来源读取账号设备、入职手续、培训、1:1 和脉搏问卷，有变动的写一条信号，按 Skill 的规则重新打分，新变成有风险的提一条跟进措施，最后写一份本周入职周报草稿。')),
  prompt('write-review', loc('Write this Monday’s onboarding review', '写本周一的入职周报'),
    skillBody('Write the onboarding review for last Monday to Sunday: a one-line headline, how many are on track, every at-risk new hire with where they are stuck and the action, everyone starting in the next 14 days who is not ready, and what changed since last week.', '写上周一到周日的入职周报：一句话结论、顺利人数、每位有风险新员工卡在哪里和对应措施、未来 14 天内入职但还没准备好的人、与上周相比的变化。')),
  prompt('day-one', loc('Is everyone starting in the next 14 days ready for day one?', '未来 14 天入职的人第一天都准备好了吗'),
    skillBody('List everyone whose start date is in the next 14 days, soonest first, with what is still missing — accounts, equipment, paperwork — who owns each gap, and whether it will be done before day one. Do not change anything.', '按日期列出未来 14 天内入职的每个人，写清还缺什么——账号、设备、入职手续——每一项由谁负责，能不能在入职第一天之前办好。不要修改任何记录。'), 'read-only'),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'Onboarding Desk',
  title: loc('Onboarding Desk', '新员工入职'),
  description: 'Agents read IT tickets, HR paperwork, training, 1:1s and pulse surveys for every new hire, score each one by one rule, and flag who is stuck before their first 90 days slip.',
  localizedDescription: loc(
    'Agents read IT tickets, HR paperwork, training, 1:1s and pulse surveys for every new hire, score each one by one rule, and flag who is stuck before their first 90 days slip.',
    'Agent 读取每位新员工的 IT 工单、入职手续、培训、1:1 和脉搏问卷，按同一条规则打分，在前 90 天出问题之前就标出谁卡住了。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#0f7b6c' },
  asOf: '2026-11-09',
  // A start date inside this many days is "starting soon": anyone inside it
  // whose accounts and equipment are not all ready needs attention.
  startWindowDays: 14,
  folder: { name: 'Onboarding Desk', slug: APP, description: 'Every new hire from signed offer to day 90, scored the same way and kept current by agents from IT tickets, HR paperwork, training, 1:1s and pulse surveys, with the actions that unstick them.' },
  airApp: { name: 'Onboarding Desk', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // sort, so a desk with years of signals still opens on the current rows.
  sources: [
    { key: 'hires', base: 'hires', limit: 50, sort: { fieldSlug: 'start-date', fieldType: 'date', direction: 'desc' } },
    { key: 'signals', base: 'signals', limit: 50, sort: { fieldSlug: 'recorded-on', fieldType: 'date', direction: 'desc' } },
    { key: 'actions', base: 'actions', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' } },
    { key: 'reviews', base: 'reviews', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow.' },
  ui: {
    summary: loc('Every new hire, one score, ready on day one', '每位新员工一个评分，第一天就准备好'),
    detail_modes: { hires: 'page', signals: 'drawer', actions: 'split', reviews: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skill in this folder; each agent writes only the measure it reads from its own source. People own offers, pay, start dates, reporting lines and anything said to the new hire.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；每个 Agent 只写它从自己的数据来源读到的指标。offer、薪酬、入职日期、汇报关系，以及对新员工说的话，都由人来定。',
  ),
};
