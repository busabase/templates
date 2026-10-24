# 为 Busabase Templates 做贡献

[English](CONTRIBUTING.md)

本文与英文版内容相同；两者不一致时，以英文版为准。

这份指南同时写给两位读者：想改进模板目录的人，以及这个人请来干活的编程智能体。如果你是智能体：动手之前先读完本文和
[`AGENTS.md`](AGENTS.md)，命令照原样执行，拉取请求（PR）用英文写。

不熟悉 GitHub 也没关系。直接跳到[交给你的智能体](#交给你的智能体)，复制提示词，把文件交给你的智能体就行。

## 1. 你可以贡献什么

| 类型 | 改动内容 | 看哪一节 |
| --- | --- | --- |
| **给已有模板加媒体**（最常见） | `templates/` 里已有模板的演示视频、截图或封面 | [第 2 节](#2-添加或替换媒体) |
| **新模板** | `templates/` 下一个全新的目录 | [第 3 节](#3-贡献新模板) |

两种都以同样的方式收尾：向 `busabase/templates` 提一个 PR，由 Busabase 维护者审核并合并（[第 4 节](#4-提交)）。

## 2. 添加或替换媒体

### 一次性准备

- **Git 和 Git LFS。** 安装 Git LFS（`brew install git-lfs`、`apt install git-lfs`，或者从
  <https://git-lfs.com> 下载安装包；Git for Windows 已自带），然后运行一次：
  ```bash
  git lfs install
  ```
  视频用 LFS 存储（见[用 Git LFS 提交](#用-git-lfs-提交)）。没装 LFS 时，Git 会悄悄把整个文件提交进仓库。
- **Node.js 24.18 或更高版本。** `busabase-cli` 需要它。
- 处理视频要 **ffmpeg**；生成封面要 **Python 3 和 Pillow**（需支持 WebP）。
- 一个 GitHub 账号。[`gh`](https://cli.github.com) 命令行工具可选，有了它，fork 仓库和提 PR 各只要一条命令。

### 获取仓库

先确认你能不能直接推送到 `busabase/templates`：

```bash
gh repo view busabase/templates --json viewerPermission --jq .viewerPermission
```

输出 `ADMIN`、`MAINTAIN` 或 `WRITE`，说明你可以直接往这个仓库推分支。其他情况（大多数贡献者都是这样）就在 fork 上工作：

```bash
gh repo fork busabase/templates --clone=false
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/<你的-github-用户名>/templates.git
cd templates
git remote add upstream https://github.com/busabase/templates.git
git fetch upstream
git checkout --no-track -b feat/<name>-<what> upstream/main
```

有写权限时，用同样的方式克隆 `https://github.com/busabase/templates.git`，然后运行
`git checkout --no-track -b feat/<name>-<what> origin/main`。分支按改动命名，比如 `feat/busa-crm-zh-CN-film`。

`GIT_LFS_SKIP_SMUDGE=1` 让其他模板的视频只以很小的指针文件存在，不会全部下载。想看某个已有视频时：

```bash
git lfs pull --include="templates/<name>/assets/recordings/*"
```

`<name>` 始终是模板的目录名，比如 `busa-crm`。

### 文件放在哪里

```
templates/<name>/
├── busabase.json                  声明画廊展示哪些文件
└── assets/
    ├── screenshots/
    │   ├── cover.webp             英文封面，永远排第一
    │   ├── <view>.webp            英文截图
    │   ├── cover-zh-CN.webp       中文封面
    │   └── <view>-zh-CN.webp      中文截图
    └── recordings/
        ├── <name>.mp4             英文视频（默认）
        └── <name>-zh-CN.mp4       中文视频
```

文件放进目录还不够，要在 `busabase.json` 的 `template` 下声明才会显示：

| 字段 | 内容 |
| --- | --- |
| `template.screenshots` | 英文画廊，封面排第一。没有自己条目的语言都看这一组。 |
| `template.video` | 英文视频。没有自己视频的语言都看这一个。 |
| `template.locales.<locale>.screenshots` | 该语言的画廊。整组替换英文列表，封面排第一。 |
| `template.locales.<locale>.video` | 该语言的视频。 |

### 每种语言一份：`template.locales`

```json
"screenshots": ["assets/screenshots/cover.webp", "assets/screenshots/overview.webp"],
"video": "assets/recordings/busa-rnd.mp4",
"locales": {
  "zh-CN": {
    "screenshots": ["assets/screenshots/cover-zh-CN.webp", "assets/screenshots/overview-zh-CN.webp"],
    "video": "assets/recordings/busa-rnd-zh-CN.mp4"
  }
}
```

- **顶层是英文**，也是兜底。一个模板没有 `ja` 条目时，日文访客看到的是英文媒体。0.98.0 之前的服务器只读顶层。
- **每个字段各自兜底。** 某语言只声明了 `video`，截图就继续用英文的。所以加一条中文视频，不必同时重做中文截图。
- **语言代码必须完全一致**：`zh-CN`、`zh-TW`、`ja`、`ko`、`de`、`fr`、`es`、`pt`、`vi`。`zh` 不等于
  `zh-CN`。不要写 `locales.en`，英文放在顶层。
- **绝不要把 `-zh-CN` 文件放进顶层列表。** 那样其他语言的访客都会看到中文。
- **只有中文版？** 把它声明为 `locales.zh-CN.video`，英文的 `template.video` 保持不动。不要用中文视频覆盖英文文件。
- **替换视频**就是在同一路径覆盖原文件。`busabase.json` 和 `templates.json` 都不会变，这是正常的。

完整可用的例子：`templates/busa-rnd/busabase.json`。

### 格式要求

**视频**

| | 标准 |
| --- | --- |
| 封装、编码 | MP4，H.264 |
| 画面 | 1440×900（16:10）。播放器是 16:10 的框，16:9 的素材会出现黑边。 |
| 像素格式 | `yuv420p`，有限（`tv`）色彩范围。不能是 `yuvj420p`。 |
| 帧率 | 30 fps |
| 音频 | 不要音轨。播放器默认静音，意思要靠画面上的文字传达。如果母版有旁白，去掉音轨就丢了旁白的内容，要告诉做片子的人。 |
| 时长 | 场景片 40–60 秒，这是参考范围，不是硬性限制。现有的短循环片是 8–33 秒。 |
| 文件大小 | 8 MB 以内。busa-rnd 的两条片子约 3.5 MB。 |
| 流式播放 | `+faststart`，不用下载完就能开始播放。 |

能的话，剪辑和导出都用 16:10（1440×900 或 2880×1800）。下面这条命令能把任何母版转成符合标准的文件；真正 16:9
的画面会在上下加黑边。示例输出的是中文版；英文版命名为 `<name>.mp4`。超过 8 MB？把 `-crf` 调到 23–26，不要降分辨率。

```bash
ffmpeg -y -i <你的母版文件> \
  -vf "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2,fps=30" \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -color_range tv -colorspace bt709 \
  -movflags +faststart -an \
  templates/<name>/assets/recordings/<name>-zh-CN.mp4

ffprobe -v error \
  -show_entries stream=codec_name,width,height,pix_fmt,color_range,r_frame_rate:format=duration,size \
  templates/<name>/assets/recordings/<name>-zh-CN.mp4
```

`ffprobe` 应输出 `h264`、`1440`、`900`、`yuv420p`、`tv`、`30/1`，`size` 小于 8000000。

如果母版是把 16:10 的画面放进 16:9 的画框（左右有黑边），上面的命令会再加一圈黑边，而 `ffprobe` 发现不了。先找出真实画面，把输出的
`crop=…` 放到 `-vf` 最前面，比如 `-vf "crop=1728:1080:96:0,scale=1440:900:…"`：

```bash
ffmpeg -i <你的母版文件> -vf cropdetect -frames:v 150 -f null - 2>&1 | grep -o 'crop=[0-9:]*' | tail -1
```

然后从头到尾看一遍成片本身。确认画面里是这个模板，语言和文件名一致。文件会被弄混，这里没有哪条命令能分辨两条片子。看不了视频的智能体，可以改看一张缩略图拼图：

```bash
ffmpeg -i templates/<name>/assets/recordings/<name>-zh-CN.mp4 -vf "fps=1/4,scale=480:-1,tile=4x3" -frames:v 1 ~/sheet.png
```

如果片子拍的是别的模板，停下来问发片子的人，不要提交。

**截图和封面**

- WebP，1440×900，必须是应用真实运行的画面。不能用效果图：截图是对安装效果的承诺，装出来必须做得到。
- 封面靠脚本生成，绝不手工制作；而且要在截图定稿之后再生成，因为封面是用其中一张截图渲染的：
  ```bash
  python3 skills/busabase-template-cover/scripts/generate_cover.py templates/<name>
  python3 skills/busabase-template-cover/scripts/generate_cover.py templates/<name> --locale zh-CN
  python3 skills/busabase-template-cover/scripts/generate_cover.py --check templates/<name>
  python3 skills/busabase-template-cover/scripts/generate_cover.py --check --locale zh-CN templates/<name>
  ```
  渲染规则见 [`skills/busabase-template-cover/SKILL.md`](skills/busabase-template-cover/SKILL.md)。

截图的完整发布标准（覆盖面、品牌、示例数据）在 `busabase-template-creator` 技能里，安装方法见[第 3 节](#3-贡献新模板)。

### 模板视频应该拍什么

模板片目前的方向，简要如下：

- **一句提示词 → Busabase 里的真实场景 → 一个大数字。** 有人请智能体做一件事，模板的真实界面展示发生了什么变化，片子以一个概括效果的数字收尾。
- **时长约 40–60 秒。**
- **前 5 秒能单独当钩子用。** 开头就给出提示词和它的结果，5 秒内切到真实产品画面。不要用缓慢的铺垫开场。
- **审核、审批镜头不是必需的。** 不要拍，除非审核本身就是这个模板的用途（比如 PR 评审）。
- **要真实。** Busabase 里出现的一切，都是真实安装、正在运行的模板，不是效果图。结尾的数字要和画面里的数据对得上。对话或提示词画面如果是摆拍而不是实录，要在画面上标明“示意”。
- **不出现真人数据。** 用模板自带的虚构示例数据。不出现真实客户姓名、邮箱、电话、API 密钥或私人工作区，也不出现其他公司的品牌。
- **本地化版本要完整本地化**：Busabase 和应用都切到该语言。

要拍好几条？先为第一条提 PR，在 PR 里问清楚，再拍其余的。

### 重新生成目录并检查

改动之前先跑一次 `check`，记下原本就有哪些警告。改完之后，在仓库根目录运行：

```bash
npx busabase-cli@latest --version     # 必须是 0.98.0 或更高
npx busabase-cli@latest check ./templates/<name>
npx busabase-cli@latest index . --repo busabase/templates -o templates.json
npx busabase-cli@latest index . --repo busabase/templates -o templates.json --check
node scripts/check-app-writes.mjs
node scripts/check-app-sdk-helpers.mjs
```

- 你改动过的每个模板，`check` 都必须是 **0 个错误**。声明了但磁盘上不存在的文件会报错；语言代码拼错、英文列表里混入本地化文件会报警告。改动之前就存在的警告不归你修。
- `check` 只确认声明的文件存在，不看视频的格式、时长、内容，也不看它是否存在 LFS 里；这些靠 `ffprobe`、你自己看片和 `git lfs status`。
- `index` 重新生成 `templates.json`，也就是模板中心（Template Center）读取的目录。绝不要手改。`@latest`
  很关键：0.98.0 之前的 CLI 会悄悄把 `locales` 从目录里丢掉。`AGENTS.md` 里的示例没写版本号，运行时加上 `@latest`。
- `index --check` 必须输出 `templates.json is up to date`。
- `scripts/check-app-writes.mjs` 会在 AirApp 对用户自己的写入强制送审时报错（写死 `autoMerge: false`，或按运行环境推算这个值）。不要传 `autoMerge`，按 Busabase 返回的结果告诉用户是已保存还是已提交审核。如果某个写入确实要第二个人批准后才能对外发出，就在那一行用 `// allow-forced-review: <原因>` 写明原因。
- `scripts/check-app-sdk-helpers.mjs` 会在 AirApp 又把 `busabase-sdk/airapp` 已经提供的东西写了一遍时报错：本地的 `isQueued`、`fetch("__airapp/runtime")`，或把 SDK 的 “Sent for review.” 那句话原样写出来。请从应用自己打包进来的 `busabase-airapp.js` 里引入 `isAirAppWriteQueued`、调用 `detectAirAppRuntime()`、用 `airAppWriteMessage`。某处副本确实要保留，就在那一行或上一行用 `// allow-private-copy: <原因>` 写明原因。

### 用 Git LFS 提交

```bash
git add templates/<name>/busabase.json templates/<name>/assets templates.json
git status --short                    # 只有你本来要改的文件
git lfs status
```

“Objects to be committed” 下面的每个 `.mp4` 都必须显示 `(LFS: …)`。如果显示的是 `(Git: …)`，说明添加时还没装好 Git LFS。提交前先修好：

```bash
git lfs install
git add --renormalize templates/<name>/assets/recordings/<file>.mp4
git lfs status                        # 现在应显示 (LFS: …)
```

已经提交了？同样运行 `git lfs install` 和 `git add --renormalize`，再运行 `git commit --amend --no-edit`，都要在推送之前完成。

不要改 `.gitattributes`。里面那条不带路径的 `*.mp4` 规则已经覆盖了所有模板的 `assets/recordings/`。

然后提交，接着看[第 4 节](#4-提交)：

```bash
git commit -m "feat(<name>): add zh-CN demo film"
```

## 3. 贡献新模板

本仓库不讲怎么搭应用。这件事归两个已发布的智能体技能管，本文不重复它们的内容：

| 技能 | 负责 |
| --- | --- |
| `busabase-app-creator` | 搭建应用：数据表、AirApp、资源模型、包格式，以及 `check` 检查的契约。 |
| `busabase-template-creator` | 达到本仓库的发布标准：生成的封面、截图覆盖面、不带第三方品牌、示例记录、智能体提示词、`check` 全部通过。 |

从公开的 [`busabase/skills`](https://github.com/busabase/skills) 仓库给你的智能体装上这两个技能：

```bash
npx skills add busabase/skills --skill busabase-app-creator --skill busabase-template-creator -g -y
```

`-g` 把技能装到用户级目录，而不是当前目录，这样本仓库里不会多出 `.agents/`、`.claude/` 或 `skills-lock.json`。`AGENTS.md`
里写的是不带参数的同一条命令；在本仓库里运行时加上 `-g`。如果这些文件还是出现了，不要提交它们。（`npx skills add busabase/skills --list`
可以列出该仓库发布的全部技能；`busabase-cli skill install` 只安装 `busabase` 工作区技能，这里用不到。）

按顺序做：

1. **用 `busabase-app-creator` 搭建。** 它讲了两种起步方式：在 Busabase 工作区里搭好再导出，或者直接在磁盘上写包、再安装验证。导出一个已经搭好的文件夹：
   ```bash
   npx busabase-cli@latest export <folder-slug> -o ./templates/<name> --template
   ```
   CLI 从它当前连接的工作区导出：Busabase Cloud 先运行 `npx busabase-cli@latest login`；第 3 步的本地工作区则加上
   `--base-url http://127.0.0.1:15419`。导出的文件夹第一次跑 `check` 很少能直接通过；`check`
   会逐条指出问题，比如示例记录里还带着工作区 id，或者还没有截图。
2. **遵守本仓库的规则**，见 [`AGENTS.md`](AGENTS.md)：目录结构、哪些文件是生成的，以及那些关键规则（`<name>` 三处一致、每张表最多 50 行示例数据、不提交真实工作区 id、截图必须是真实运行的应用）。
3. **装上并打开。** `check` 全绿不代表应用能用。本地工作区就够了，不需要账号：
   ```bash
   npx busabase@latest server --data ~/.busabase-try
   # 在另一个终端里，从仓库根目录运行：
   npx busabase-cli@latest --base-url http://127.0.0.1:15419 install ./templates/<name>
   ```
   然后打开 <http://127.0.0.1:15419>，实际用一用这个应用。
4. **用 `busabase-template-creator` 达到发布标准**，并按[第 2 节](#2-添加或替换媒体)加上媒体。
5. **检查并生成目录**，和[重新生成目录并检查](#重新生成目录并检查)完全一样。

### 更新所有 AirApp 的 busabase-sdk

每个 AirApp 都在自己的 `package.json` 里固定 `busabase-sdk` 的版本，再用自己的 `build:sdk` 脚本把它打包进
`app/vendor/busabase-*`。所以 SDK 的修复只有在这两样都更新之后才会到达这个应用。一条命令就能对所有应用做完这两件事，
再逐个运行应用自己的 `check` 和 `test`：

```bash
node scripts/update-app-sdk.mjs --check            # 列出不在 npm 最新版上的应用；有就以 1 退出
node scripts/update-app-sdk.mjs                    # 把所有应用更新到 npm 最新版
node scripts/update-app-sdk.mjs --version 0.98.0   # 或更新到指定版本
node scripts/update-app-sdk.mjs templates/busa-crm/content/busa-crm-app   # 或只更新一个应用（支持路径和通配符）
```

它为每个应用打印一行结果（安装、`build:sdk`、`check`、`test`），任何一个失败就以非零退出。已提交的锁文件会被刷新，
不会新写锁文件；`node_modules` 用完即删；只重建 `busabase-*` 打包文件，其他打包进来的库保持已提交的样子。

之后先读一遍 diff，对每个模板跑一遍[重新生成目录并检查](#重新生成目录并检查)，再按第 3 步在本地装几个模板。
`check` 通过不代表应用还能打开。

### 把 AirApp 换成 SDK 的公共方法

从 busabase-sdk 0.99.0 起，SDK 自带了各个模板以前各抄一份的 AirApp 公共代码：运行环境探测、记录的读写、判断写入是否排队，
以及“已提交审核”那句话。应用升到 0.99.0 或更高之后，一条命令就能把它认得的副本换掉：

```bash
node scripts/adopt-sdk-airapp-helpers.mjs --dry-run      # 看会改什么、会留什么
node scripts/adopt-sdk-airapp-helpers.mjs                # 本仓库所有应用
node scripts/adopt-sdk-airapp-helpers.mjs templates/busa-crm/content/busa-crm-app   # 或只处理一个（支持路径和通配符）
node scripts/adopt-sdk-airapp-helpers.mjs --check        # 还有认得的副本时以 1 退出
```

只有形状完全对得上才会改（`records.list` 调用及其“数组或分页”处理、`records.get` 的未找到包装、先查再建或改、`isQueued`、
只剩探测的 `runtime.js`、`savedForReview` 那句话），其余的按“left”列出并写明原因。它从不碰应用自己的业务规则、行格式、字段 slug、
排序和过滤，也不碰界面读取的 `pending` / `change_request_id`。连跑两遍，第二遍什么都不改。
它留下的部分手工收尾，再跑每个应用自己的 `check` 和 `test`，并和让这一步成为可能的 SDK 更新放在同一批里。

## 4. 提交

### 范围：每个 PR 只放一个模板，或一批媒体

- 一个新模板单独一个 PR。
- **一批媒体**指跨多个模板的同一类改动，比如“五个模板的中文视频”。不要把媒体和模板的文案、数据或代码改动混在一起。
- 只动你正在处理的模板，加上重新生成的 `templates.json`。
- 一次 SDK 更新也算一批：`scripts/update-app-sdk.mjs` 在各应用里改动的内容，加上为它弄坏的应用所做的最小修复，别的都不放。
- 把应用换成 SDK 的公共方法也单独算一批：`scripts/adopt-sdk-airapp-helpers.mjs` 改动的内容，加上手工收尾的应用，别的都不放。

### 推送并提 PR

```bash
git push -u origin feat/<name>-<what>
gh pr create --repo busabase/templates --base main \
  --head <你的-github-用户名>:feat/<name>-<what> \
  --title "feat(<name>): add zh-CN demo film" \
  --body-file <仓库外的一个文件>.md
```

有写权限时，把 `--head` 里的 `<你的-github-用户名>:` 去掉。没有 `gh` 的话，在 GitHub 上你 fork 的仓库页面里提 PR。

**标题**：英文，沿用仓库的写法：`feat(busa-crm): add zh-CN demo film`、`feat(templates): add zh-CN demo films for 5 templates`、`feat: add busa-xyz template`。

**正文**：英文，包括：

- 改了什么、为什么改，两三句话。
- 媒体改动每个文件一行：

  | Template | File | Locale | Duration | Size | What it shows |
  | --- | --- | --- | --- | --- | --- |

- `check` 和 `index --check` 的输出。
- 一个审核者能直接播放的链接。GitHub 会在下面这个地址提供你分支上的 LFS 视频：
  `https://media.githubusercontent.com/media/<owner>/templates/<branch>/templates/<name>/assets/recordings/<file>.mp4`。
- 你拿不准的地方。在 PR 里把问题说出来，比自己猜要好。

### 审核者会检查什么

- 范围：只有一个模板或一批媒体，没有无关改动。
- 每个改动过的模板 `check` 都是 0 个错误，`templates.json` 是最新的。
- 每个 `.mp4` 都存在 Git LFS 里：在该分支上运行 `git lfs ls-files` 能列出它。
- 路径和声明：英文文件在顶层，其他语言在 `locales` 下，每组画廊封面排第一。
- 对照你的 `ffprobe` 输出核对格式要求。
- 视频本身：每种语言都完整看一遍。钩子在前 5 秒成立，Busabase 里的画面都是真实的，数字和数据对得上，画面上没有隐私信息或其他品牌。
- 新模板：满足 `busabase-template-creator` 的发布标准，并且能装上、能打开。

### 怎样算“完成”

- Busabase 维护者批准并把 PR 合并进 `main`。不要自己合并。
- 如果被要求修改，在同一个分支上继续推送提交。不要另开新 PR。
- 合并后约一小时内，模板中心（产品内和 busabase.com 上的）都会从 `main` 读到新的 `templates.json`。

### 交给你的智能体

复制下面任意一段，填好尖括号里的内容，再附上或指明你的文件。提示词用什么语言都行，PR 本身仍然用英文。

**添加或替换一条视频：**

```text
先阅读 https://github.com/busabase/templates 里的 CONTRIBUTING.md 和 AGENTS.md，并严格照做。
把这条视频加到模板 <模板名> 上，作为它的 <zh-CN / 英文> 视频：<视频文件路径>。
如果我没有写权限，就先 fork 仓库。对照格式要求检查视频，不符合就重新编码；按指南放到正确位置，在 busabase.json
里声明，重新生成 templates.json，运行检查，并确认 .mp4 存在 Git LFS 里。如果视频拍的不是这个模板，停下来问我。
然后向 busabase/templates 提一个 PR，标题和正文用英文。把 PR 链接和检查输出给我看。不要合并。
```

**一次加好几条视频：** 用上面的提示词，把第二句换成清单：

```text
把下面这些视频作为一批媒体加进去：
- <模板名>，<语言>：<视频文件路径>
- <模板名>，<语言>：<视频文件路径>
```

**新模板：**

```text
先阅读 https://github.com/busabase/templates 里的 CONTRIBUTING.md 和 AGENTS.md，再安装其中提到的技能。
帮我把 <对应用的简短描述，或我 Busabase 工作区里的文件夹 slug> 做成一个达到发布标准的新模板，在本地装上并打开验证，
然后向 busabase/templates 提一个 PR，标题和正文用英文。表格或字段是什么意思拿不准时，问我，不要猜。不要合并。
```
