// Sample rows for one fictional investment team. Every company, person and
// conversation here is invented (合成演示数据), and none of it carries fund
// returns or portfolio-company financials. `scripts/sync-content.mjs` writes
// these into `content/<base>/records.ndjson` (what a fresh install opens on),
// and `?demo=1` reads the same rows, so the two never tell different stories.
//
// Relation values name another row's `key`. Install turns them into real record
// ids; the demo provider does the same, so the app always resolves ids itself.
//
// The week of 2026-11-02 is "this week" for the sample (asOf 2026-11-05).

const SYNTHETIC = '合成演示数据（虚构公司）';

const deals = [
  { key: 'deal-yunshan', fields: {
    name: '云杉智造', company: '云杉智造（苏州）科技有限公司（虚构）', aliases: '云杉, 云杉智能, Yunshan', stage: 'diligence', sector: 'robotics', round: 'A 轮', owner: '林晓', team: 'tech',
    'one-liner': '给中小工厂用的柔性装配机器人和产线调度软件，按工位按月订阅。',
    'latest-finding': '两家汽车零部件客户进入二期部署；交付周期从约 6 周缩短到约 3 周（创始人口述，待客户访谈核实）。',
    'next-step': '约两家工厂客户做现场访谈', 'next-step-due': '2026-11-07', 'last-meeting-on': '2026-10-28', source: SYNTHETIC } },
  { key: 'deal-chengguan', fields: {
    name: '澄观数据', company: '澄观数据智能（杭州）有限公司（虚构）', aliases: '澄观, Chengguan Data', stage: 'first-meeting', sector: 'ai-infra', round: 'Pre-A', owner: '周可', team: 'tech',
    'one-liner': '帮企业把散落在各系统里的业务数据整理成智能体可直接查询的数据目录。',
    'latest-finding': '已有 3 家试点客户，其中 1 家是券商；团队承认权限模型还停留在表级。',
    'next-step': '发 NDA 和资料清单', 'next-step-due': '2026-11-06', 'last-meeting-on': '2026-11-03', source: SYNTHETIC } },
  { key: 'deal-lanzhou', fields: {
    name: '澜舟医疗', company: '澜舟医疗科技（上海）有限公司（虚构）', aliases: '澜舟, Lanzhou Med', stage: 'ic', sector: 'healthcare', round: 'B 轮', owner: '陈思远', team: 'healthcare',
    'one-liner': '面向基层医院的肺结节影像辅助诊断软件，已拿到二类证。',
    'latest-finding': '投决会已开，结论只在管理层表里；对外口径：进入条款沟通。',
    'next-step': '整理条件清单发给创始人', 'next-step-due': '2026-11-08', 'last-meeting-on': '2026-11-04', source: SYNTHETIC } },
  { key: 'deal-qimu', fields: {
    name: '栖木咖啡', company: '栖木餐饮管理（深圳）有限公司（虚构）', aliases: '栖木, Qimu Coffee', stage: 'passed', sector: 'consumer', round: '天使轮', owner: '何嘉', team: 'consumer',
    'one-liner': '社区精品咖啡连锁，主打自有烘焙。',
    'latest-finding': '扩店节奏依赖加盟，与我们的消费方向不匹配，已婉拒。',
    'next-step': '保持联系，半年后回访', 'last-meeting-on': '2026-10-30', source: SYNTHETIC } },
  { key: 'deal-xingce', fields: {
    name: '星策', company: '星策软件（北京）有限公司（虚构）', aliases: '星策软件, Xingce', stage: 'portfolio', sector: 'enterprise', round: 'B 轮（已投）', owner: '王立衡', team: 'tech',
    'one-liner': '面向制造业的销售与服务协同软件，已投企业。',
    'latest-finding': '新任 CTO 已到岗；渠道合作是下个季度的重点，创始人请我们引荐。',
    'next-step': '引荐两家渠道伙伴', 'next-step-due': '2026-11-15', 'last-meeting-on': '2026-11-04', source: SYNTHETIC } },
  { key: 'deal-beichen', fields: {
    name: '北辰算力', company: '北辰算力科技（成都）有限公司（虚构）', aliases: '北辰, Beichen Compute', stage: 'sourcing', sector: 'ai-infra', round: '种子轮', owner: '何嘉', team: 'tech',
    'one-liner': '为中小模型团队提供按需推理集群调度。',
    'latest-finding': '收到 BP，尚未见团队。',
    'next-step': '初筛 BP，决定是否约首次会议', 'next-step-due': '2026-11-06', 'last-meeting-on': '2026-11-02', source: SYNTHETIC } },
];

const meetings = [
  { key: 'mtg-yunshan-1', fields: {
    title: '2026-10-14 · 云杉智造 · 首次会议', deal: 'deal-yunshan', 'held-on': '2026-10-14', kind: 'intro', phase: 'pre', attendees: '林晓；云杉创始人兼 CEO 张一帆（虚构）', 'recorded-by': '林晓', 'logged-via': 'Codex',
    summary: '- 创始团队来自工业自动化公司，做了 4 年柔性装配。\n- 产品：机械臂工作站 + 产线调度软件，按工位按月订阅。\n- 目前客户集中在长三角汽车零部件和 3C 组装厂。',
    highlights: '- 订阅制在中小工厂接受度比预期高。\n- 交付依赖现场工程师，规模化是关键疑问。',
    questions: '- 每个工位的交付人力到底要多少？\n- 客户是否会续订？' } },
  { key: 'mtg-yunshan-2', fields: {
    title: '2026-10-28 · 云杉智造 · 跟进会议', deal: 'deal-yunshan', 'held-on': '2026-10-28', kind: 'follow-up', phase: 'pre', attendees: '林晓、王立衡；张一帆（虚构）', 'recorded-by': '林晓', 'logged-via': 'Codex',
    summary: '- 合伙人一起听了产品演示和交付流程。\n- 创始人介绍了新版调度软件，部署从现场调试改为远程配置为主。\n- 双方同意进入立项尽调。',
    highlights: '- 远程配置让交付人力明显下降（创始人口述）。\n- 合伙人关注：核心算法团队稳定性。',
    questions: '- 需要客户侧验证交付周期。\n- 核心算法负责人是否签了长期协议？' } },
  { key: 'mtg-chengguan-1', fields: {
    title: '2026-11-03 · 澄观数据 · 首次会议', deal: 'deal-chengguan', 'held-on': '2026-11-03', kind: 'intro', phase: 'pre', attendees: '周可；澄观 CEO 许宁（虚构）', 'recorded-by': '周可', 'logged-via': 'WorkBuddy',
    summary: '- 产品把企业 ERP、CRM、文档里的数据整理成一个数据目录，供智能体查询。\n- 3 家试点客户，其中 1 家券商。\n- 计划年底前开 Pre-A。',
    highlights: '- 正好踩中「每个员工都有智能体，但数据不共享」这个痛点。\n- 权限模型目前只到表级，金融客户会追问。',
    questions: '- 私有化部署的交付成本？\n- 与大厂数据平台的差异化？' } },
  { key: 'mtg-lanzhou-dd', fields: {
    title: '2026-10-21 · 澜舟医疗 · 尽调访谈', deal: 'deal-lanzhou', 'held-on': '2026-10-21', kind: 'diligence', phase: 'during', attendees: '陈思远；两家合作医院影像科主任（虚构）', 'recorded-by': '陈思远', 'logged-via': 'Claude Code',
    summary: '- 访谈两家县级医院影像科：日常阅片量大，软件主要用于初筛提示。\n- 医生认可减少漏诊，但对假阳性提示有抱怨。',
    highlights: '- 医生愿意持续使用，前提是假阳性继续下降。\n- 采购由医院信息科主导，决策周期长。',
    questions: '- 下一版算法的假阳性改进计划？' } },
  { key: 'mtg-lanzhou-ic', fields: {
    title: '2026-11-04 · 澜舟医疗 · 投决会', deal: 'deal-lanzhou', 'held-on': '2026-11-04', kind: 'ic', phase: 'during', attendees: '王立衡、陈思远及投委会成员', 'recorded-by': '陈思远', 'logged-via': '手动',
    summary: '- 投决会已召开，项目组汇报了尽调结论。\n- 结论与合伙人意见记录在「投决会意见（仅管理层）」中，此处不展开。',
    highlights: '- 进入条款沟通阶段。',
    questions: '- 无（详见管理层表）。' } },
  { key: 'mtg-qimu-1', fields: {
    title: '2026-10-09 · 栖木咖啡 · 首次会议', deal: 'deal-qimu', 'held-on': '2026-10-09', kind: 'intro', phase: 'pre', attendees: '何嘉；栖木创始人（虚构）', 'recorded-by': '何嘉', 'logged-via': 'Codex',
    summary: '- 社区精品咖啡，自有烘焙工厂。\n- 计划通过加盟快速扩张。',
    highlights: '- 产品口碑好，复购来自社区熟客。',
    questions: '- 加盟模式下的品控？' } },
  { key: 'mtg-qimu-2', fields: {
    title: '2026-10-30 · 栖木咖啡 · 跟进会议', deal: 'deal-qimu', 'held-on': '2026-10-30', kind: 'follow-up', phase: 'pre', attendees: '何嘉、王立衡；栖木创始人（虚构）', 'recorded-by': '何嘉', 'logged-via': 'Codex',
    summary: '- 讨论了加盟计划细节。\n- 内部判断：扩张依赖加盟，与我们的消费方向不匹配。',
    highlights: '- 决定婉拒，半年后回访。',
    questions: '' } },
  { key: 'mtg-xingce-q3', fields: {
    title: '2026-09-25 · 星策 · 投后例会', deal: 'deal-xingce', 'held-on': '2026-09-25', kind: 'board', phase: 'post', attendees: '王立衡；星策管理层（虚构）', 'recorded-by': '王立衡', 'logged-via': 'Claude Code',
    summary: '- 季度例会：产品路线、招聘和渠道计划。\n- CTO 候选人进入终面。',
    highlights: '- 招聘是当前最大瓶颈。',
    questions: '- CTO 何时到岗？' } },
  { key: 'mtg-xingce-nov', fields: {
    title: '2026-11-04 · 星策 · 投后例会', deal: 'deal-xingce', 'held-on': '2026-11-04', kind: 'board', phase: 'post', attendees: '王立衡、何嘉；星策 CEO、CTO（虚构）', 'recorded-by': '何嘉', 'logged-via': 'Claude Code',
    summary: '- 新任 CTO 已到岗，介绍了技术路线图初稿。\n- 下季度重点是渠道合作，希望我们引荐渠道伙伴。',
    highlights: '- CTO 到岗，招聘瓶颈解除。\n- 渠道合作需要我们帮忙引荐。',
    questions: '- 技术路线图的里程碑还没定。' } },
  { key: 'mtg-xingce-pack', fields: {
    title: '2026-11-04 · 星策 · 董事会材料归档', deal: 'deal-xingce', 'held-on': '2026-11-04', kind: 'document', phase: 'post', attendees: '', 'recorded-by': '何嘉', 'logged-via': 'Claude Code',
    summary: '- 归档本季度董事会材料（示例中不附文件）。\n- 与 9 月例会相比，新增 CTO 到岗与渠道计划两节。',
    highlights: '- 材料里的经营数字未录入共享表（按规则只留原件）。',
    questions: '' } },
  { key: 'mtg-beichen-bp', fields: {
    title: '2026-11-02 · 北辰算力 · 收到 BP', deal: 'deal-beichen', 'held-on': '2026-11-02', kind: 'document', phase: 'pre', attendees: '', 'recorded-by': '何嘉', 'logged-via': 'WorkBuddy',
    summary: '- 收到北辰算力 BP（示例中不附文件），来源为朋友推荐。\n- 推理集群调度，目标客户是中小模型团队。',
    highlights: '- 方向与澄观数据同属 AI 基础设施，可以一起看。',
    questions: '- 团队背景待核实。' } },
];

const followups = [
  { key: 'fu-yunshan-visits', fields: { title: '约两家工厂客户做现场访谈', deal: 'deal-yunshan', meeting: 'mtg-yunshan-2', owner: '林晓', 'due-on': '2026-11-07', status: 'open', priority: 'high' } },
  { key: 'fu-yunshan-list', fields: { title: '拿到近两季度的交付项目清单', deal: 'deal-yunshan', meeting: 'mtg-yunshan-2', owner: '林晓', 'due-on': '2026-11-03', status: 'open', priority: 'normal' } },
  { key: 'fu-chengguan-nda', fields: { title: '发 NDA 和资料清单', deal: 'deal-chengguan', meeting: 'mtg-chengguan-1', owner: '周可', 'due-on': '2026-11-06', status: 'open', priority: 'normal' } },
  { key: 'fu-lanzhou-terms', fields: { title: '整理条件清单发给创始人', deal: 'deal-lanzhou', meeting: 'mtg-lanzhou-ic', owner: '陈思远', 'due-on': '2026-11-08', status: 'in-progress', priority: 'high' } },
  { key: 'fu-lanzhou-legal', fields: { title: '启动法务尽调', deal: 'deal-lanzhou', meeting: 'mtg-lanzhou-ic', owner: '陈思远', 'due-on': '2026-11-12', status: 'open', priority: 'normal' } },
  { key: 'fu-xingce-channels', fields: { title: '引荐两家渠道伙伴', deal: 'deal-xingce', meeting: 'mtg-xingce-nov', owner: '王立衡', 'due-on': '2026-11-15', status: 'open', priority: 'normal' } },
  { key: 'fu-xingce-roadmap', fields: { title: '跟进 CTO 的技术路线图里程碑', deal: 'deal-xingce', meeting: 'mtg-xingce-q3', owner: '何嘉', 'due-on': '2026-10-31', status: 'open', priority: 'normal' } },
  { key: 'fu-beichen-screen', fields: { title: '初筛 BP，决定是否约首次会议', deal: 'deal-beichen', meeting: 'mtg-beichen-bp', owner: '何嘉', 'due-on': '2026-11-06', status: 'open', priority: 'low' } },
  { key: 'fu-qimu-decline', fields: { title: '给栖木发婉拒邮件', deal: 'deal-qimu', meeting: 'mtg-qimu-2', owner: '何嘉', 'due-on': '2026-10-31', status: 'done', priority: 'normal', 'done-on': '2026-10-31', notes: '已发，约定半年后回访。' } },
  { key: 'fu-xingce-board-date', fields: { title: '确认下次董事会日期', deal: 'deal-xingce', meeting: 'mtg-xingce-q3', owner: '王立衡', 'due-on': '2026-11-03', status: 'done', priority: 'normal', 'done-on': '2026-11-03', notes: '定在 12 月第二周。' } },
];

const digests = [
  { key: 'digest-w44', fields: {
    title: '2026-W44 投资团队周报', 'period-start': '2026-10-26', 'period-end': '2026-11-01', status: 'final', 'projects-seen': 2, 'meetings-held': 2,
    body: '## 本周看了哪些项目\n- **云杉智造**（立项尽调，林晓）：跟进会议，合伙人参加，同意进入尽调。\n- **栖木咖啡**（已放弃，何嘉）：跟进会议后决定婉拒。\n\n## 关键发现\n- 云杉：远程配置让交付人力明显下降，待客户访谈核实。\n\n## 阶段变化\n- 云杉智造：初步接触 → 立项尽调\n- 栖木咖啡：初步接触 → 已放弃',
    'for-leadership': '- 云杉的核心算法团队稳定性需要在尽调里重点看。' } },
];

// The leadership-only table's sample row is deliberately NOT in this file. The
// AirApp's files are readable — and greppable — by every member, so anything
// here would be visible to people the IC table is hidden from. The package's
// sample IC row lives in `scripts/sample-ic-notes.mjs` and only reaches the
// restricted Base itself at install time.
const icNotes = [
  { key: 'ic-demo-placeholder', fields: {
    title: '演示模式 · 投决结论示例', deal: 'deal-lanzhou', 'decided-on': '2026-11-04', decision: 'conditional',
    'partners-view': '演示模式不包含投决内容。安装后，这张表只对被授权的管理层可见。' } },
];

export const demoRecords = { deals, meetings, followups, digests, 'ic-notes': icNotes };
