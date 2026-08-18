# dsh-theme-jarvis

> **"At your service, sir."** — J.A.R.V.I.S. / 钢铁侠 HUD 主题，为 DeepSeek Harness Web GUI 打造。

[![Version](https://img.shields.io/badge/version-0.9.0-3BDCF4?style=flat-square&labelColor=0a1424)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square&labelColor=0a1424)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20GUI%20(Chromium)-F5B33C?style=flat-square&labelColor=0a1424)](https://github.com/GONTB/dsh-theme-jarvis)

纯浏览器端 Cordis 主题插件：方舟反应堆青 × 斯塔克琥珀的双配色体系、夜航 / 昼光两套完整 token 主题、CRT 扫描线、辉光、开机动画、**右下角复刻《奥创纪元》双 AI 光效的全息粒子宠物（金色收敛球贾维斯 / 蓝色混沌网奥创）**、**可自定义的背景壁纸（内置系统默认壁纸 + 本机图片，启用后界面表面变半透明毛玻璃）**，以及**语音唤醒系统**——说「贾维斯」唤醒，继续说指令即可自动转写进输入框草稿（浏览器语音服务不可达时自动降级 host 转发的云端 STT）。全部通过官方 `ctx.theme.register` / `ctx.theme.setTheme` / `ctx.theme.overrideTokens` 与 `slots` 接缝实现——不修改任何 vendor 文件，仅随包携带一张系统默认壁纸与一张支持作者收款码。

## ✨ 特性

- 🎨 **两套完整主题**：`jarvis-night`（夜航：深空海军蓝 + 反应堆青）与 `jarvis-day`（昼光：斯塔克实验室白 + 深青），覆盖全部 `--dsw-alias-*` / `--dsw-specific-*` 语义 token 及 UI / 代码字体；**常驻 override 层保证启动即贾维斯配色**，不依赖内置偏好回写时机
- 🎛️ **外观栏集成**：通用设置 → **外观** 行内直接切换 夜航 / 昼光 / 跟随系统（官方同 id 单元格替换，`settings.general.item`）
- 🔮 **全息粒子宠物**：复刻《奥创纪元》双 AI 光效——**贾维斯形态**（暖金、五道倾角粒子环 + 经线弧编织的闭合环流球、核心柔光、数据流彗星、稳定顺滑）与**奥创形态**（电光蓝人形混沌网、枝杈丝线迸发、细碎电光闪烁、随机电弧炸闪、躁动发散）；随状态实时变化（流式输出加速高亮、语音聆听脉冲、错误告警、空闲呼吸），`auto` 形态下出错自动化身奥创；可拖动，点击弹跳 + 溅射 + 提示音
- 🎙️ **语音唤醒**：说「贾维斯」（可自定义唤醒词）→ HUD 亮起 + 提示音 → 继续说指令自动转写进草稿；**国内网络下自动降级云端 STT**（host 转发 OpenAI 兼容端点，默认硅基流动免费 SenseVoice）
- 🖼️ **背景壁纸**：设置 → JARVIS 控制台 → **背景壁纸** 选项卡——**无壁纸 / 系统默认**（随插件打包的 `assets/默认壁纸.png`，经 host 静态路由提供）/ **用户壁纸**（本机图片，导入时 **canvas 压缩** ≤1600px / JPEG ≤2MB，避免撑爆 localStorage）；启用后表面 token 自动乘 alpha 变半透明毛玻璃，**表面不透明度 / 壁纸模糊**两个滑块实时可调（模糊作用于壁纸层自身，不产生 CSS 包含块，不会影响任何弹层定位）
- 🗂️ **orca 风格文件侧边栏 + 多标签文件编辑器**：右侧栏（details 座位替换）内置**双视图工作区侧边栏**（参考 [stablyai/orca](https://github.com/stablyai/orca) 右侧栏 FileExplorer / SourceControl）：
  - **「目录」视图**：文件树（目录按需懒加载 + 展开/收起箭头 + 深度缩进 + **lucide 线性文件类型图标（SVG，非 emoji）** + 悬停/选中态 + 行内加载/出错重试 + h-8 工具栏（折叠全部 / 刷新 / **显示隐藏文件**开关）+ **Find files 名称过滤条**（防抖全树拉取 + 合成祖先目录，跳过噪声目录）+ **Git 状态标签与行数**（行右侧 M/A/D/R/U/C 带色标签 + `+N -M` 增删行数，目录向上聚合））
  - **「仓库」视图**（Git 变更面板）：**变更文件列表**（状态 + 增删行数，双击打开）+ **汇总行**（`N 个文件变更 · +X −Y` / 工作区干净）+ **Git 操作导航栏**（顶部 拉取 / 提交 / 推送 + 提交信息输入，操作结果反馈，保存后自动刷新）
  - **顶栏加号菜单**：文件导航栏（tab 栏）右侧 **`+`** 按钮 → 弹出菜单：**终端 PowerShell** / **新文件** / **Git 终端**——选终端后中间区域变为黑底交互式终端页（host spawn 进程 + 增量轮询，导航栏显示 `PowerShell` / `Git Bash` 名称 tab；**中文输入输出不乱码**：非 ASCII 命令以 base64 包装执行、输出按 UTF-8/GBK 双解码探测，并剥离 ANSI 转义）；选新文件则在会话工作区创建 `untitled.txt`（同名自动加序号）并打开为可编辑标签
  - **非对话视图隐藏输入框**：激活文件 / 终端标签时，官方的聊天输入框自动隐藏，内容区占满整个高度；切回「对话」恢复
  - 标题栏文件夹图标按钮随时开关；**双击文件**即打开为顶部标签页（与「对话 / 轨迹」同排，每个文件一个标签），中间区域只显示该文件内容——可直接编辑并**保存回磁盘**（host 转发 `/files/list` `/files/read` `/files/write`，回环限定），也可用系统编辑器外部打开；未保存的改动在标签与树中均显示 `●`；**编辑器带 VS Code 风格语法高亮**（透明 textarea + 高亮 overlay：关键字 / 字符串 / 注释 / 数字 / 函数 / JSON 键，Deep Dark+/Light+ 双配色，JS/TS/Python/Java/C/C++/C#/Go/Rust/SQL/HTML/CSS/JSON/YAML/Shell 等 20+ 语言，中文 IME 组合期自动恢复文字显示，大文件自动降级纯文本）
- 💖 **支持作者**：设置 → **JARVIS 控制台**底部展示**微信收款码**（随插件打包，host 静态路由提供），**点击收款码弹出大图预览**（lightbox，点遮罩 / ✕ / Esc 关闭）——喜欢这个主题？请作者喝杯咖啡 ☕
- 🖥️ **JARVIS 开机动画**：扫描线 → `J.A.R.V.I.S.` 标题 → 三条系统日志，每次进入页面播放一次（可关）
- 📺 **HUD 特效**：CRT 扫描线、暗角、主框架四角定位括号、会话行青色左沿、输入框聚焦辉光、方舟反应堆脉动主按钮、**输入框打字音效（按键拟音 + 回车发送音，Web Audio 合成，参考 cyberpunk2077）**——每个特效独立开关
- ⚙️ **设置面板**：设置 → **JARVIS 控制台**，显示模式 + 特效开关 + 识别后端 + 语音唤醒 / 唤醒词 + 恢复默认，即时生效、无需刷新
- 💾 **持久化**：偏好保存在浏览器 `localStorage`，刷新后保持
- ♿ **无障碍与性能**：尊重 `prefers-reduced-motion`（宠物静止一帧）；小屏自动收敛特效

## 📦 安装

```bash
# 从 GitHub 安装（推荐）
dsh plugin --profile web add github:GONTB/dsh-theme-jarvis

# 或克隆后本地路径安装
git clone https://github.com/GONTB/dsh-theme-jarvis.git
cd dsh-theme-jarvis
dsh plugin --profile web add file:.
```

安装完成后**重启 `dsh web`** 生效。

> `dsh plugin` 会把声明了 `dsh.bundle` 的包自动追加进 profile 的
> `dsh.profile.bundles`，并由 `cordis.patch.yml` 插入主题行——无需手工编辑配置。

卸载：

```bash
dsh plugin --profile web remove dsh-theme-jarvis
```

## 🎛️ 使用

重启后，主题即默认生效；入口有两处：

- **设置 → 通用 → 外观**：夜航 / 昼光 / 跟随系统
- **设置 → JARVIS 控制台**：全部细节开关

| 选项 | 说明 |
| --- | --- |
| 显示模式 | 夜航模式（默认）/ 昼光模式 / 跟随系统 |
| 背景壁纸 | 无壁纸 / 系统默认（内置）/ 用户壁纸（本机添加、可删除）+ 表面不透明度 / 壁纸模糊滑块 |
| 扫描线 / 辉光 / 开机动画 / 全息宠物 / 打字音效 | 独立开关，即时生效 |
| 宠物形态 | 贾维斯（金色收敛球）/ 奥创（蓝色混沌网）/ 自动（出错化身奥创） |
| 识别后端 | 自动（浏览器唤醒词优先，语音服务不可达自动降级云端）/ 仅浏览器 / 仅云端 / 本地离线（FunASR，不上传） |
| 开启语音唤醒 | 打开后浏览器会请求麦克风权限；输入框工具栏出现唤醒状态徽章 |
| 唤醒词 | 自定义唤醒词（默认「贾维斯」，≤12 字符）；中文按普通话识别（zh-CN），英文按 en-US |
| 恢复默认 | 一键回到默认配置（不含已添加的用户壁纸） |

### 🖼️ 背景壁纸

**设置 → JARVIS 控制台 → 背景壁纸**提供选项卡：

- **无壁纸** — 纯色深空 / 实验室底色（默认）；
- **系统默认** — 随插件分发的 `assets/默认壁纸.png`，由 host 路由
  `/api/dsh-theme-jarvis/wallpaper/default` 提供（仅回环地址可访问，带缓存头）；
- **＋ 添加壁纸** — 从本机选择图片（`image/*`，原始文件 ≤10MB），导入时
  自动 **canvas 压缩**：最大边降采样到 ≤1600px、JPEG 0.75（超 2MB 逐级降到
  1000/0.6、800/0.5），以 dataURL 存入浏览器 `localStorage`
  （`dsh-theme-jarvis:wallpapers`），卡片右上角 ✕ 可删除。压缩逻辑参考了
  [RevolutionLA/dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin)
  的壁纸实现——单张稳定在 ≤2MB，壁纸库再多也不撑爆配额、渲染更快。

启用任何壁纸后，插件会**重建常驻 override 层**：对约 30 个表面 token
（背景层、侧栏、输入区、气泡、菜单、代码块、按钮等）乘以透明度 alpha，
界面整体变为**半透明毛玻璃**；文字与边框 token 保持完全不透明，保证可读性。
明暗配色下遮罩自动切换深浅。

> ⚠️ 毛玻璃观感**只**由半透明 token + 壁纸模糊滑块实现，刻意**不使用**
> `backdrop-filter` / `filter` 修饰侧栏或输入区容器——这两者会让元素成为
> `position: fixed` 后代的包含块，而设置模态框（`sidebar.settings` 子树）
> 与输入区弹层恰好是这些容器的后代，会被吸到侧边栏位置（v0.6.0 曾因此把
> 设置面板挤进侧边栏，已修复并在测试中加了回归守卫）。

两个滑块即时生效（无需刷新）：

- **表面不透明度**（20%–100%）：表面 token 的整体不透明度倍率，越低壁纸
  透得越明显；100% 为出厂调校值。
- **壁纸模糊**（0–60px）：直接对壁纸层做 `filter: blur()`，配合半透明表面
  呈现磨砂玻璃质感，同时掩盖压缩 JPEG 的轻微瑕疵。

### 🎙️ 语音唤醒怎么用

浏览器后端可用时（自动模式首选）：

1. **设置 → JARVIS 控制台** 打开「语音唤醒」，授权麦克风；
2. 说 **「贾维斯」**（或你设置的唤醒词），HUD 显示 `AT YOUR SERVICE, SIR` 并进入聆听状态；
3. 继续说指令（例如「帮我写个总结」），识别结果实时显示在 HUD；
4. 停顿约 1.6 秒后自动写入输入框草稿（HUD 显示 `EXECUTING`），**可修改后再发送**。

也可以一句话说完：「贾维斯，帮我写个总结」——唤醒词之后的指令会被自动剥离。
输入框工具栏的状态徽章（`● 待命` / `🎙 聆听中`）可随时点击暂停/恢复。

### ☁️ 云端 STT（国内网络必需）

浏览器语音识别（Web Speech API）走 Google / 微软云端，国内网络通常不可达。
插件检测到连续 `network` 失败会自动降级**云端录音模式**：输入框旁的麦克风
变成录音按钮——点击开始、再点结束（或 20 秒自动结束），音频经 host 转发到
OpenAI 兼容 STT 端点，转写结果自动填入草稿。

**配置方式：设置 → JARVIS 控制台 → 云端识别配置**，直接填写三项并点保存：

| 字段 | 说明 |
| --- | --- |
| API Key | 你的服务商密钥（存在 host 的 `~/.dsh/plugins/dsh-theme-jarvis/stt.json`，浏览器存储里没有） |
| 请求地址（baseUrl） | 默认 `https://api.siliconflow.cn/v1`（硅基流动）；阿里云百炼填 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 模型 | 默认 `FunAudioLLM/SenseVoiceSmall`（免费）；百炼填 `paraformer-v2` |

保存后立即生效，无需重启。也可用环境变量（`DSH_JARVIS_STT_KEY` 等）或
profile 补丁层 `stt` 配置作为后备，优先级：面板保存值 > 环境变量 > 补丁层。
兼容任意 OpenAI `/audio/transcriptions` 端点（接口与文档
[创建语音转文本请求](https://api-docs.siliconflow.cn/docs/api/audio-transcriptions-post)
核对一致）。

### 🖥️ 本地离线识别（100% 离线，不上传）

想彻底不依赖网络时，把**识别后端**选为「**本地离线**」：录音仍走浏览器
麦克风 → host，但 host 把 WAV 转发给本机运行的 **FunASR 服务**（复用
[vocotype-cli](https://github.com/233stone/vocotype-cli) 的引擎：
paraformer-large ONNX + VAD + 标点，纯 CPU、0.1 秒级、约 500MB 模型）。

**一次性的环境准备（只需做一次）：**

```bash
git clone https://github.com/233stone/vocotype-cli.git
cd vocotype-cli
uv venv --python 3.12 && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
# 把插件里的 local-stt/server.py 复制到本目录，然后：
python server.py        # 默认 127.0.0.1:8010；首次运行自动下载模型（约 500MB）
```

然后 **设置 → JARVIS 控制台 → 本地识别配置**：保存地址（默认
`http://127.0.0.1:8010`）→「检测服务」确认就绪 → 识别后端选「本地离线」。

音频全程在本机处理，绝不上传；断网也能用。host 侧校验本地地址必须回环，
防止被利用访问内网。

> ⚠️ **浏览器支持**：语音唤醒基于 Web Speech API，仅 Chrome / Edge
> （Chromium）可用；Firefox / Safari 会显示「不支持」。唤醒期间浏览器标签页
> 会显示麦克风使用标记，属正常现象。

## ⚠️ 与其他主题插件共存

主题插件的「最后生效者」取决于启动顺序，无法保证。若你同时安装了
`dsh-theme-cyberpunk2077`、`dsh-client-liang-intensity-skin` 等其他主题插件，
建议在 **设置 → 插件** 中禁用其余主题插件，或：

```bash
dsh plugin --profile web remove dsh-theme-cyberpunk2077
```

本插件不覆盖 `--dsw-static-*` 内部标尺 token，只覆盖官方语义别名层，因此与
非主题类插件（如 dshmarket）完全兼容。

## 📁 仓库结构

```
index.js           host 半：STT 转发 / 壁纸 / 文件浏览编辑 / git 状态与操作 / 终端会话路由
client.js          浏览器端核心（主题 token、特效、宠物、语音唤醒、壁纸、文件侧边栏、终端）
cordis.patch.yml   bundle 补丁层（主题行 + stt 配置）
assets/            内置系统默认壁纸
local-stt/         本地离线 FunASR 服务脚本（配合 vocotype-cli 使用）
test/              冒烟 / host 路由 / 唤醒引擎 / 真实 React 渲染回归测试
```

## 🧩 技术实现

```
client.js          浏览器端（核心）
  ├─ ctx.theme.register()   注册 jarvis-night / jarvis-day 两套 token 主题
  ├─ ctx.theme.overrideTokens()   常驻 {light,dark} 覆盖层 —— 启动即贾维斯配色；
  │                             壁纸激活时对表面 token 乘 alpha（半透明毛玻璃）
  ├─ ctx.theme.setTheme()   切换主题；theme/change 再断言防内置偏好回写
  ├─ slots → settings.general.item (id: appearance, priority: -1)   外观栏单元格替换（同 id 遮蔽需 priority < 官方行的 0，最低者渲染）
  ├─ slots → details (priority: -1)   右侧栏 orca 风格双视图侧边栏（替换宿主原生 details 座位，同上遮蔽规则）；
  │                             ✓ 目录视图：懒加载文件树 + Find files 过滤 + Git 状态/行数标签
  │                             ✓ 仓库视图：变更列表 + 汇总 + 提交/推送/更新操作区
  │                             ✓ 视图切换条（目录 | 仓库）+ 行内加载 / 出错重试
  │                             ✓ 顶栏加号菜单（DOM 注入 tablist）：终端 PowerShell /
  │                               Git 终端（JarvisTerminal 轮询渲染）/ 新文件
  │                             ✓ 双击文件 → 动态 conversation.view 标签（slots.register 即时生效），
  │                               编辑 + 保存 + 关闭标签；树中实时 ● 标记（打开/未保存）；
  │                               会话头部 utilities 座 📁 开关
  ├─ slots → settings.section   「JARVIS 控制台」设置区（含背景壁纸选项卡）
  ├─ slots → conversation.input.right   唤醒状态徽章（官方 useInput / inputActions 通道）
  ├─ 唤醒引擎   SpeechRecognition 连续识别 + 会话序号守卫 + 静默/硬顶投递
  │             + network 自动降级云端录音（ScriptProcessor → 16k WAV）
  ├─ 全息宠物   canvas 双形态粒子系统（贾维斯环流球 / 奥创混沌网）+ 状态能量插值 + 拖动/点击交互
  ├─ 背景壁纸   固定 div 垫底（z-index:-1，cover + 明暗遮罩 + blur 滤镜）
  │             + canvas 压缩导入（≤1600px / JPEG ≤2MB，参考 dsh-dream-skin）
  │             + 表面不透明度 / 模糊滑块 + 颜色乘 alpha 工具
  └─ 特效 CSS + body class 门控 + 开机动画 / 唤醒 HUD DOM 叠加层
index.js           host 半：/api/dsh-theme-jarvis/transcribe 云端 STT 转发
                   （回环限定，multipart → OpenAI 兼容端点，API Key 不出 host）
                   + /api/dsh-theme-jarvis/wallpaper/default 内置壁纸静态服务
                   + /api/dsh-theme-jarvis/files/{list,read,write}
                     工作区文件浏览/编辑路由（回环限定、绝对路径校验、2MB 上限）
                   + /api/dsh-theme-jarvis/git/status
                     `git status --porcelain=v1 -z` 解析（-z 重命名格式、超时/非仓库降级 git:false）
                     + `git diff --numstat -z` 合并增删行数
                   + /api/dsh-theme-jarvis/git/op
                     commit（add -A + commit）/ push / pull（90s 超时，错误摘要回传）
                   + /api/dsh-theme-jarvis/files/create
                     新建空文件（同名自动加序号）
                   + /api/dsh-theme-jarvis/terminal/{open,read,write,close}
                     简易终端：host spawn PowerShell / Git Bash，增量缓冲轮询，
                     base64 包装非 ASCII 输入、UTF-8/GBK 双解码探测输出（中文不乱码），
                     READY 握手 + 15 分钟空闲自动回收
                   + /api/dsh-theme-jarvis/donate/qrcode
                     支持作者微信收款码（assets/支持作者.jpg）
cordis.patch.yml   bundle 补丁层：主题行 + stt 配置
test/              冒烟 + 唤醒引擎仿真 + host 路由测试 + 真实 React 渲染回归
```

参考实现：

- [Tommy00748/dsh-theme-cyberpunk2077](https://github.com/Tommy00748/dsh-theme-cyberpunk2077) — 客户端 token 主题 / register+setTheme 模式
- [BeiZi6/dsh-theme-plugin](https://github.com/BeiZi6/dsh-theme-plugin) — slots 设置区 / token 派生模式
- [Hjay1101/dsh-plugin-voice-input](https://github.com/Hjay1101/dsh-plugin-voice-input) — 语音输入的 `conversation.input.right` + `useInput`/`inputActions` 官方通道用法
- [orzx/deepseek-harness-themes](https://github.com/orxz/deepseek-harness-themes) — 多主题 monorepo 范式
- [RevolutionLA/dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin) — 壁纸实现参考：canvas 压缩导入、固定 z-index:-1 壁纸层、wash opacity / blur 可调、override 层先 dispose 再重建
- [stablyai/orca](https://github.com/stablyai/orca) — 文件树侧边栏参考：`FileExplorer` / `FileExplorerRow` / `file-tree.ts`（目录懒加载缓存 + 展开集合 + 扁平化行投影、行内加载/出错重试、折叠全部/刷新工具栏、文件类型图标）

## 📄 License

MIT。本主题为粉丝致敬作品（J.A.R.V.I.S. / Iron Man 形象版权归 Marvel 所有），
仅限个人及非商业用途。

---

*J.A.R.V.I.S. is a fictional AI from the Marvel Cinematic Universe. This project
is an unofficial fan-made UI skin and is not affiliated with or endorsed by
Marvel Studios.*
