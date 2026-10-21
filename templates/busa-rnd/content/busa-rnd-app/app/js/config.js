// The app's own declaration of the workspace it reads. This file is the source:
// `scripts/sync-content.mjs` (template root) generates every
// `content/<base>/base.json` and `records.ndjson` from it, so edit fields,
// views and node prompts here and re-run the script — never the generated files.

const loc = (en, zh) => ({ en, 'zh-CN': zh });
const both = (value) => `${value.en} / ${value['zh-CN']}`;

// A field as the app reads it: `name` is what the installed Base shows (both
// languages, because one Space is often read in both), `localizedName` is
// what this UI shows in the viewer's language.
const field = (slug, en, zh, type, options = {}, required = false) => ({
  slug, name: `${en} / ${zh}`, localizedName: loc(en, zh), type, required, options,
});
// Choice ids are the stable values agents write; names are for people.
const choices = (...items) => ({
  choices: items.map(([id, en, zh, tone = 'neutral']) => ({ id, name: `${en} / ${zh}`, localizedName: loc(en, zh), tone })),
});
const relation = (targetBaseSlug, multiple = false) => ({ targetBaseSlug, multiple });

// Every prompt body opens on its own `{target}` line and then names the skill
// that owns the job, so the agent reads the playbook before it touches data.
const prompt = (key, label, body, intent = 'change') => ({ key, label, body, intent });
const skillBody = (skill, en, zh) => (skill === 'busa-rnd'
  ? loc(`{target}\n\nRead the \`busa-rnd\` skill in this folder and follow it. ${en}`, `{target}\n\n先阅读本文件夹里的 \`busa-rnd\` Skill，按它的规则做。${zh}`)
  : loc(
    `{target}\n\nRead the \`busa-rnd\` skill in this folder, then the \`${skill}\` skill, and follow them. ${en}`,
    `{target}\n\n先阅读本文件夹里的 \`busa-rnd\` Skill，再读 \`${skill}\` Skill，按它们的流程做。${zh}`,
  ));

const APP = 'busa-rnd';
const slug = (key) => `${APP}-${key}`;

const TASK_STATUS = choices(
  ['backlog', 'Backlog', '待规划', 'neutral'],
  ['todo', 'To do', '待开始', 'accent'],
  ['in-progress', 'In progress', '进行中', 'warning'],
  ['in-review', 'In review', '评审中', 'warning'],
  ['done', 'Done', '已完成', 'positive'],
  ['canceled', 'Canceled', '已取消', 'neutral'],
);

const bases = [
  {
    key: 'products',
    slug: slug('products'),
    name: 'Products / 产品',
    localizedName: loc('Products', '产品'),
    description: 'Every product the team builds: who owns it and which repositories carry it. / 团队在做的每个产品：谁负责、由哪些代码仓库承载。',
    localizedDescription: loc('Every product the team builds: who owns it and which repositories carry it.', '团队在做的每个产品：谁负责、由哪些代码仓库承载。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Product', '产品', 'text', {}, true),
      field('product-key', 'Product key', '产品标识', 'text'),
      field('status', 'Status', '状态', 'select', choices(
        ['active', 'Active', '在研', 'positive'],
        ['maintenance', 'Maintenance', '维护中', 'neutral'],
        ['planned', 'Planned', '规划中', 'accent'],
        ['retired', 'Retired', '已下线', 'neutral'],
      )),
      field('owner', 'Owner', '负责人', 'text'),
      field('repos', 'Repositories', '代码仓库', 'longtext'),
      field('try-at', 'Where to try', '验收环境', 'longtext'),
      field('description', 'About', '产品简介', 'longtext'),
    ],
    views: [
      { slug: 'all', name: 'All products / 全部产品', description: 'Every product and its owner / 每个产品及负责人', type: 'table', config: { filters: [], sorts: [], visibleFieldSlugs: ['title', 'product-key', 'status', 'owner', 'repos', 'try-at'] } },
    ],
    agentPrompts: [
      prompt('register-product', loc('Register a new product and its repositories', '登记一个新产品和它的代码仓库'),
        skillBody('rnd-pmo', 'Register the product I describe: give it a short kebab-case product key, its owner, and one repository URL per line. Check for an existing product with the same name or key first.', '登记我描述的产品：起一个简短的 kebab-case 产品标识，写上负责人，代码仓库一行一个地址。先查有没有同名或同标识的产品。')),
      prompt('product-picture', loc('Give me the full picture of one product', '看一个产品的全貌'),
        skillBody('rnd-pmo', 'For the product I name, summarise its open projects and their health, what shipped in the last two weeks, what is waiting for acceptance, and the top of its backlog. Do not change anything.', '针对我说的产品，汇总进行中的项目及健康度、最近两周上线了什么、有什么在等验收、需求池排在最前面的几项。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'projects',
    slug: slug('projects'),
    name: 'Projects / 项目',
    localizedName: loc('Projects', '项目'),
    description: 'Work with a goal and a target date, inside one product. / 某个产品里有目标、有目标日期的一段工作。',
    localizedDescription: loc('Work with a goal and a target date, inside one product.', '某个产品里有目标、有目标日期的一段工作。'),
    readLimit: 50,
    primary: 'title',
    status: 'health',
    fields: [
      field('title', 'Project', '项目', 'text', {}, true),
      field('product', 'Product', '所属产品', 'relation', relation(slug('products'))),
      field('status', 'Status', '状态', 'select', choices(
        ['planned', 'Planned', '规划中', 'accent'],
        ['in-progress', 'In progress', '进行中', 'warning'],
        ['paused', 'Paused', '已暂停', 'neutral'],
        ['done', 'Done', '已完成', 'positive'],
        ['canceled', 'Canceled', '已取消', 'neutral'],
      )),
      field('health', 'Health', '健康度', 'select', choices(
        ['on-track', 'On track', '正常', 'positive'],
        ['at-risk', 'At risk', '有风险', 'warning'],
        ['off-track', 'Off track', '已延误', 'danger'],
      )),
      field('owner', 'Owner', '负责人', 'text'),
      field('start-date', 'Start date', '开始日期', 'date'),
      field('target-date', 'Target date', '目标日期', 'date'),
      field('goal', 'Goal and scope', '目标与范围', 'longtext'),
      field('latest-update', 'Latest update', '最新进展', 'longtext'),
      field('updated-on', 'Update written on', '进展更新于', 'date'),
    ],
    views: [
      { slug: 'all', name: 'All projects / 全部项目', description: 'Projects by target date / 按目标日期排列', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'target-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'product', 'status', 'health', 'owner', 'target-date'] } },
      { slug: 'at-risk', name: 'At risk / 有风险', description: 'Projects marked at risk / 标记为有风险的项目', type: 'table', config: { filters: [{ fieldSlug: 'health', operator: 'equals', value: 'at-risk' }], sorts: [{ fieldSlug: 'target-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'product', 'health', 'owner', 'target-date', 'latest-update'] } },
      { slug: 'off-track', name: 'Off track / 已延误', description: 'Projects that will miss their date / 会错过目标日期的项目', type: 'table', config: { filters: [{ fieldSlug: 'health', operator: 'equals', value: 'off-track' }], sorts: [{ fieldSlug: 'target-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'product', 'health', 'owner', 'target-date', 'latest-update'] } },
    ],
    agentPrompts: [
      prompt('start-project', loc('Start a new project', '新建一个项目'),
        skillBody('rnd-pmo', 'Create the project I describe under the right product, with an owner, a start and a target date, and a goal written as what users will be able to do when it is done.', '在对应产品下新建我描述的项目：写上负责人、开始和目标日期，目标要写成「做完后用户能做什么」。')),
      prompt('update-project', loc("Update this project's progress and health", '更新这个项目的进展和健康度'),
        skillBody('rnd-pmo', "Read this project's tasks, changes and deliveries from the last week, then write a two-sentence latest update and set health by the playbook's rules. Tell me why if health changes.", '读这个项目最近一周的任务、变更和交付，写两句话的最新进展，并按手册规则设置健康度。健康度有变化时告诉我原因。')),
      prompt('projects-at-risk', loc('Which projects are at risk, and why?', '哪些项目有风险，原因是什么'),
        skillBody('rnd-pmo', 'List the projects that are at risk or off track, with the overdue or blocked tasks behind each one. Do not change anything.', '列出有风险或已延误的项目，以及每个项目背后超期或卡住的任务。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'tasks',
    slug: slug('tasks'),
    name: 'Tasks / 任务',
    localizedName: loc('Tasks', '任务'),
    description: 'Every need, bug and improvement, from first request to done. / 每一个需求、缺陷和优化，从提出到完成。',
    localizedDescription: loc('Every need, bug and improvement, from first request to done.', '每一个需求、缺陷和优化，从提出到完成。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Task', '任务', 'text', {}, true),
      field('product', 'Product', '所属产品', 'relation', relation(slug('products'))),
      field('project', 'Project', '所属项目', 'relation', relation(slug('projects'))),
      field('type', 'Type', '类型', 'select', choices(
        ['feature', 'Feature', '需求', 'accent'],
        ['bug', 'Bug', '缺陷', 'danger'],
        ['improvement', 'Improvement', '优化', 'neutral'],
        ['chore', 'Chore', '杂项', 'neutral'],
      )),
      field('status', 'Status', '状态', 'select', TASK_STATUS),
      field('priority', 'Priority', '优先级', 'select', choices(
        ['urgent', 'Urgent', '紧急', 'danger'],
        ['high', 'High', '高', 'warning'],
        ['medium', 'Medium', '中', 'neutral'],
        ['low', 'Low', '低', 'neutral'],
      )),
      field('assignee', 'Assignee', '负责人', 'text'),
      field('requester', 'Requested by', '提出人', 'text'),
      field('due-date', 'Due date', '截止日期', 'date'),
      field('acceptance', 'Acceptance criteria', '验收标准', 'longtext'),
      field('details', 'Details', '详情', 'longtext'),
      field('pr-url', 'Pull request', 'PR 链接', 'url'),
      field('completed-on', 'Completed on', '完成日期', 'date'),
    ],
    views: [
      { slug: 'open', name: 'Open tasks / 未完成任务', description: 'Everything not done or canceled, by due date / 未完成、未取消的任务，按截止日期', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'product', 'status', 'priority', 'assignee', 'due-date'] } },
      { slug: 'backlog', name: 'Backlog / 需求池', description: 'Needs nobody has scheduled yet / 还没排期的需求', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'backlog' }], sorts: [], visibleFieldSlugs: ['title', 'product', 'type', 'priority', 'requester'] } },
      { slug: 'in-review', name: 'In review / 评审中', description: 'Waiting on a pull-request review / 等待 PR 评审', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'in-review' }], sorts: [{ fieldSlug: 'due-date', direction: 'asc' }], visibleFieldSlugs: ['title', 'product', 'assignee', 'pr-url', 'due-date'] } },
    ],
    agentPrompts: [
      prompt('intake', loc('Turn notes into tasks', '把会议纪要拆成任务'),
        skillBody('rnd-prd', 'Split the text I paste into separate tasks: one need per task, the right product and type, the person who asked, and acceptance criteria written as what a user can see. Check for duplicates first and show me the list before writing.', '把我贴的内容拆成独立的任务：一件事一条，选对产品和类型，写上提出人，验收标准写成「用户能看到什么」。先查重，写入前先给我看清单。')),
      prompt('pick-up', loc('Pick up the next task and start coding', '领一个任务开始写代码'),
        skillBody('rnd-coder', 'Take the task I name (or the highest-priority To do task in this repository\'s product), mark it In progress with yourself as assignee, then implement it on a branch and keep the record updated through review and merge.', '领我指定的任务（没指定就领本仓库所属产品里优先级最高的「待开始」任务），改成「进行中」并把自己写成负责人，然后在分支上实现，评审和合并时同步更新这条记录。')),
      prompt('groom', loc('Groom the backlog and suggest priorities', '整理需求池并建议优先级'),
        skillBody('rnd-prd', 'Read the backlog, merge duplicates, flag tasks with no acceptance criteria, and propose a priority for each with a one-line reason. Apply nothing until I confirm.', '读需求池：合并重复项，标出没写验收标准的任务，为每条建议优先级并附一句理由。我确认之前不要改。')),
      prompt('check-acceptance', loc('Check that open tasks have acceptance criteria', '检查未完成的任务是否都写了验收标准'),
        skillBody('rnd-prd', 'List open tasks whose acceptance criteria are missing or not testable, and suggest a rewrite for each. Do not change anything.', '列出验收标准缺失或无法验证的未完成任务，并给每条建议改写。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'changelog',
    slug: slug('changelog'),
    name: 'Changelog / 变更记录',
    localizedName: loc('Changelog', '变更记录'),
    description: 'One row per merged change, in one plain sentence, written by whoever merged it. / 每次合并一条，用一句人话写清楚，由合并的人或 Agent 当场写。',
    localizedDescription: loc('One row per merged change, in one plain sentence, written by whoever merged it.', '每次合并一条，用一句人话写清楚，由合并的人或 Agent 当场写。'),
    readLimit: 50,
    primary: 'title',
    status: 'kind',
    fields: [
      field('title', 'Change', '变更摘要', 'text', {}, true),
      field('kind', 'Kind', '类型', 'select', choices(
        ['feature', 'Feature', '新功能', 'accent'],
        ['fix', 'Fix', '修复', 'danger'],
        ['improvement', 'Improvement', '优化', 'positive'],
        ['refactor', 'Refactor', '重构', 'neutral'],
        ['docs', 'Docs', '文档', 'neutral'],
        ['chore', 'Chore', '杂项', 'neutral'],
      )),
      field('product', 'Product', '所属产品', 'relation', relation(slug('products'))),
      field('task', 'Task', '关联任务', 'relation', relation(slug('tasks'))),
      field('merged-on', 'Merged on', '合并日期', 'date'),
      field('version', 'Version', '版本', 'text'),
      field('pr-url', 'Pull request or commit', 'PR 或提交', 'url'),
      field('repo', 'Repository', '仓库', 'text'),
      field('author', 'Author', '作者', 'text'),
      field('verification', 'How it was verified', '验证情况', 'longtext'),
      field('details', 'Details', '详情', 'longtext'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first / 最新在前', description: 'Merged changes, newest first / 已合并的变更，最新在前', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'merged-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'kind', 'product', 'merged-on', 'version', 'author'] } },
    ],
    agentPrompts: [
      prompt('log-change', loc('Log a change I just merged', '记一条刚合并的变更'),
        skillBody('rnd-coder', 'Write one changelog row for the pull request I name: one plain sentence a non-engineer understands, the kind, product, linked task, merge date, link, and how it was verified. Check that the same link is not already logged.', '为我指定的 PR 写一条变更记录：一句非工程师也看得懂的话，类型、产品、关联任务、合并日期、链接和验证情况。先确认同一个链接没记过。')),
      prompt('backfill', loc('Backfill merges that have no changelog entry', '从 git 补记漏写的合并'),
        skillBody('rnd-coder', "Compare last week's merged pull requests in this repository with the changelog and add a row for each one that is missing, marking it as backfilled from git. Show me the list first.", '对比这个仓库上周合并的 PR 和变更记录，为每个漏记的合并补一条，并注明「从 git 补记」。写入前先给我看清单。')),
      prompt('release-notes', loc('Draft release notes for a version', '生成某个版本的版本说明'),
        skillBody('rnd-pmo', 'Collect the changes for the product and version I name and write release notes in the Reports table as a draft, grouped into new, improved and fixed, in words users understand.', '汇总我指定产品和版本的变更，在「周报与产出」表里写一份版本说明草稿，分「新功能 / 优化 / 修复」三组，用用户听得懂的话。')),
    ],
  },
  {
    key: 'deliveries',
    slug: slug('deliveries'),
    name: 'Deliveries / 交付验收',
    localizedName: loc('Deliveries', '交付验收'),
    description: 'What users can now do, packaged from tasks and changes for a person to accept. / 用户现在能做到的事：由任务和变更整理而成，交给人来验收。',
    localizedDescription: loc('What users can now do, packaged from tasks and changes for a person to accept.', '用户现在能做到的事：由任务和变更整理而成，交给人来验收。'),
    readLimit: 50,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Delivery', '交付内容', 'text', {}, true),
      field('product', 'Product', '所属产品', 'relation', relation(slug('products'))),
      field('project', 'Project', '所属项目', 'relation', relation(slug('projects'))),
      field('status', 'Status', '状态', 'select', choices(
        ['preparing', 'Preparing', '整理中', 'neutral'],
        ['ready', 'Ready for acceptance', '待验收', 'warning'],
        ['accepted', 'Accepted', '验收通过', 'positive'],
        ['changes-requested', 'Changes requested', '需修改', 'danger'],
      )),
      field('tasks', 'Tasks', '包含任务', 'relation', relation(slug('tasks'), true)),
      field('changes', 'Changes', '包含变更', 'relation', relation(slug('changelog'), true)),
      field('how-to-verify', 'Acceptance steps', '验收步骤', 'markdown'),
      field('evidence', 'Evidence', '验收证据', 'markdown'),
      field('submitted-on', 'Submitted on', '提交验收日期', 'date'),
      field('acceptor', 'Acceptor', '验收人', 'text'),
      field('decided-on', 'Decided on', '验收日期', 'date'),
      field('feedback', 'Acceptance notes', '验收意见', 'longtext'),
    ],
    views: [
      { slug: 'ready', name: 'Ready for acceptance / 待验收', description: 'Waiting for a person to accept / 等人验收', type: 'table', config: { filters: [{ fieldSlug: 'status', operator: 'equals', value: 'ready' }], sorts: [{ fieldSlug: 'submitted-on', direction: 'asc' }], visibleFieldSlugs: ['title', 'product', 'status', 'acceptor', 'submitted-on'] } },
      { slug: 'all', name: 'All deliveries / 全部交付', description: 'Every delivery, newest submission first / 全部交付，最近提交在前', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'submitted-on', direction: 'desc' }], visibleFieldSlugs: ['title', 'product', 'status', 'acceptor', 'submitted-on', 'decided-on'] } },
    ],
    agentPrompts: [
      prompt('package-deliveries', loc("Package last week's changes for acceptance", '把上周的改动整理成待验收的交付'),
        skillBody('rnd-prd', "Group last week's merged changes and finished tasks into deliveries a user would recognise as one capability each, write acceptance steps from the tasks' criteria, and mark each Ready once its steps cover every criterion (otherwise keep it Preparing). Show me the grouping before writing.", '把上周合并的变更和完成的任务，按「用户能感知的一项功能」归并成交付，根据任务的验收标准写验收步骤；步骤覆盖全部标准的标为「待验收」，否则保持「整理中」。写入前先给我看归并结果。')),
      prompt('write-steps', loc('Write acceptance steps for this delivery', '给这项交付写验收步骤'),
        skillBody('rnd-prd', 'Write numbered acceptance steps for this delivery, each with the action a user takes and the result they should see, covering every acceptance criterion of its tasks. Note any criterion that cannot be checked yet.', '为这项交付写编号的验收步骤：每步写用户做什么、应该看到什么，覆盖所含任务的每一条验收标准。暂时验不了的标准要注明。')),
      prompt('record-decision', loc('Record my acceptance result', '记录我的验收结论'),
        skillBody('rnd-prd', 'Record the result I give you on this delivery: accepted, or changes requested with my notes. When changes are requested, create a follow-up task for each problem and link it.', '把我给的结论写到这项交付上：通过，或需修改并附上我的意见。需修改时，为每个问题新建一条跟进任务并关联上。')),
      prompt('waiting-for-me', loc('What is waiting for my acceptance?', '有哪些在等我验收'),
        skillBody('rnd-prd', 'List deliveries that are ready for acceptance, oldest first, each with its product, how long it has waited, and the first acceptance step. Do not change anything.', '列出待验收的交付，等得最久的在前，附上所属产品、已等待天数和第一条验收步骤。不要修改任何记录。'), 'read-only'),
    ],
  },
  {
    key: 'reports',
    slug: slug('reports'),
    name: 'Reports / 周报与产出',
    localizedName: loc('Reports', '周报与产出'),
    description: 'Weekly reports and release notes, written by an agent from the records and finalised by a person. / 周报和版本说明：由 Agent 根据记录生成，由人定稿。',
    localizedDescription: loc('Weekly reports and release notes, written by an agent from the records and finalised by a person.', '周报和版本说明：由 Agent 根据记录生成，由人定稿。'),
    readLimit: 20,
    primary: 'title',
    status: 'status',
    fields: [
      field('title', 'Report', '报告', 'text', {}, true),
      field('kind', 'Kind', '类型', 'select', choices(
        ['weekly', 'Weekly report', '周报', 'accent'],
        ['release', 'Release notes', '版本说明', 'neutral'],
        ['other', 'Other', '其他', 'neutral'],
      )),
      field('status', 'Status', '状态', 'select', choices(
        ['draft', 'Draft', '草稿', 'warning'],
        ['final', 'Final', '已定稿', 'positive'],
      )),
      field('period-start', 'Period start', '周期开始', 'date'),
      field('period-end', 'Period end', '周期结束', 'date'),
      field('product', 'Product', '所属产品', 'relation', relation(slug('products'))),
      field('summary', 'One-line summary', '一句话结论', 'text'),
      field('body', 'Report', '正文', 'markdown'),
    ],
    views: [
      { slug: 'latest', name: 'Latest first / 最新在前', description: 'Reports by period, newest first / 按周期排列，最新在前', type: 'table', config: { filters: [], sorts: [{ fieldSlug: 'period-end', direction: 'desc' }], visibleFieldSlugs: ['title', 'kind', 'status', 'period-start', 'period-end', 'summary'] } },
    ],
    agentPrompts: [
      prompt('weekly-report', loc("Write last week's weekly report", '生成上周研发周报'),
        skillBody('rnd-pmo', 'Write the weekly report for last Monday to Sunday as a draft: what shipped, what is in progress, the open needs, and the risks and decisions waiting on people, every line traceable to the rows it came from. Update project health while you are at it.', '为上周一到周日写一份周报草稿：上线了什么、进行中的工作、还有什么需求、风险和需要人拍板的事，每一条都能对应到原记录。顺手更新各项目的健康度。')),
      prompt('leadership-brief', loc('Give me a one-minute version for leadership', '改成给老板看的一分钟简版'),
        skillBody('rnd-pmo', 'From the latest weekly report, write a five-line brief for leadership: the headline, the two biggest deliveries, the top risk, and the one decision needed. Reply in chat; do not change the report.', '基于最新一份周报，写五行给老板看的简版：一句话结论、最重要的两项交付、最大的风险、需要拍板的一件事。直接回复在对话里，不要改周报。'), 'read-only'),
      prompt('finalise', loc('Finalise this report', '定稿这份周报'),
        skillBody('rnd-pmo', 'Apply the edits I give you to this report, re-check every number against the records, and mark it Final.', '按我给的修改意见改这份报告，逐条对照记录复核数字，然后标为「已定稿」。')),
    ],
  },
];

// The jobs that span the whole desk. They become the Folder's and the AirApp's
// own prompts, and the guide dialog lists them so a person knows what to ask.
const folderPrompts = [
  prompt('weekly-report', loc("Write last week's R&D weekly report", '生成上周研发周报'),
    skillBody('rnd-pmo', 'Write the weekly report for last Monday to Sunday as a draft in Reports: what shipped, what is in progress, the open needs, and the risks and decisions waiting on people. Update project health on the way.', '为上周一到周日在「周报与产出」里写一份周报草稿：上线了什么、进行中的工作、还有什么需求、风险和需要人拍板的事。顺手更新各项目的健康度。')),
  prompt('needs-me', loc('What needs my attention this week?', '这周有什么需要我处理'),
    skillBody('busa-rnd', 'List what is waiting on a person: deliveries ready for acceptance, report drafts to finalise, projects at risk or off track, and overdue tasks. Do not change anything.', '列出等人处理的事：待验收的交付、待定稿的周报、有风险或已延误的项目、超期任务。不要修改任何记录。'), 'read-only'),
  prompt('connect-repo', loc('Connect a code repository to this desk', '把一个代码仓库接到研发管理台'),
    skillBody('rnd-coder', "Register this repository under its product (create the product if it is new), then add the desk's pointer block to the repository's AGENTS.md or CLAUDE.md so every coding agent working there reads the playbook and writes back. Show me the block before committing it.", '把这个代码仓库登记到对应产品下（产品不存在就新建），再把研发管理台的指针段落写进仓库的 AGENTS.md 或 CLAUDE.md，让在这里干活的每个 coding agent 都会读手册并回写。提交前先给我看这段内容。')),
  prompt('intake', loc('Turn notes into tasks', '把会议纪要拆成任务'),
    skillBody('rnd-prd', 'Split the text I paste into separate tasks with the right product, type, requester and testable acceptance criteria. Check for duplicates and show me the list before writing.', '把我贴的内容拆成独立任务：选对产品和类型，写上提出人和可验证的验收标准。先查重，写入前先给我看清单。')),
];

export const appConfig = {
  appId: APP,
  appSlug: APP,
  appName: 'R&D Projects',
  title: loc('R&D Projects', '研发项目管理'),
  description: 'Products, projects, tasks, changelog, acceptance and the weekly report, kept current by your coding agents.',
  localizedDescription: loc(
    'Products, projects, tasks, changelog, acceptance and the weekly report, kept current by your coding agents.',
    '产品、项目、任务、变更记录、交付验收和周报，由你的 coding agent 随手维护。',
  ),
  deployment: 'cloud',
  binding: 'runtime',
  readOnly: true,
  schemaVersion: 1,
  locale: 'en',
  brand: { accent: '#2f5bd3' },
  asOf: '2026-10-21',
  folder: { name: both(loc('R&D Projects', '研发项目管理')), slug: APP, description: 'Products, projects, tasks, changelog, acceptance and the weekly report. / 产品、项目、任务、变更记录、交付验收和周报。' },
  airApp: { name: both(loc('R&D Projects', '研发项目管理')), slug: `${APP}-app`, resourceKey: `${APP}-app` },
  bases,
  folderPrompts,
  // What each screen reads. Every source is ONE bounded page with server-side
  // filters and sort, so a desk with years of history still opens on what
  // matters now — open work and the last few weeks — instead of on the oldest
  // 50 rows. `{daysAgo: n}` is resolved against today when the page is read.
  sources: [
    { key: 'products', base: 'products', limit: 50 },
    { key: 'projects', base: 'projects', limit: 50, sort: { fieldSlug: 'target-date', fieldType: 'date', direction: 'asc' } },
    { key: 'tasks-open', base: 'tasks', limit: 50, sort: { fieldSlug: 'due-date', fieldType: 'date', direction: 'asc' }, valueFilters: [{ fieldSlug: 'status', operator: 'ne', value: 'done' }, { fieldSlug: 'status', operator: 'ne', value: 'canceled' }] },
    { key: 'tasks-done', base: 'tasks', limit: 50, sort: { fieldSlug: 'completed-on', fieldType: 'date', direction: 'desc' }, valueFilters: [{ fieldSlug: 'status', operator: 'eq', value: 'done' }, { fieldSlug: 'completed-on', operator: 'gte', value: { daysAgo: 28 } }] },
    { key: 'changelog', base: 'changelog', limit: 50, sort: { fieldSlug: 'merged-on', fieldType: 'date', direction: 'desc' } },
    { key: 'deliveries', base: 'deliveries', limit: 50, sort: { fieldSlug: 'submitted-on', fieldType: 'date', direction: 'desc' } },
    { key: 'reports', base: 'reports', limit: 20, sort: { fieldSlug: 'period-end', fieldType: 'date', direction: 'desc' } },
  ],
  permissions: { readProcedures: ['nodes.list', 'nodes.get', 'bases.get', 'records.list', 'records.count'], setupProcedures: [], change_request_procedures: [] },
  onboarding: { version: 0, fields: [], rationale: 'No integration or setup required; the installed Bases are the workflow. / 无需集成或额外设置，安装后的表就是流程。' },
  ui: {
    summary: loc('What shipped, what is stuck, what is next', '交付了什么、卡在哪里、下一步做什么'),
    detail_modes: { products: 'drawer', projects: 'drawer', tasks: 'drawer', changelog: 'drawer', deliveries: 'split', reports: 'split' },
    recentDays: 7,
  },
  boundary: loc(
    'This app only reads. Agents write through change requests, following the skills in this folder; a person accepts deliveries and finalises reports.',
    '这个应用只读。Agent 按本文件夹里的 Skill 通过变更请求写入；交付由人验收，周报由人定稿。',
  ),
};
