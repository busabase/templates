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
  `Read the \`busa-okr\` skill in this folder and follow it. ${en}`,
  `先阅读本文件夹里的 \`busa-okr\` Skill，按它的规则做。${zh}`,
);

const APP = 'busa-okr';
const slug = (key) => `${APP}-${key}`;

const TEAM = choices(
  ['company', 'Company', '公司', 'accent'],
  ['growth', 'Growth', '增长', 'neutral'],
  ['sales', 'Sales', '销售', 'neutral'],
  ['operations', 'Operations', '运营', 'neutral'],
  ['support', 'Support', '客服', 'neutral'],
);
// One traffic light for objectives and key results. The rule that sets it is
// in SKILL.md and model.js#statusFor: how far progress trails the quarter.
const LIGHT = choices(
  ['on-track', 'On track', '正常', 'positive'],
  ['watch', 'Watch', '关注', 'warning'],
  ['at-risk', 'At risk', '有风险', 'danger'],
);

const bases = [
  {
    key: 'objectives',
    slug: slug('objectives'),
    name: 'Objectives',
    localizedName: loc('Objectives', '目标'),
    description: 'What the company and each team want to achieve this quarter.',
    localizedDescription: loc('What the company and each team want to achieve this quarter.', '公司和各团队本季度要达成的目标。'),
    readLimit: 50,
    primary: 'title',
    status: 'confidence',
    fields: [
      field('title', 'Objective', '目标', 'text', {}, true),
      field('level', 'Level', '层级', 'select', choices(
        ['company', 'Company', '公司级', 'accent'],
        ['team', 'Team', '团队级', 'neutral'],
      )),
      field('team', 'Team', '团队', 'select', TEAM),
      field('owner', 'Owner', '负责人', 'text'),
      field('quarter', 'Quarter', '季度', 'text'),
      field('parent', 'Supports', '支撑的上级目标', 'relation', relation(slug('objectives'))),
      field('confidence', 'Confidence', '信心', 'select', LIGHT),
      field('summary', 'Latest word', '最新进展', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All objectives', description: 'Company objectives first, then each team', type: 'table', config: { filters: [], sorts: [], visibleFieldSlugs: ['title', 'level', 'team', 'owner', 'confidence', 'parent'] } },
      { slug: 'at-risk', name: 'At risk', description: 'Objectives whose confidence is at risk', type: 'table', config: { filters: [{ fieldSlug: 'confidence', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['title', 'team', 'owner', 'confidence', 'summary'] } },
    ],
    agentPrompts: [
      prompt('draft-okrs', loc('Draft next quarter’s objectives from our plan', '根据年度计划起草下季度目标'),
        skillBody('Draft company and team objectives for the quarter I name from the plan or notes I paste: three company objectives at most, each team objective supporting one of them, each with two to four measurable key results. Show me the draft before writing anything.', '根据我贴的计划或笔记，为我指定的季度起草公司级和团队级目标：公司级最多三个，每个团队目标都要支撑其中一个，每个目标配两到四个可量化的关键结果。写入前先给我看草稿。')),
      prompt('objective-status', loc('How is this objective really doing?', '这个目标实际进展如何'),
        skillBody('For the objective I name, show each key result with its progress against where the quarter says it should be, the latest update and who wrote it, and any open actions. Do not change anything.', '针对我说的目标，列出每个关键结果的进度和按时间应达到的进度、最近一次更新及写入者，以及未完成的行动。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'key-results',
    slug: slug('key-results'),
    name: 'Key Results',
    localizedName: loc('Key Results', '关键结果'),
    description: 'The measurable results behind each objective, with where they started, where they must land and where they are now.',
    localizedDescription: loc('The measurable results behind each objective, with where they started, where they must land and where they are now.', '每个目标背后可量化的结果：起点、目标值和当前值。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Key result', '关键结果', 'text', {}, true),
      field('objective', 'Objective', '所属目标', 'relation', relation(slug('objectives'))),
      field('team', 'Team', '团队', 'select', TEAM),
      field('owner', 'Owner', '负责人', 'text'),
      field('status', 'Status', '状态', 'select', LIGHT),
      field('unit', 'Unit', '单位', 'text'),
      field('direction', 'Direction', '方向', 'select', choices(
        ['increase', 'Increase', '越高越好', 'neutral'],
        ['decrease', 'Decrease', '越低越好', 'neutral'],
      )),
      field('start-value', 'Start', '起点', 'number'),
      field('target-value', 'Target', '目标值', 'number'),
      field('current-value', 'Current', '当前值', 'number'),
      field('source', 'Data source', '数据来源', 'text'),
      field('updated-by', 'Last updated by', '最近更新者', 'text'),
      field('updated-on', 'Last updated', '最近更新', 'date'),
    ],
    views: [
      { slug: 'all', name: 'All key results', description: 'Every key result with its light', type: 'table', config: { filters: [], sorts: [], visibleFieldSlugs: ['title', 'objective', 'team', 'status', 'current-value', 'target-value', 'updated-by', 'updated-on'] } },
      { slug: 'red', name: 'At risk', description: 'Key results that are clearly behind', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['title', 'team', 'owner', 'current-value', 'target-value', 'source'] } },
    ],
    agentPrompts: [
      prompt('update-team-krs', loc('Update my team’s key results from our data', '用我们的数据更新本团队的关键结果'),
        skillBody('Update the key results of the team I name: read each one’s data source, write the new current value with an evidence line in Check-ins, recompute its light by the skill’s rule, and open an action for any key result that turns red. Touch no other team’s rows.', '更新我指定团队的关键结果：读每个关键结果的数据来源，在「进展记录」里写入新数值和依据，按 Skill 的规则重新算红绿灯；变成红灯的关键结果要开一条行动。不要动其他团队的记录。')),
      prompt('which-red', loc('Which key results are at risk, and why?', '哪些关键结果有风险，为什么'),
        skillBody('List the key results at risk or on watch, worst first: how far each trails the quarter, the last update and its evidence, and the open action if there is one. Do not change anything.', '按严重程度列出有风险和需关注的关键结果：各自落后时间进度多少、最近一次更新和依据、对应的行动。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'check-ins',
    slug: slug('check-ins'),
    name: 'Check-ins',
    localizedName: loc('Check-ins', '进展记录'),
    description: 'One row every time a key result moves: the new value, the evidence, and which agent or person wrote it.',
    localizedDescription: loc('One row every time a key result moves: the new value, the evidence, and which agent or person wrote it.', '关键结果每变动一次记一行：新数值、依据，以及是哪个 Agent 或哪个人写的。'),
    readLimit: 50,
    primary: 'title',
    status: 'writer',
    fields: [
      field('title', 'Update', '更新', 'text', {}, true),
      field('key-result', 'Key result', '关键结果', 'relation', relation(slug('key-results'))),
      field('checked-on', 'Date', '日期', 'date'),
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
      { slug: 'latest', name: 'Latest first', description: 'Every check-in, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'checked-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'key-result', 'checked-on', 'written-by', 'writer'] } },
    ],
    agentPrompts: [
      prompt('log-checkin', loc('Log a new number for a key result', '为一个关键结果记一个新数值'),
        skillBody('Record the new value I give for the key result I name: one check-in with the previous and new value, today’s date, me as the writer and the evidence I describe, then update the key result’s current value and light.', '为我指定的关键结果记下我给的新数值：写一条进展记录，含原值、新值、今天的日期、写入者是我、以及我说的依据；再更新这个关键结果的当前值和红绿灯。')),
      prompt('what-changed', loc('What changed this week, and who wrote it?', '这周改了什么，是谁写的'),
        skillBody('Summarise the check-ins of the last seven days by team: which numbers moved, by how much, and which agent or person wrote each one. Do not change anything.', '按团队汇总最近七天的进展记录：哪些数字变了、变了多少、每条是哪个 Agent 或哪个人写的。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'actions',
    slug: slug('actions'),
    name: 'Actions',
    localizedName: loc('Actions', '行动'),
    description: 'What we will do about a key result that is off: the cause, the plan, an owner and a date.',
    localizedDescription: loc('What we will do about a key result that is off: the cause, the plan, an owner and a date.', '针对偏离的关键结果要做什么：原因、计划、负责人和日期。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Action', '行动', 'text', {}, true),
      field('key-result', 'Key result', '关键结果', 'relation', relation(slug('key-results'))),
      field('status', 'Status', '状态', 'select', choices(
        ['open', 'Open', '待开始', 'warning'],
        ['in-progress', 'In progress', '进行中', 'accent'],
        ['done', 'Done', '已完成', 'positive'],
        ['dropped', 'Dropped', '已放弃', 'neutral'],
      )),
      field('owner', 'Owner', '负责人', 'text'),
      field('due-date', 'Due', '截止', 'date'),
      field('proposed-by', 'Proposed by', '提出者', 'text'),
      field('cause', 'Why it is off', '偏离原因', 'longtext'),
      field('plan', 'What we will do', '应对计划', 'longtext'),
    ],
    views: [
      { slug: 'by-due', name: 'By due date', description: 'Every action, soonest due first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'key-result', 'status', 'owner', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('plan-recovery', loc('Propose a recovery plan for a red key result', '为一个红灯关键结果提出补救方案'),
        skillBody('For the key result I name, read its check-ins and evidence, explain in two or three sentences why it is off, and add one action with a concrete plan, an owner and a due date. Ask me who owns it if the key result has no owner.', '针对我说的关键结果，读它的进展记录和依据，用两三句话说明为什么偏离，然后加一条行动，写清具体计划、负责人和截止日期。关键结果没有负责人时先问我。')),
      prompt('chase-actions', loc('Which actions are overdue?', '哪些行动已经超期'),
        skillBody('List open actions past their due date with their owner and key result, and say whether that key result has moved since the action was opened. Do not change anything.', '列出超过截止日期仍未完成的行动、负责人和对应关键结果，并说明行动开出以后这个关键结果有没有变化。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reviews',
    slug: slug('reviews'),
    name: 'Weekly Reviews',
    localizedName: loc('Weekly Reviews', '经营周报'),
    description: 'The Monday business review an agent writes from the records above: one headline, every team, every risk.',
    localizedDescription: loc('The Monday business review an agent writes from the records above: one headline, every team, every risk.', 'Agent 每周一根据以上记录写的经营周报：一句结论、各团队情况、所有风险。'),
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
      field('at-risk-count', 'Key results at risk', '有风险的关键结果', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('body', 'Review', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every weekly review, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-start', 'period-end', 'headline'] } },
    ],
    agentPrompts: [
      prompt('write-review', loc('Write this Monday’s business review', '写本周一的经营周报'),
        skillBody('Write the weekly review for last Monday to Sunday from the objectives, key results, check-ins and actions: a one-line headline, overall progress against the quarter, each team in two lines, every red and watch key result with its cause and action, and what changed since last week.', '根据目标、关键结果、进展记录和行动，写上周一到周日的经营周报：一句话结论、整体进度对比时间进度、每个团队两行、每个红灯和黄灯关键结果的原因与行动、与上周相比的变化。')),
      prompt('compare-weeks', loc('What got better or worse since last week?', '和上周比哪些变好了、哪些变差了'),
        skillBody('Compare the two latest reviews and the check-ins between them: which key results changed light, which numbers moved most, and which actions closed. Do not change anything.', '对比最近两份周报和期间的进展记录：哪些关键结果换了灯、哪些数字变动最大、哪些行动完成了。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole cockpit. They become the Folder's and the
// AirApp's own prompts, and the guide dialog lists them.
const folderPrompts = [
  prompt('ask-risk', loc('Which goals are at risk this quarter, and why?', '这季度哪些目标有风险，为什么'),
    skillBody('Answer as the CEO’s chief of staff: overall progress against the quarter, then every key result at risk or on watch, worst first, with its cause, its latest evidence and the open action. Keep it to one screen. Do not change anything.', '以 CEO 幕僚的口吻回答：先说整体进度对比时间进度，再按严重程度列出每个有风险和需关注的关键结果，附原因、最新依据和对应行动。控制在一屏以内。不要修改任何记录。'), 'read-only'),
  prompt('weekly-update', loc('Run this week’s update for every team', '为所有团队跑本周更新'),
    skillBody('For each team in turn, read each key result’s data source, write a check-in with the new value and its evidence, recompute the lights, open an action for anything newly red, and then write this week’s review as a draft.', '依次为每个团队读取每个关键结果的数据来源，写一条带新数值和依据的进展记录，重算红绿灯，新变红的开一条行动，最后写一份本周经营周报草稿。')),
  prompt('write-review', loc('Write this Monday’s business review', '写本周一的经营周报'),
    skillBody('Write the weekly review for last Monday to Sunday: a one-line headline, overall progress against the quarter, each team in two lines, every red and watch key result with its cause and action, and what changed since last week.', '写上周一到周日的经营周报：一句话结论、整体进度对比时间进度、每个团队两行、每个红灯和黄灯关键结果的原因与行动、与上周相比的变化。')),
  prompt('draft-okrs', loc('Draft next quarter’s OKRs from our plan', '根据年度计划起草下季度 OKR'),
    skillBody('Draft company and team objectives with two to four measurable key results each from the plan I paste. Every team objective supports a company one. Show me the draft before writing.', '根据我贴的计划起草公司级和团队级目标，每个目标配两到四个可量化的关键结果，每个团队目标都要支撑一个公司目标。写入前先给我看草稿。')),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'OKR Cockpit',
  title: loc('OKR Cockpit', 'OKR 经营驾驶舱'),
  description: 'Company and team OKRs that every team’s agent keeps current, with evidence, so the CEO asks one question instead of holding a status meeting.',
  localizedDescription: loc(
    'Company and team OKRs that every team’s agent keeps current, with evidence, so the CEO asks one question instead of holding a status meeting.',
    '公司和各团队的 OKR 由各团队的 Agent 带着依据持续更新，老板问一句就知道进展，不用再开进度会。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#2f5bd3' },
  asOf: '2026-11-05',
  // The quarter the cockpit measures against. Elapsed time is what "expected
  // progress" means, so it is declared once, here.
  quarter: { label: '2026-Q4', start: '2026-10-01', end: '2026-12-31' },
  folder: { name: 'OKR Cockpit', slug: APP, description: 'Company and team OKRs kept current by every team’s agent, with the evidence behind each number.' },
  airApp: { name: 'OKR Cockpit', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // sort, so a cockpit with years of history still opens on the current rows.
  sources: [
    { key: 'objectives', base: 'objectives', limit: 50 },
    { key: 'key-results', base: 'key-results', limit: 50 },
    { key: 'check-ins', base: 'check-ins', limit: 50, sort: { fieldSlug: 'checked-on', fieldType: 'date', direction: 'desc' } },
    { key: 'actions', base: 'actions', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' } },
    { key: 'reviews', base: 'reviews', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow.' },
  ui: {
    summary: loc('Every goal, every team, one light each', '每个目标、每个团队，一盏灯说清'),
    detail_modes: { objectives: 'page', 'key-results': 'drawer', 'check-ins': 'drawer', actions: 'split', reviews: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skill in this folder; each team’s agent touches only its own team’s key results, and people own the objectives.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；每个团队的 Agent 只更新本团队的关键结果，目标由人来定。',
  ),
};
