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
  `Read the \`busa-live-commerce\` skill in this folder and follow it. ${en}`,
  `先阅读本文件夹里的 \`busa-live-commerce\` Skill，按它的规则做。${zh}`,
);

const APP = 'busa-live-commerce';
const slug = (key) => `${APP}-${key}`;

// One status per live session. The rule that sets it is in SKILL.md and
// model.js#statusFor: five measures, twenty points each.
const STATUS = choices(
  ['on-track', 'On track', '顺利', 'positive'],
  ['watch', 'Watch', '关注', 'warning'],
  ['at-risk', 'At risk', '有风险', 'danger'],
);

const bases = [
  {
    key: 'sessions',
    slug: slug('sessions'),
    name: 'Live Sessions',
    localizedName: loc('Live Sessions', '直播场次'),
    description: 'Every live-selling session from two weeks before it airs to 30 days after: channel, host, producer, hero product, the GMV target, the five measures behind its score, and the score itself.',
    localizedDescription: loc('Every live-selling session from two weeks before it airs to 30 days after: channel, host, producer, hero product, the GMV target, the five measures behind its score, and the score itself.', '每一场直播，从开播前两周到播后 30 天：渠道、主播、运营负责人、主推品、GMV 目标、场次评分背后的五项指标，以及评分本身。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Session', '场次', 'text', {}, true),
      field('channel', 'Channel', '渠道', 'select', choices(
        ['tiktok-shop', 'TikTok Shop', 'TikTok Shop', 'accent'],
        ['douyin', 'Douyin', '抖音', 'neutral'],
        ['taobao-live', 'Taobao Live', '淘宝直播', 'neutral'],
        ['kuaishou', 'Kuaishou', '快手', 'neutral'],
        ['xiaohongshu', 'Xiaohongshu', '小红书', 'neutral'],
        ['shopee-live', 'Shopee Live', 'Shopee Live', 'neutral'],
      )),
      field('host', 'Host', '主播', 'text'),
      field('producer', 'Producer', '运营负责人', 'text'),
      field('live-date', 'Live date', '开播日期', 'date'),
      field('slot', 'Time slot', '时段', 'text'),
      field('hero-product', 'Hero product', '主推品', 'text'),
      field('target-gmv', 'GMV target ($)', 'GMV 目标（美元）', 'number'),
      field('gmv', 'GMV ($)', 'GMV（美元）', 'number'),
      field('stock-pct', 'Stock in the warehouse, of planned units (%)', '备货到位率：已入仓 / 计划件数（%）', 'number'),
      field('prep-pct', 'Pre-live checklist done (%)', '开播准备清单完成率（%）', 'number'),
      field('gmv-pct', 'GMV vs target (%)', 'GMV 达成率（%）', 'number'),
      field('conversion-pct', 'Viewers who bought (%)', '观看成交转化率（%）', 'number'),
      field('refund-pct', 'Refunded within 7 days (%)', '7 天退款率（%）', 'number'),
      field('score', 'Session score', '场次评分', 'number'),
      field('status', 'Status', '状态', 'select', STATUS),
      field('scored-by', 'Last scored by', '最近评分者', 'text'),
      field('scored-on', 'Last scored', '最近评分', 'date'),
      field('summary', 'Latest word', '最新情况', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All sessions', description: 'Every session on the desk, latest live date first, with its status', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'live-date', direction: 'desc' }], visibleFieldSlugs: ['title', 'channel', 'host', 'live-date', 'gmv', 'score', 'status'] } },
      { slug: 'at-risk', name: 'At risk', description: 'Sessions whose score is under 50', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'at-risk' }], sorts: [], visibleFieldSlugs: ['title', 'channel', 'producer', 'live-date', 'score', 'summary'] } },
    ],
    agentPrompts: [
      prompt('rescore', loc('Re-score this session from its latest measures', '用最新指标给这场直播重新打分'),
        skillBody('For the session I name, read its five measures, compute the score and status by the skill’s rule, and update `score`, `status`, `scored-by`, `scored-on` and a one-sentence `summary`. Propose an action if it turned at risk and has none open.', '针对我说的场次，读它的五项指标，按 Skill 的规则算评分和状态，更新 `score`、`status`、`scored-by`、`scored-on` 和一句话的 `summary`。如果变成有风险且没有进行中的跟进措施，提一条。')),
      prompt('session-brief', loc('Brief me on this session', '给我讲讲这场直播'),
        skillBody('For the session I name, give a one-screen brief: channel, host, live date, hero product, GMV against target, the score with each of its five parts, the last five signals and who wrote them, open actions, and two things to fix before the next session. Do not change anything.', '针对我说的场次，给一屏简报：渠道、主播、开播日期、主推品、GMV 对比目标、评分及五项得分、最近五条信号及写入者、进行中的跟进措施，以及下一场之前要改的两件事。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'signals',
    slug: slug('signals'),
    name: 'Signals',
    localizedName: loc('Signals', '信号'),
    description: 'One row every time a session’s measure moves — stock, pre-live checklist, GMV, conversion, refunds — or there is something worth knowing, with the evidence and which agent or person wrote it.',
    localizedDescription: loc('One row every time a session’s measure moves — stock, pre-live checklist, GMV, conversion, refunds — or there is something worth knowing, with the evidence and which agent or person wrote it.', '场次的备货、开播准备、GMV、转化率或退款率每变动一次、或有值得知道的情况时记一行：依据，以及是哪个 Agent 或哪个人写的。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Signal', '信号', 'text', {}, true),
      field('session', 'Session', '场次', 'relation', relation(slug('sessions'))),
      field('kind', 'Kind', '类型', 'select', choices(
        ['stock', 'Stock', '备货', 'accent'],
        ['prep', 'Pre-live checklist', '开播准备', 'neutral'],
        ['gmv', 'GMV', 'GMV', 'neutral'],
        ['conversion', 'Conversion', '转化率', 'neutral'],
        ['refund', 'Refunds', '退款率', 'neutral'],
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
      { slug: 'latest', name: 'Latest first', description: 'Every signal, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'session', 'kind', 'recorded-on', 'written-by'] } },
      { slug: 'notes', name: 'Notes', description: 'Customs holds, carrier problems, what a producer or host noticed', type: 'table', config: { filters: [{ fieldSlug: 'kind', operator: 'equals', value: 'note' }], sorts: [{ fieldSlug: 'recorded-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'session', 'recorded-on', 'written-by'] } },
    ],
    agentPrompts: [
      prompt('log-signal', loc('Log what I noticed about a session', '记下我注意到的场次情况'),
        skillBody('Record what I tell you about the session I name as one signal: the kind, today’s date, me as the writer and the evidence in my words. If it changes one of the five measures, update that field and re-score the session.', '把我说的关于某场直播的情况记成一条信号：类型、今天的日期、写入者是我、依据用我的原话。如果它改变了五项指标之一，更新那个字段并重新打分。')),
      prompt('what-moved', loc('What moved this week, and who wrote it?', '这周哪些信号变了，是谁写的'),
        skillBody('Summarise the signals of the last seven days by session, worst first: what moved, by how much, and which agent or person wrote each one. Do not change anything.', '按场次汇总最近七天的信号，最差的排前面：变了什么、变了多少、每条是哪个 Agent 或哪个人写的。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'actions',
    slug: slug('actions'),
    name: 'Live Actions',
    localizedName: loc('Live Actions', '跟进措施'),
    description: 'What we will do for a session that is slipping or not ready: the cause, the plan, an owner and a date.',
    localizedDescription: loc('What we will do for a session that is slipping or not ready: the cause, the plan, an owner and a date.', '针对出问题或没准备好的场次要做什么：原因、计划、负责人和日期。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Action', '跟进措施', 'text', {}, true),
      field('session', 'Session', '场次', 'relation', relation(slug('sessions'))),
      field('status', 'Status', '状态', 'select', choices(
        ['open', 'Open', '待开始', 'warning'],
        ['in-progress', 'In progress', '进行中', 'accent'],
        ['done', 'Done', '已完成', 'positive'],
        ['dropped', 'Dropped', '已放弃', 'neutral'],
      )),
      field('owner', 'Owner', '负责人', 'text'),
      field('due-date', 'Due', '截止', 'date'),
      field('proposed-by', 'Proposed by', '提出者', 'text'),
      field('cause', 'What went wrong', '问题在哪', 'longtext'),
      field('plan', 'What we will do', '应对计划', 'longtext'),
    ],
    views: [
      { slug: 'by-due', name: 'By due date', description: 'Every action, soonest due first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'session', 'status', 'owner', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('propose-action', loc('Propose an action for a session that is slipping', '为一场出问题的直播提出跟进措施'),
        skillBody('For the session I name, read its signals and score, explain in two or three sentences what went wrong or what is missing, and add one action with a concrete plan, an owner and a due date. Before a session airs, the date is before the live date.', '针对我说的场次，读它的信号和评分，用两三句话说明问题在哪或缺什么，然后加一条跟进措施，写清具体计划、负责人和截止日期。还没开播的，截止日期要在开播之前。')),
      prompt('chase-actions', loc('Which live actions are overdue?', '哪些跟进措施已经超期'),
        skillBody('List open actions past their due date with their owner and session, and say whether that session’s score has moved since the action was opened. Do not change anything.', '列出超过截止日期仍未完成的跟进措施、负责人和对应场次，并说明措施开出以后这场直播的评分有没有变化。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reviews',
    slug: slug('reviews'),
    name: 'Live Reviews',
    localizedName: loc('Live Reviews', '直播周报'),
    description: 'The Monday live-commerce review an agent writes from the records above: GMV against target, which sessions slipped and why, what goes live this week without stock.',
    localizedDescription: loc('The Monday live-commerce review an agent writes from the records above: GMV against target, which sessions slipped and why, what goes live this week without stock.', 'Agent 每周一根据以上记录写的直播周报：GMV 对比目标、哪些场次出了问题以及原因、本周哪些场次要开播却还没备好货。'),
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
      field('week-gmv', 'GMV in the week ($)', '本周 GMV（美元）', 'number'),
      field('on-track-count', 'On track', '顺利场次', 'number'),
      field('at-risk-count', 'At risk', '有风险场次', 'number'),
      field('not-ready-count', 'Going live soon, not ready', '即将开播但未就绪', 'number'),
      field('written-by', 'Written by', '写入者', 'text'),
      field('body', 'Review', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first', description: 'Every live review, newest first', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'status', 'period-end', 'week-gmv', 'headline'] } },
    ],
    agentPrompts: [
      prompt('write-review', loc('Write this Monday’s live review', '写本周一的直播周报'),
        skillBody('Write the live review for last Monday to Sunday from the sessions, signals and actions: a one-line headline, GMV in the week against target, how many sessions are on track, every at-risk session with what went wrong and the action, every session going live in the next 7 days without its stock, and what changed since last week. Save it as a draft.', '根据场次、信号和跟进措施，写上周一到周日的直播周报：一句话结论、本周 GMV 对比目标、顺利场次数、每场有风险的直播出了什么问题和对应措施、未来 7 天要开播但还没备好货的场次、与上周相比的变化。保存为草稿。')),
      prompt('compare-weeks', loc('What got better or worse since last week?', '和上周比哪些变好了、哪些变差了'),
        skillBody('Compare the two latest reviews and the signals between them: GMV, which sessions changed status, how the at-risk count moved, and which actions closed. Do not change anything.', '对比最近两份周报和期间的信号：GMV、哪些场次换了状态、有风险场次数怎么变、哪些跟进措施完成了。不要修改任何记录。'), 'read-only'),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the
// AirApp's own prompts, and the guide dialog lists them.
const folderPrompts = [
  prompt('ask-risk', loc('Which sessions are slipping, and what goes live this week without stock?', '哪些场次出了问题，本周哪场要开播却还没备好货'),
    skillBody('Answer as the head of live commerce: GMV in the last 30 days against target and how many sessions are on track, then every at-risk session, latest first, with its score, the measure that hurt most, and the open action. Then every session going live in the next 7 days that is not ready, and what is missing. Keep it to one screen. Do not change anything.', '以直播电商负责人的口吻回答：先说近 30 天 GMV 对比目标、多少场次顺利，再按日期从近到远列出每场有风险的直播，附评分、拉低最多的指标和对应的跟进措施；然后列出未来 7 天要开播但还没准备好的场次，以及缺什么。控制在一屏以内。不要修改任何记录。'), 'read-only'),
  prompt('weekly-scan', loc('Run this week’s live scan', '跑本周直播扫描'),
    skillBody('For each session, read stock, the pre-live checklist, GMV, conversion and refunds from their sources, write a signal for anything that moved, re-score it by the skill’s rule, propose an action for any session newly at risk or not ready, and then write this week’s live review as a draft.', '为每场直播从数据来源读取备货、开播准备、GMV、转化率和退款率，有变动的写一条信号，按 Skill 的规则重新打分，新变成有风险或未就绪的提一条跟进措施，最后写一份本周直播周报草稿。')),
  prompt('write-review', loc('Write this Monday’s live review', '写本周一的直播周报'),
    skillBody('Write the live review for last Monday to Sunday: a one-line headline, GMV in the week against target, how many sessions are on track, every at-risk session with what went wrong and the action, every session going live in the next 7 days without its stock, and what changed since last week.', '写上周一到周日的直播周报：一句话结论、本周 GMV 对比目标、顺利场次数、每场有风险的直播出了什么问题和对应措施、未来 7 天要开播但还没备好货的场次、与上周相比的变化。')),
  prompt('go-live-check', loc('Is every session in the next 7 days ready to go live?', '未来 7 天的场次都准备好开播了吗'),
    skillBody('List every session whose live date is in the next 7 days, soonest first, with what is still missing — stock, product cards, coupons, script, samples — who owns each gap, and whether it will be fixed before the session airs. Do not change anything.', '按日期列出未来 7 天内开播的每场直播，写清还缺什么——备货、商品卡、优惠券、脚本、样品——每一项由谁负责，能不能在开播前补上。不要修改任何记录。'), 'read-only'),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'Live Commerce Desk',
  title: loc('Live Commerce Desk', '直播电商运营'),
  description: 'Agents read stock, pre-live checklists, GMV, conversion and refunds for every live session, score each one by one rule, and flag the sessions that slip or go live without stock.',
  localizedDescription: loc(
    'Agents read stock, pre-live checklists, GMV, conversion and refunds for every live session, score each one by one rule, and flag the sessions that slip or go live without stock.',
    'Agent 读取每场直播的备货、开播准备、GMV、转化率和退款率，按同一条规则打分，标出出问题的场次和备货不足就要开播的场次。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#c2410c' },
  asOf: '2026-11-09',
  // A live date inside this many days is "going live soon": any session inside
  // it whose stock is not all in the warehouse needs attention.
  readyWindowDays: 7,
  // GMV on the overview counts sessions that aired in this many days.
  gmvWindowDays: 30,
  folder: { name: 'Live Commerce Desk', slug: APP, description: 'Every live-selling session across TikTok Shop, Douyin, Taobao Live, Kuaishou, Xiaohongshu and Shopee Live, scored the same way and kept current by agents from the warehouse, the pre-live checklist, shop analytics and after-sales, with the actions that fix the ones that slip.' },
  airApp: { name: 'Live Commerce Desk', slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // sort, so a desk with years of signals still opens on the current rows.
  sources: [
    { key: 'sessions', base: 'sessions', limit: 50, sort: { fieldSlug: 'live-date', fieldType: 'date', direction: 'desc' } },
    { key: 'signals', base: 'signals', limit: 50, sort: { fieldSlug: 'recorded-on', fieldType: 'date', direction: 'desc' } },
    { key: 'actions', base: 'actions', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' } },
    { key: 'reviews', base: 'reviews', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow.' },
  ui: {
    summary: loc('Every live session, one score, stock in before you go live', '每场直播一个评分，开播前货先到位'),
    detail_modes: { sessions: 'page', signals: 'drawer', actions: 'split', reviews: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skill in this folder; each agent writes only the measure it reads from its own source. People own prices, discounts, GMV targets, live dates, hosts, stock orders and anything said on air or to a buyer.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；每个 Agent 只写它从自己的数据来源读到的指标。价格、折扣、GMV 目标、开播日期、主播、补货下单，以及直播间里和对买家说的话，都由人来定。',
  ),
};
