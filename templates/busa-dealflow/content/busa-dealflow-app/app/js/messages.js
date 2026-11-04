// Every visible string, in both languages. Screens look keys up here; none
// hard-code copy, so a third locale is one more block.
export const messages = {
  en: {
    overview: 'This week', connect: 'Connect your agent', views: 'Desk views', language: 'Language', guide: 'How it works',
    loading: 'Reading the latest page of each table…', refresh: 'Refresh', retry: 'Retry', close: 'Close', back: 'Back', open: 'Open navigation',
    openFull: 'Open full page', select: 'Select a row to see it here.', notLoaded: 'Not in the loaded rows', empty: 'Nothing here yet.',
    matches: 'No loaded rows match.', clear: 'Clear filters', more: 'Load more', all: 'All', allStages: 'All stages', allOwners: 'All owners',
    search: 'Filter loaded rows', partial: 'Some tables could not be read; their numbers are missing, not zero.',
    stale: 'This data is more than 15 minutes old. Refresh to see the latest.',
    synthetic: 'Sample data: every company, person and meeting here is invented.',
    week: (label, from, to) => `${label} · ${from} – ${to}`, prevWeek: 'Previous week', nextWeek: 'Next week', thisWeek: 'This week',
    weekEmpty: 'No meetings logged in this week yet.', weekEmptyHint: 'Hand a transcript to your agent: “Turn this meeting transcript into minutes”.',
    mProjects: 'Projects seen', mMeetings: 'Meetings & files', mFindings: 'Key findings', mDue: (days) => `Follow-ups due in ${days} days`, mOverdue: (count) => `${count} overdue`,
    seenTitle: 'Which projects the team saw', findingsTitle: 'Key findings', dueTitle: 'Needs following up', digestTitle: 'Latest digest',
    readDigest: 'Read the digest', noDigest: 'No digest yet.', askDigest: 'Ask your agent: “Write this week’s team digest”.',
    meetingsCount: (count) => `${count} meeting${count === 1 ? '' : 's'}`, by: 'By', latestMeeting: 'Latest',
    nothingDue: 'Nothing is overdue or due soon.', overdueBadge: 'Overdue', dueOn: 'Due', owner: 'Owner',
    timeline: 'Timeline', phase: { pre: 'Pre-investment', during: 'In process', post: 'Post-investment', other: 'Other' },
    openFollowups: 'Open follow-ups', doneFollowups: 'Recently done', fromThisMeeting: 'Follow-ups from this meeting',
    noMeetings: 'No meetings loaded for this project yet.', noFollowups: 'No open follow-ups.', partialTimeline: 'Only the latest 50 meetings are loaded; older ones may be missing here.',
    icTitle: 'IC decision (leadership only)', restrictedNav: 'Only visible to the people it is shared with.',
    item: 'Item', project: 'Project', stage: 'Stage', days: (count) => `${count} d`, statusFilter: 'Status', stageFilter: 'Stage', ownerFilter: 'Owner',
    connectTitle: 'Connect your own agent to this space', connectLead: 'Everyone keeps the agent they already use — Codex, WorkBuddy, Claude Code or any agent that can run a command. Paste this prompt into it once; from then on it reads and writes this team space with your own permissions.',
    stepCopy: 'Copy the prompt', stepPaste: 'Paste it into your agent', stepApprove: 'Approve once in the browser', stepUse: 'Talk to it as usual',
    stepCopyBody: 'The prompt below already names this space and its playbooks.', stepPasteBody: 'Codex, WorkBuddy, Claude Code, Cursor… anything that can run a shell command.', stepApproveBody: 'The agent sends you a link; approve it with your own Busabase account. No keys are copied by hand.', stepUseBody: 'Hand it transcripts and questions; it follows the team playbook.',
    promptLabel: 'Agent connection prompt', copy: 'Copy prompt', copied: 'Copied', serverLabel: 'Busabase address', serverHint: 'For a private deployment, change this to your own address.',
    trySay: 'Then try saying', mcpNote: 'Agent without a shell? Connect it over MCP at', permissionTitle: 'What your agent can see', permissionBody: 'Your agent signs in as you. It sees exactly the tables you can see — a table restricted to leadership does not exist for it, in search or anywhere else.',
    guideTitle: 'How this desk works', loopTitle: 'The loop', askTitle: 'What you can ask your agent', boundaryTitle: 'What this app does not do', runtimeTitle: 'Connection',
    loop: ['A meeting happens; someone hands the transcript to their own agent.', 'The agent finds the project (never a duplicate), writes the minutes, findings and follow-ups, and updates the project.', 'Colleagues ask their own agents about any project and get the same shared answer.', 'Leadership opens “This week”: projects seen, findings, and what needs following up.', 'Owners close follow-ups as they go; the weekly digest closes the week.'],
    provider: 'Data source', runtime: 'Runtime',
    permission: 'This account cannot read the desk.', setup: 'The desk is not installed completely.', error: 'The desk could not be read.',
    hintHosted: 'Running inside Busabase with your own session. Check that this folder was installed whole and that you can read it.',
    hintStandalone: 'Running standalone. Connect to Busabase from the setup screen, or open the app inside Busabase.',
    hintDevProxy: 'Running standalone with a server-side credential. Check its Space and permissions.',
    hintUnknown: 'Could not tell where this app is running. Reload, or open it from Busabase.',
  },
  'zh-CN': {
    overview: '本周总览', connect: '接入智能体', views: '视图', language: '语言', guide: '使用说明',
    loading: '正在读取各张表的最新一页…', refresh: '刷新', retry: '重试', close: '关闭', back: '返回', open: '打开导航',
    openFull: '打开完整页面', select: '选择一行查看详情。', notLoaded: '不在已加载的记录里', empty: '这里还没有内容。',
    matches: '已加载的记录里没有匹配项。', clear: '清除筛选', more: '加载更多', all: '全部', allStages: '全部阶段', allOwners: '全部负责人',
    search: '筛选已加载的记录', partial: '有些表没有读到；对应数字是缺失，不是零。',
    stale: '数据已超过 15 分钟，刷新可查看最新内容。',
    synthetic: '演示数据：这里的公司、人物和会议全部为虚构合成。',
    week: (label, from, to) => `${label} · ${from} – ${to}`, prevWeek: '上一周', nextWeek: '下一周', thisWeek: '本周总览',
    weekEmpty: '这一周还没有会议记录。', weekEmptyHint: '把会议转写交给你的智能体：「把这份会议转写整理成纪要」。',
    mProjects: '本周看过的项目', mMeetings: '会议与资料', mFindings: '关键发现', mDue: (days) => `${days} 天内要跟进`, mOverdue: (count) => `其中逾期 ${count}`,
    seenTitle: '本周团队看了哪些项目', findingsTitle: '关键发现', dueTitle: '需要跟进', digestTitle: '最新周报',
    readDigest: '阅读周报', noDigest: '还没有周报。', askDigest: '对智能体说：「写本周投资团队周报」。',
    meetingsCount: (count) => `${count} 次`, by: '参与', latestMeeting: '最近一次',
    nothingDue: '没有逾期或即将到期的跟进。', overdueBadge: '已逾期', dueOn: '截止', owner: '负责人',
    timeline: '项目时间线', phase: { pre: '投前', during: '投中', post: '投后', other: '其他' },
    openFollowups: '未完成的待跟进', doneFollowups: '最近完成', fromThisMeeting: '本次会议产生的待跟进',
    noMeetings: '这个项目还没有加载到会议记录。', noFollowups: '没有未完成的待跟进。', partialTimeline: '只加载了最近 50 条会议，更早的记录可能不在这里。',
    icTitle: '投决会意见（仅管理层）', restrictedNav: '只对被授权的人可见。',
    item: '事项', project: '项目', stage: '阶段', days: (count) => `${count} 天`, statusFilter: '状态', stageFilter: '阶段', ownerFilter: '负责人',
    connectTitle: '把你自己的智能体接入这个团队空间', connectLead: '每个人继续用自己习惯的智能体：Codex、WorkBuddy、Claude Code，或任何能运行命令的智能体。把下面这段提示词粘贴进去一次，之后它就以你本人的权限读写这个团队空间。',
    stepCopy: '复制提示词', stepPaste: '粘贴进你的智能体', stepApprove: '在浏览器里批准一次', stepUse: '像平时一样对它说话',
    stepCopyBody: '下面的提示词已经写好了这个空间和团队手册。', stepPasteBody: 'Codex、WorkBuddy、Claude Code、Cursor……能运行命令的都可以。', stepApproveBody: '智能体会发给你一个链接，用你自己的 Busabase 账号批准即可，不用手动复制密钥。', stepUseBody: '把会议转写和问题交给它，它会按团队手册做。',
    promptLabel: '智能体接入提示词', copy: '复制提示词', copied: '已复制', serverLabel: 'Busabase 地址', serverHint: '私有化部署时，改成你们自己的地址。',
    trySay: '接好之后可以这样说', mcpNote: '智能体不能运行命令？用 MCP 接入：', permissionTitle: '你的智能体能看到什么', permissionBody: '智能体用你的账号登录，只能看到你能看到的表。只对管理层开放的表，对它来说在搜索和任何地方都不存在。',
    guideTitle: '这个工作台怎么用', loopTitle: '工作流程', askTitle: '你可以对智能体说', boundaryTitle: '这个应用不做什么', runtimeTitle: '连接',
    loop: ['开完会，把转写交给自己的智能体。', '智能体找到对应项目（绝不重复建），写入纪要、关键发现和待跟进，并更新项目。', '同事用各自的智能体查询任何项目，得到的是同一份共享信息。', '管理层打开「本周总览」：看了哪些项目、关键发现、哪些需要跟进。', '负责人随手关闭跟进事项；每周的管理层周报把这一周收尾。'],
    provider: '数据来源', runtime: '运行环境',
    permission: '当前账号无法读取这个工作台。', setup: '这个工作台没有完整安装。', error: '无法读取这个工作台。',
    hintHosted: '正在 Busabase 内以你的账号运行。请确认这个文件夹是完整安装的，并且你有读取权限。',
    hintStandalone: '正在独立运行。请在设置页连接 Busabase，或在 Busabase 里打开这个应用。',
    hintDevProxy: '正在独立运行并使用服务端凭据。请检查它的空间和权限。',
    hintUnknown: '无法判断应用运行在哪里。请刷新，或从 Busabase 中打开。',
  },
};

/**
 * The prompt a person pastes into their own agent. It names this space's
 * folder and playbooks, and spells out the two-turn sign-in so the agent never
 * asks for a pasted key.
 */
export function connectionPrompt(locale, { baseUrl, folderName, space = null }) {
  const cli = 'npx --yes busabase-cli@latest';
  if (locale === 'zh-CN') {
    return `我们投资团队用 Busabase 做 Deal Flow 的共享空间。请把你接入进去，然后按团队手册工作。

1. 连接（只需一次）
   - Busabase 地址：${baseUrl}（运行命令前先设置 BUSABASE_BASE_URL=${baseUrl}）
   - 运行 \`${cli} login --no-wait --output json\`，把返回的 verification_url 原样发给我，然后停下来等我。
   - 我在浏览器里用自己的账号批准后会告诉你，你再运行 \`${cli} login --resume-code <返回的 resume_code>\`。
   - 团队空间：${space ? `「${space.name}」（空间 ID：${space.id}）` : `有「${folderName}」文件夹的那个空间（用 \`${cli} space list\` 找）`}。本次会话里每条命令都加 \`--space-id ${space ? space.id : '<空间 ID>'}\`，不要改我的默认空间。
2. 安装 Busabase 通用技能：运行 \`${cli} skill install\`，以后每次会话都会自动加载。
3. 读团队手册：运行 \`${cli} playbooks search --query "busa-dealflow" --output json\`，打开「${folderName}」文件夹里的 \`busa-dealflow\` 技能并读完。整理会议用 \`dealflow-meeting-notes\`，写周报用 \`dealflow-weekly-digest\`。
4. 以后的规矩：
   - 一家公司只有一条项目记录，写之前先按项目名、公司全称和别名查重。
   - 你用的是我的账号和权限。查不到的表就是我没有权限，不要绕过，也不要向我要别人的密钥。
   - 不要把基金回报、被投企业财务等敏感数据写进共享表。
   - 每次写入后把记录链接发给我。

接好以后用一句话告诉我：连上了哪个空间，能看到「${folderName}」里的哪几张表。`;
  }
  return `Our investment team uses Busabase as the shared space for deal flow. Connect yourself to it, then work by the team playbook.

1. Connect (once)
   - Busabase address: ${baseUrl} (set BUSABASE_BASE_URL=${baseUrl} before running commands)
   - Run \`${cli} login --no-wait --output json\`, send me the verification_url exactly as returned, then stop and wait.
   - After I approve it in my browser with my own account, run \`${cli} login --resume-code <the resume_code>\`.
   - Team space: ${space ? `"${space.name}" (space id ${space.id})` : `the one that has the "${folderName}" folder (find it with \`${cli} space list\`)`}. Add \`--space-id ${space ? space.id : '<space id>'}\` to every command in this session; do not change my default space.
2. Install the general Busabase skill: \`${cli} skill install\`, so it loads in every later session.
3. Read the team playbook: run \`${cli} playbooks search --query "busa-dealflow" --output json\`, open the \`busa-dealflow\` skill in the "${folderName}" folder and read it whole. Use \`dealflow-meeting-notes\` for meetings and \`dealflow-weekly-digest\` for the weekly digest.
4. House rules:
   - One company, one project record. Before writing, check for duplicates by name, legal name and aliases.
   - You act with my account and my permissions. A table you cannot find is one I may not see — never work around it, and never ask me for someone else's key.
   - Never write fund returns or portfolio-company financials into the shared tables.
   - Send me the link to every record you write.

When you are connected, tell me in one sentence which space you reached and which tables of "${folderName}" you can see.`;
}

/** Example sentences shown under the prompt. */
export const trySayExamples = {
  en: ['Turn this meeting transcript into minutes and link it to the project.', 'Where are we with Yunshan? What is still open?', 'What did the team see this week?', 'Mark “order list” as done — they sent it today.'],
  'zh-CN': ['把这份会议转写整理成纪要，关联到对应项目。', '云杉智造最近聊到哪了？还有哪些没跟进？', '本周团队看了哪些项目？', '把「交付清单」那条跟进标记完成，对方今天发过来了。'],
};
