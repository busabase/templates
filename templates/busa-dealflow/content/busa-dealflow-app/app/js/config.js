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
// playbook before it touches data. Busabase adds the node/space target line.
const prompt = (key, label, body, intent = 'change') => ({ key, label, body, intent });
const skillBody = (skill, en, zh) => (skill === 'busa-dealflow'
  ? loc(`Read the \`busa-dealflow\` skill in this folder and follow it. ${en}`, `先阅读本文件夹里的 \`busa-dealflow\` Skill，按它的规则做。${zh}`)
  : loc(
    `Read the \`busa-dealflow\` skill in this folder, then the \`${skill}\` skill, and follow them. ${en}`,
    `先阅读本文件夹里的 \`busa-dealflow\` Skill，再读 \`${skill}\` Skill，按它们的流程做。${zh}`,
  ));

const APP = 'busa-dealflow';
const slug = (key) => `${APP}-${key}`;

const STAGE = choices(
  ['sourcing', 'Sourcing', '线索', 'neutral'],
  ['first-meeting', 'First meeting', '初步接触', 'accent'],
  ['diligence', 'Due diligence', '立项尽调', 'warning'],
  ['ic', 'Investment committee', '投决', 'warning'],
  ['portfolio', 'Portfolio', '已投·投后', 'positive'],
  ['on-hold', 'On hold', '暂缓', 'neutral'],
  ['passed', 'Passed', '已放弃', 'neutral'],
);
const PHASE = choices(
  ['pre', 'Pre-investment', '投前', 'accent'],
  ['during', 'In process', '投中', 'warning'],
  ['post', 'Post-investment', '投后', 'positive'],
);

const bases = [
  {
    key: 'deals',
    slug: slug('deals'),
    name: 'Projects',
    localizedName: loc('Projects', '项目'),
    description: 'One record per company — the single entry every meeting, file, follow-up and post-investment update links to.',
    localizedDescription: loc('One record per company — the single entry every meeting, file, follow-up and post-investment update links to.', '一家公司只有一条项目记录：所有会议、资料、待跟进和投后进展都关联到它。'),
    readLimit: 50,
    primary: 'name',
    status: 'stage',
    fields: [
      field('name', 'Project', '项目', 'text', {}, true),
      field('company', 'Company legal name', '公司全称', 'text', {}, true),
      field('aliases', 'Also known as', '别名与常见叫法', 'text'),
      field('stage', 'Stage', '阶段', 'select', STAGE, true),
      field('sector', 'Sector', '赛道', 'select', choices(
        ['ai-infra', 'AI infrastructure', 'AI 基础设施', 'accent'],
        ['enterprise', 'Enterprise software', '企业服务', 'accent'],
        ['robotics', 'Robotics & manufacturing', '机器人与智能制造', 'accent'],
        ['healthcare', 'Healthcare', '医疗健康', 'accent'],
        ['consumer', 'Consumer', '消费科技', 'accent'],
        ['other', 'Other', '其他', 'neutral'],
      )),
      field('round', 'Round', '轮次', 'text'),
      field('owner', 'Deal lead', '项目负责人', 'text', {}, true),
      field('team', 'Team', '小组', 'select', choices(
        ['tech', 'Technology', '科技组', 'neutral'],
        ['healthcare', 'Healthcare', '医疗组', 'neutral'],
        ['consumer', 'Consumer', '消费组', 'neutral'],
      )),
      field('one-liner', 'One-liner', '一句话介绍', 'longtext'),
      field('latest-finding', 'Latest finding', '最新关键发现', 'longtext'),
      field('next-step', 'Next step', '下一步', 'text'),
      field('next-step-due', 'Next step due', '下一步日期', 'date'),
      field('last-meeting-on', 'Last meeting', '最近会议', 'date'),
      field('source', 'Source', '来源', 'text'),
      field('website', 'Website', '官网', 'url'),
    ],
    views: [
      { slug: 'pipeline', name: 'Pipeline', description: 'Every project, most recently met first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'last-meeting-on', direction: 'desc' }], visibleFieldSlugs: ['name', 'stage', 'sector', 'round', 'owner', 'last-meeting-on', 'next-step', 'next-step-due'] } },
    ],
    agentPrompts: [
      prompt('project-brief', loc('Brief me on one project before a meeting', '开会前给我一个项目简报'),
        skillBody('busa-dealflow', 'For the project I name, summarise every meeting so far in date order, the key findings and open questions, the open follow-ups with owners, and the next step. Do not change anything.', '针对我说的项目，按时间顺序汇总历次会议、关键发现和疑问、未完成的待跟进（含负责人）以及下一步。不要修改任何记录。'), 'read-only'),
      prompt('add-project', loc('Add a new project without creating a duplicate', '登记一个新项目（先查重）'),
        skillBody('busa-dealflow', 'Register the company I describe. Search existing projects by name, legal name and aliases first; if it already exists, tell me and update that record instead of creating a second one.', '登记我描述的公司。先按项目名、公司全称和别名查重；已经存在就告诉我，并更新原记录，不要再建一条。')),
      prompt('move-stage', loc('Move a project to its next stage', '推进项目阶段'),
        skillBody('busa-dealflow', 'Move the project I name to the stage I give, and note in the project which meeting or decision justified the move. Refuse if no meeting supports it.', '把我说的项目推进到我给的阶段，并在项目里写明是哪次会议或决定支持这次推进。没有会议依据就不要改。')),
    ],
  },
  {
    key: 'meetings',
    slug: slug('meetings'),
    name: 'Meetings & files',
    localizedName: loc('Meetings & files', '会议与资料'),
    description: 'Every meeting, call, diligence interview, IC meeting, board meeting and filed document — each linked to exactly one project.',
    localizedDescription: loc('Every meeting, call, diligence interview, IC meeting, board meeting and filed document — each linked to exactly one project.', '每一次会议、电话、尽调访谈、投决会、投后例会和归档资料，每条都关联到唯一一个项目。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Title', '标题', 'text', {}, true),
      field('deal', 'Project', '项目', 'relation', relation(slug('deals')), true),
      field('held-on', 'Date', '日期', 'date', {}, true),
      field('kind', 'Type', '类型', 'select', choices(
        ['intro', 'First meeting', '首次会议', 'accent'],
        ['follow-up', 'Follow-up meeting', '跟进会议', 'neutral'],
        ['diligence', 'Diligence interview', '尽调访谈', 'warning'],
        ['ic', 'IC meeting', '投决会', 'warning'],
        ['board', 'Post-investment review', '投后例会', 'positive'],
        ['document', 'Filed document', '资料归档', 'neutral'],
      ), true),
      field('phase', 'Phase', '投前/投中/投后', 'select', PHASE, true),
      field('attendees', 'Attendees', '参会人', 'text'),
      field('recorded-by', 'Recorded by', '记录人', 'text'),
      field('logged-via', 'Logged via', '整理工具', 'text'),
      field('summary', 'Minutes', '纪要', 'markdown'),
      field('highlights', 'Key findings', '关键发现', 'markdown'),
      field('questions', 'Open questions & risks', '疑问与风险', 'markdown'),
      field('transcript', 'Transcript', '转写原文', 'longtext'),
      field('files', 'Files', '资料附件', 'attachment'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Meetings and files, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'held-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'deal', 'held-on', 'kind', 'phase', 'recorded-by', 'logged-via'] } },
    ],
    agentPrompts: [
      prompt('log-meeting', loc('Turn a meeting transcript into minutes', '把会议转写整理成纪要'),
        skillBody('dealflow-meeting-notes', 'Turn the transcript or notes I give you into one meeting record: minutes, key findings, open questions, and follow-ups with owners and dates. Link it to the right existing project; only create a project after checking it does not exist.', '把我给你的会议转写或笔记整理成一条会议记录：纪要、关键发现、疑问与风险，以及带负责人和日期的待跟进。关联到正确的已有项目；确认不存在之后才新建项目。')),
      prompt('file-document', loc('File a document under its project', '把一份资料归档到项目下'),
        skillBody('dealflow-meeting-notes', 'File the document I attach (BP, board pack, diligence report) as a "Filed document" record under its project, with a three-line summary of what it says and what is new compared with earlier meetings.', '把我附上的资料（BP、董事会材料、尽调报告）作为「资料归档」记录挂到对应项目下，写三行摘要：讲了什么、和之前的会议比有什么新信息。')),
      prompt('what-we-heard', loc('What did we hear about a topic across meetings?', '跨会议查一个话题我们听到了什么'),
        skillBody('busa-dealflow', 'Search the minutes and key findings for the topic I give and list what each meeting said about it, newest first, with the project and date. Do not change anything.', '在纪要和关键发现里查我给的话题，按时间倒序列出每次会议对它的说法，带上项目和日期。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'followups',
    slug: slug('followups'),
    name: 'Follow-ups',
    localizedName: loc('Follow-ups', '待跟进'),
    description: 'What someone promised to do next, with an owner and a date, linked to its project and the meeting it came from.',
    localizedDescription: loc('What someone promised to do next, with an owner and a date, linked to its project and the meeting it came from.', '会上约定要做的下一步：有负责人、有日期，关联到项目和来源会议。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Follow-up', '事项', 'text', {}, true),
      field('deal', 'Project', '项目', 'relation', relation(slug('deals')), true),
      field('meeting', 'From meeting', '来源会议', 'relation', relation(slug('meetings'))),
      field('owner', 'Owner', '负责人', 'text', {}, true),
      field('due-on', 'Due', '截止日期', 'date'),
      field('status', 'Status', '状态', 'select', choices(
        ['open', 'Open', '待办', 'accent'],
        ['in-progress', 'In progress', '进行中', 'warning'],
        ['done', 'Done', '已完成', 'positive'],
        ['dropped', 'Dropped', '已取消', 'neutral'],
      ), true),
      field('priority', 'Priority', '优先级', 'select', choices(
        ['high', 'High', '高', 'danger'],
        ['normal', 'Normal', '中', 'neutral'],
        ['low', 'Low', '低', 'neutral'],
      )),
      field('done-on', 'Done on', '完成日期', 'date'),
      field('notes', 'Notes', '备注', 'longtext'),
    ],
    views: [
      { slug: 'open', name: 'Open, by due date', description: 'Everything not done yet, soonest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-on', direction: 'asc' }], visibleFieldSlugs: ['title', 'deal', 'owner', 'due-on', 'status', 'priority'] } },
    ],
    agentPrompts: [
      prompt('my-followups', loc('What do I still owe this week?', '我这周还欠哪些跟进'),
        skillBody('busa-dealflow', 'List the open follow-ups whose owner is me, overdue first, then due this week, with the project and the meeting each came from. Do not change anything.', '列出负责人是我的未完成待跟进：先列逾期的，再列本周到期的，带上项目和来源会议。不要修改任何记录。'), 'read-only'),
      prompt('close-followup', loc('Mark a follow-up done and note the outcome', '把一条跟进标记完成并写结果'),
        skillBody('busa-dealflow', 'Mark the follow-up I describe as done today and write its outcome in Notes. If the outcome changes the project\'s next step, update the project too.', '把我说的这条跟进标记为今天完成，在备注里写结果。如果结果改变了项目的下一步，同时更新项目。')),
      prompt('chase-overdue', loc('Draft reminders for overdue follow-ups', '给逾期的跟进起草提醒'),
        skillBody('busa-dealflow', 'For every overdue follow-up, draft a one-line reminder to its owner naming the project and what was promised. Reply in chat; do not send anything or change records.', '为每条逾期的待跟进给负责人起草一句提醒，写明项目和当时答应的事。直接回复在对话里，不要发送，也不要改记录。'), 'read-only'),
    ],
  },
  {
    key: 'digests',
    slug: slug('digests'),
    name: 'Weekly digests',
    localizedName: loc('Weekly digests', '管理层周报'),
    description: 'One digest per week for leadership: which projects the team saw, what was found, and what needs following up.',
    localizedDescription: loc('One digest per week for leadership: which projects the team saw, what was found, and what needs following up.', '每周一份给管理层的汇总：团队看了哪些项目、有什么关键发现、哪些需要跟进。'),
    readLimit: 10,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Title', '标题', 'text', {}, true),
      field('period-start', 'From', '开始日期', 'date', {}, true),
      field('period-end', 'To', '结束日期', 'date', {}, true),
      field('status', 'Status', '状态', 'select', choices(
        ['draft', 'Draft', '草稿', 'accent'],
        ['final', 'Final', '已定稿', 'positive'],
      ), true),
      field('projects-seen', 'Projects seen', '本周看过的项目', 'number'),
      field('meetings-held', 'Meetings', '会议数', 'number'),
      field('body', 'Digest', '周报正文', 'markdown'),
      field('for-leadership', 'For leadership', '需要管理层关注', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Digests by week, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-start', 'period-end', 'projects-seen', 'meetings-held'] } },
    ],
    agentPrompts: [
      prompt('weekly-digest', loc("Write this week's team digest", '写本周投资团队周报'),
        skillBody('dealflow-weekly-digest', 'Write the digest for Monday to Sunday of this week: the projects the team saw, the key findings, stage changes, and the follow-ups that are overdue or due next week. Every line must trace to a meeting or follow-up record.', '为本周一到周日写一份周报：团队看了哪些项目、关键发现、阶段变化、逾期和下周到期的待跟进。每一条都要能对应到会议或待跟进记录。')),
      prompt('one-minute', loc('Give me the one-minute version', '给我一分钟版本'),
        skillBody('dealflow-weekly-digest', 'From the latest digest, give me five lines: the headline, the two most important findings, the follow-up most at risk, and the one decision leadership needs to make. Reply in chat; do not change the digest.', '基于最新一份周报，给我五行：一句话结论、最重要的两个发现、最可能延误的一条跟进、需要管理层拍板的一件事。直接回复在对话里，不要改周报。'), 'read-only'),
    ],
  },
  {
    key: 'ic-notes',
    slug: slug('ic-notes'),
    name: 'IC notes (leadership only)',
    localizedName: loc('IC notes (leadership only)', '投决会意见（仅管理层）'),
    description: 'Investment-committee conclusions and partners\' views. Restrict this table to leadership after install; nothing here is mirrored into the shared tables.',
    localizedDescription: loc('Investment-committee conclusions and partners\' views. Restrict this table to leadership after install; nothing here is mirrored into the shared tables.', '投决会结论与合伙人意见。安装后请把这张表设为仅管理层可见；这里的内容不会同步到共享表。'),
    // Hidden from most viewers by design: the app treats an unreadable table as
    // "not shared with you", never as a broken install.
    restricted: true,
    readLimit: 50,
    primary: 'title',
    status: 'decision',
    fields: [
      field('title', 'Title', '标题', 'text', {}, true),
      field('deal', 'Project', '项目', 'relation', relation(slug('deals')), true),
      field('decided-on', 'IC date', '投决日期', 'date', {}, true),
      field('decision', 'Decision', '结论', 'select', choices(
        ['approved', 'Approved', '通过', 'positive'],
        ['conditional', 'Approved with conditions', '有条件通过', 'warning'],
        ['deferred', 'Deferred', '暂缓', 'neutral'],
        ['declined', 'Declined', '否决', 'danger'],
      ), true),
      field('partners-view', 'Partners\' view', '合伙人意见', 'markdown'),
      field('conditions', 'Conditions', '条件与条款要点', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'IC decisions, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'decided-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'deal', 'decided-on', 'decision'] } },
    ],
    agentPrompts: [
      prompt('record-ic', loc('Record an IC decision', '记录一次投决会结论'),
        skillBody('busa-dealflow', 'Record the IC decision I describe for its project: the conclusion, the partners\' view, and the conditions in words. Keep figures and fund economics out of it, and do not copy any of it into the shared tables.', '为对应项目记录我描述的投决会结论：结论、合伙人意见、条件要点用文字写。不要写金额和基金收益，也不要把内容复制到共享表。')),
      prompt('ic-history', loc('Show the IC history of one project', '看一个项目的投决历史'),
        skillBody('busa-dealflow', 'List every IC decision for the project I name, oldest first, with the conditions and whether the follow-ups that came out of them are done. Do not change anything.', '按时间顺序列出我说的项目的每次投决结论和条件，并核对由此产生的待跟进是否完成。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the AirApp's
// own prompts, and the guide lists them so a person knows what to ask.
const folderPrompts = [
  prompt('log-meeting', loc('Turn a meeting transcript into minutes', '把会议转写整理成纪要'),
    skillBody('dealflow-meeting-notes', 'Turn the transcript or notes I give you into one meeting record with minutes, key findings, open questions and follow-ups, linked to the right existing project. Update the project\'s latest finding, next step and last-meeting date. Tell me what you wrote, with links.', '把我给的会议转写或笔记整理成一条会议记录：纪要、关键发现、疑问与风险、待跟进，关联到正确的已有项目，并更新项目的最新关键发现、下一步和最近会议日期。完成后告诉我写了什么，附链接。')),
  prompt('this-week', loc('What did the team see this week?', '本周团队看了哪些项目'),
    skillBody('busa-dealflow', 'For this week (Monday to today), list the projects the team met or filed documents for, who met them, the key findings, and the follow-ups that are overdue or due within seven days. Do not change anything.', '针对本周（周一到今天），列出团队开过会或归档过资料的项目、谁参加的、关键发现，以及逾期或七天内到期的待跟进。不要修改任何记录。'), 'read-only'),
  prompt('weekly-digest', loc("Write this week's team digest", '写本周投资团队周报'),
    skillBody('dealflow-weekly-digest', 'Write the digest for this week into Weekly digests as a draft: projects seen, key findings, stage changes, and follow-ups that need chasing, every line traceable to a record.', '在「管理层周报」里为本周写一份周报草稿：看过的项目、关键发现、阶段变化、需要催的待跟进，每一条都能对应到记录。')),
  prompt('project-brief', loc('Brief me on one project', '给我一个项目的完整简报'),
    skillBody('busa-dealflow', 'For the project I name, summarise every meeting in date order across pre-investment, in-process and post-investment, the open follow-ups, and the next step. Do not change anything.', '针对我说的项目，按投前、投中、投后的时间顺序汇总历次会议，列出未完成的待跟进和下一步。不要修改任何记录。'), 'read-only'),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'Deal Flow',
  title: loc('Deal Flow', '投资 Deal Flow'),
  description: 'One shared space for an investment team: projects, meetings, follow-ups and a weekly digest, kept current by everyone\'s own agents.',
  localizedDescription: loc(
    'One shared space for an investment team: projects, meetings, follow-ups and a weekly digest, kept current by everyone\'s own agents.',
    '投资团队的共享空间：项目、会议、待跟进和管理层周报，由每个人自己的智能体随手维护。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'zh-CN',
  brand: { accent: '#1f6f5c' },
  asOf: '2026-11-05',
  folder: { name: 'Deal Flow', slug: APP, description: 'Projects, meetings, follow-ups and the weekly leadership digest for an investment team.' },
  airApp: { name: 'Deal Flow', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // filters and sort. `{daysAgo: n}` is resolved against today when read.
  sources: [
    { key: 'deals', base: 'deals', limit: 50, sort: { fieldSlug: 'last-meeting-on', fieldType: 'date', direction: 'desc' } },
    { key: 'meetings', base: 'meetings', limit: 50, sort: { fieldSlug: 'held-on', fieldType: 'date', direction: 'desc' } },
    { key: 'followups-open', base: 'followups', limit: 50, sort: { fieldSlug: 'due-on', fieldType: 'date', direction: 'asc' }, valueFilters: [{ fieldSlug: 'status', operator: 'ne', value: 'done' }, { fieldSlug: 'status', operator: 'ne', value: 'dropped' }] },
    { key: 'followups-done', base: 'followups', limit: 50, sort: { fieldSlug: 'done-on', fieldType: 'date', direction: 'desc' }, valueFilters: [{ fieldSlug: 'status', operator: 'eq', value: 'done' }, { fieldSlug: 'done-on', operator: 'gte', value: { daysAgo: 28 } }] },
    { key: 'digests', base: 'digests', limit: 10, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
    { key: 'ic-notes', base: 'ic-notes', limit: 50, sort: { fieldSlug: 'decided-on', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['auth.verify', 'nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; each person connects their own agent with the prompt on the Connect page.' },
  ui: {
    summary: loc('Projects, meetings and what to follow up', '项目、会议与待跟进'),
    detail_modes: { deals: 'page', meetings: 'split', followups: 'drawer', digests: 'split', 'ic-notes': 'split' },
    soonDays: 7,
  },
  boundary: loc(
    'This app only reads. Each person\'s agent writes through change requests with that person\'s own permissions, following the skills in this folder. Tables you are not allowed to see do not appear here at all.',
    '这个应用只读。每个人的智能体按本文件夹里的 Skill、以本人的权限通过变更请求写入。没有权限的表在这里完全不会出现。',
  ),
};
