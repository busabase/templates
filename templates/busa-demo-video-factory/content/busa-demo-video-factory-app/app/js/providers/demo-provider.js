// Deterministic demo data for `?demo=1` — never reads live Busabase state.
// Ported verbatim (same ids, same titles, same bilingual copy) from the
// retired app/server/demo.ts's DEMO_VIDEOS/DEMO_SHOTS (videos 3-6 and their
// shots were added later so every pipeline stage has a row), run through
// video-model.js's normalize functions so the shape matches exactly what
// busabase-provider.js produces from real records.
import {
  buildState,
  countBy,
  normalizeShotRow,
  normalizeVideoRow,
  SHOT_STATUSES,
  shotsForVideo,
  VIDEO_STATUSES,
  withShotRollup,
} from "../video-model.js?v=0.1.0";

const RAW_DEMO_VIDEOS = [
  {
    __recordId: "demo-video-1",
    title: "视频1：Busabase 是 AI Coder 的『小白宝箱』",
    series: "aicoder",
    purpose: "讲清楚 Busabase 对「每天在 Vibe Coding、用 AI 写各种 APP」的人来说，怎么让他们更简单。",
    hook: "你是不是也每天在 Vibe Coding，用 AI 写各种各样的 APP？",
    pain_point: "代码 AI 一会儿就写完了，UI 你甚至都不用看。可一到要自己搭一个数据库，反而比写代码本身还麻烦。",
    concept: "Busabase = AI coder 的小白宝箱：Spaces + 审批优先的知识库工作台。",
    status: "needs_review",
    verified_claims: '| 原草稿说法 | 代码库实际情况 |\n| --- | --- |\n| "钱包" | 实际是 Vault |',
    hyperframe_path: "",
    final_video_url: "",
    owner: "you",
  },
  {
    __recordId: "demo-video-2",
    title: "视频2：Busabase 作为多 Agent / 多 APP 的 Single Source of Truth",
    series: "aicoder",
    purpose: "解决多 Agent 各自为政的数据割裂感。",
    hook: "你会不会觉得，用了很多 Agent，也做了很多 APP，却总有一种数据割裂感？",
    pain_point: "Agent 巨多，但各自为政，像极了公司里每个部门之间的墙。",
    concept: "Single Source of Truth：Busabase 给 AI Agent 群提供这样一个中心。",
    status: "approved",
    verified_claims: "| 原草稿说法 | 核实结果 |\n| --- | --- |\n| 跨 Agent 共享 | 合理，中心化数据库 |",
    hyperframe_path: "videos/busabase-cloud/single-source-of-truth",
    final_video_url: "",
    owner: "you",
  },
  // Added so every pipeline stage has a row in the demo.
  {
    __recordId: "demo-video-3",
    title: "视频3：一条 Change Request 走完审批",
    series: "workflow",
    purpose: "演示 Agent 写入、人审核、合并的完整一圈。",
    hook: "你敢让 AI 直接改你的客户表吗？",
    pain_point: "Agent 写错一行数据，没人知道是谁改的、什么时候改的。",
    concept: "每次写入都是一条可审核、可回滚的 Change Request。",
    status: "recording",
    verified_claims: "| 原草稿说法 | 核实结果 |\n| --- | --- |\n| 可回滚 | 支持 revert 到任意 commit |",
    hyperframe_path: "videos/busabase-cloud/change-request-loop",
    final_video_url: "",
    owner: "ai",
  },
  {
    __recordId: "demo-video-4",
    title: "视频4：AirApp 三分钟上线一个内部工具",
    series: "airapp",
    purpose: "展示从模板安装到 AirApp 可用的速度。",
    hook: "做一个内部工具，要不要先招个前端？",
    pain_point: "内部工具永远排不上开发排期。",
    concept: "装一个模板，AirApp 带着表和界面一起出现。",
    status: "post_production",
    verified_claims: "",
    hyperframe_path: "videos/busabase-cloud/airapp-three-minutes",
    final_video_url: "",
    owner: "ai",
  },
  {
    __recordId: "demo-video-5",
    title: "视频5：给 Agent 一个共享网盘",
    series: "aicoder",
    purpose: "说明 Drive 让多个 Agent 读写同一份文件。",
    hook: "你的 Agent 之间是怎么传文件的？",
    pain_point: "复制粘贴、上传下载，文件版本越传越乱。",
    concept: "Busabase Drive：Agent 和人看到的是同一份文件。",
    status: "done",
    verified_claims: "| 原草稿说法 | 核实结果 |\n| --- | --- |\n| 版本历史 | 每次写入都有 commit |",
    hyperframe_path: "videos/busabase-cloud/shared-drive",
    final_video_url: "https://example.com/videos/shared-drive",
    owner: "you",
  },
  {
    __recordId: "demo-video-6",
    title: "视频6：Skills 让 Agent 知道怎么用你的数据",
    series: "workflow",
    purpose: "解释 Skill 节点是给 Agent 读的操作手册。",
    hook: "Agent 第一次打开你的工作区，它怎么知道该干嘛？",
    pain_point: "每次都要重新解释一遍表结构和规矩。",
    concept: "把规矩写进 Skill，Agent 进来先读手册。",
    status: "idea",
    verified_claims: "",
    hyperframe_path: "",
    final_video_url: "",
    owner: "you",
  },
];

const RAW_DEMO_SHOTS = [
  {
    __recordId: "demo-shot-1-1",
    title: "视频1 · 镜头1",
    video: "demo-video-1",
    shot_number: 1,
    timecode: "0:00-0:05",
    scene: "黑屏文字 / 提问式钩子",
    code_reference: "—",
    script_line: "你是不是也每天在 Vibe Coding，用 AI 写各种各样的 APP？",
    note: "钩子，纯提问",
    recording_status: "recorded",
  },
  {
    __recordId: "demo-shot-1-2",
    title: "视频1 · 镜头2",
    video: "demo-video-1",
    shot_number: 2,
    timecode: "0:05-0:15",
    scene: "痛点场景快剪：一堆代码文件滚动 + 手忙脚乱配置数据库",
    code_reference: "—",
    script_line: "代码 AI 一会儿就写完了，UI 你甚至都不用看。可一到要自己搭一个数据库，反而比写代码本身还麻烦。",
    note: "开场控制在 10~15 秒内",
    recording_status: "pending",
  },
  {
    __recordId: "demo-shot-1-3",
    title: "视频1 · 镜头3",
    video: "demo-video-1",
    shot_number: 3,
    timecode: "0:15-0:20",
    scene: "产品揭晓：Busabase Logo",
    code_reference: "—",
    script_line: "这时候，就需要 Busabase：一个专门给 AI coder 用的小白宝箱。",
    note: "",
    recording_status: "needs_reshoot",
  },
  {
    __recordId: "demo-shot-2-1",
    title: "视频2 · 镜头1",
    video: "demo-video-2",
    shot_number: 1,
    timecode: "0:00-0:15",
    scene: "黑屏文字 / 多个 Agent 图标 + APP 图标快闪",
    code_reference: "—",
    script_line: "你会不会觉得，用了很多 Agent，也做了很多 APP，却总有一种数据割裂感？",
    note: "开场痛点",
    recording_status: "recorded",
  },
  {
    __recordId: "demo-shot-2-2",
    title: "视频2 · 镜头6",
    video: "demo-video-2",
    shot_number: 6,
    timecode: "1:10-1:30",
    scene: "终端里敲 /busabase，展示 SKILL.md 的 Connect 流程",
    code_reference: ".agents/skills/busabase/SKILL.md",
    script_line: "用一个 skill，/busabase，把 Agent 接入一个 Busabase 工作区。",
    note: "真实存在的 Connect 步骤",
    recording_status: "recorded",
  },
  {
    __recordId: "demo-shot-3-1",
    title: "视频3 · 镜头1",
    video: "demo-video-3",
    shot_number: 1,
    timecode: "0:00-0:08",
    scene: "客户表里一行数据被悄悄改掉",
    code_reference: "—",
    script_line: "你敢让 AI 直接改你的客户表吗？",
    note: "钩子",
    recording_status: "recorded",
  },
  {
    __recordId: "demo-shot-3-2",
    title: "视频3 · 镜头2",
    video: "demo-video-3",
    shot_number: 2,
    timecode: "0:08-0:30",
    scene: "Agent 提交 Change Request，审核页显示字段 diff",
    code_reference: "apps/busabase/src/domains/change-requests",
    script_line: "Agent 的每次写入，都会先变成一条 Change Request。",
    note: "录屏要能看清 diff",
    recording_status: "pending",
  },
  {
    __recordId: "demo-shot-3-3",
    title: "视频3 · 镜头3",
    video: "demo-video-3",
    shot_number: 3,
    timecode: "0:30-0:45",
    scene: "点击合并，记录历史出现新 commit",
    code_reference: "—",
    script_line: "你点一下合并，它才真正写进去；写错了，一键回滚。",
    note: "",
    recording_status: "needs_reshoot",
  },
  {
    __recordId: "demo-shot-4-1",
    title: "视频4 · 镜头1",
    video: "demo-video-4",
    shot_number: 1,
    timecode: "0:00-0:10",
    scene: "模板库里点安装",
    code_reference: "—",
    script_line: "做一个内部工具，要不要先招个前端？",
    note: "",
    recording_status: "recorded",
  },
  {
    __recordId: "demo-shot-4-2",
    title: "视频4 · 镜头2",
    video: "demo-video-4",
    shot_number: 2,
    timecode: "0:10-0:40",
    scene: "AirApp 打开，表格和界面已经就绪",
    code_reference: "—",
    script_line: "装一个模板，表和界面一起出现。",
    note: "",
    recording_status: "recorded",
  },
  {
    __recordId: "demo-shot-5-1",
    title: "视频5 · 镜头1",
    video: "demo-video-5",
    shot_number: 1,
    timecode: "0:00-0:12",
    scene: "两个 Agent 窗口并排，读写同一份文件",
    code_reference: "—",
    script_line: "你的 Agent 之间是怎么传文件的？",
    note: "",
    recording_status: "recorded",
  },
];

const isStatus = (key, row, status) =>
  !status || status === "all" || (key === "videos" ? row.status : row.recording_status) === status;

function demoRows() {
  const shots = RAW_DEMO_SHOTS.map(normalizeShotRow);
  return { videos: withShotRollup(RAW_DEMO_VIDEOS.map(normalizeVideoRow), shots), "video-shots": shots };
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const videos = RAW_DEMO_VIDEOS.map(normalizeVideoRow);
    const shots = RAW_DEMO_SHOTS.map(normalizeShotRow);
    return {
      ...buildState(videos, shots, { demo: true }),
      data_provider: "demo",
      onboarding: { completed: true, config_version: "demo" },
      pagination: { videos: null, "video-shots": null },
      totals: { videos: videos.length, "video-shots": shots.length },
      statusCounts: {
        videos: countBy(videos, "status", VIDEO_STATUSES),
        "video-shots": countBy(shots, "recording_status", SHOT_STATUSES),
      },
      warnings: [],
    };
  },

  async fetchPage(key, _cursor, { status } = {}) {
    return { rows: demoRows()[key].filter((row) => isStatus(key, row, status)), nextCursor: null };
  },

  async getRecord(key, recordId) {
    return demoRows()[key].find((row) => row.id === recordId) || null;
  },

  async fetchShotsForVideo(videoId) {
    return { rows: shotsForVideo(demoRows()["video-shots"], videoId), nextCursor: null };
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
