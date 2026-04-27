# Feishu Meeting Assistant

本地优先的桌面助手，用于录制会议窗口、生成中文会议纪要，并把可执行事项派发到 Lark/飞书 To Do。

## Mac 用户快速开始

这个仓库支持 **Mac 用户 clone 后本地源码运行**，不需要 Apple Developer 账号，不需要应用签名或公证。

```bash
git clone https://github.com/cedriczz/feishu-meeting-assistant.git
cd feishu-meeting-assistant
npm install
npm run setup:mac
npm run dev
```

`npm run setup:mac` 会做两件事：

- 如果没有 `.env`，自动从 `.env.example` 创建。
- 检查本机是否具备 Python、ffmpeg、Codex CLI、Lark CLI、media-transcript 等运行依赖。

你也可以随时重新检查：

```bash
npm run doctor:mac
```

### Mac 首次录制授权

首次录制时，macOS 会要求授权：

- 屏幕录制：用于读取你选择的会议窗口。
- 麦克风：用于录入默认音频输入。

如果要录制系统声音，请把 BlackHole、Loopback 等虚拟声卡配置为系统音频输入。修改权限后，请完全退出并重新打开应用。

## Mac 依赖安装参考

如果 `npm run setup:mac` 提示缺依赖，可以按需安装：

```bash
brew install node python ffmpeg
```

完整处理流程还需要：

- Codex CLI：用于生成会议纪要和任务 JSON。
- Lark CLI：用于创建飞书云文档和 To Do。
- media-transcript script：用于生成带说话人的转写稿。

media-transcript 脚本默认查找：

- `./tools/media-transcript/scripts/run_media_transcript.py`
- `~/.codex/skills/media-transcript/scripts/run_media_transcript.py`
- 或 `.env` 中的 `MEDIA_TRANSCRIPT_SCRIPT=/path/to/run_media_transcript.py`

这些授权和账号配置可以在应用能启动之后再补；缺少它们时，应用可以打开和录制，但完整的“转写 -> 纪要 -> 飞书派发”流程会在处理阶段失败或跳过。

## 产品流程

1. 选择会议窗口或屏幕。
2. 本地录制会议。
3. 提取音频。
4. 生成说话人转写稿。
5. 生成中文会议纪要。
6. 提取结构化 TODO。
7. 创建飞书云文档，并为当前登录用户创建可见 To Do。

生成结果位于 `jobs/<job-id>/`：

- `output/raw-speaker-transcript.md`
- `output/meeting-notes.md`
- `output/tasks-review.json`
- `output/dispatch-result.json`

## 常用命令

```bash
npm run setup:mac
npm run doctor:mac
npm run dev
npm run build
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
npm run setup
npm run dev
```

打包命令：

```bash
npm run dist:mac
npm run dist:win
```

当前打包产物是未签名构建。源码运行不需要 Apple Developer 账号；只有当你要发布“普通用户双击安装且不出现系统警告”的正式 Mac App 时，才需要 Apple Developer ID 签名和 notarization。

## Environment Variables

See `.env.example`.

- `MEDIA_TRANSCRIPT_SCRIPT`: explicit path to `run_media_transcript.py`
- `MEDIA_TRANSCRIPT_QUALITY`: `balanced` or `best`
- `CODEX_MODEL`: Codex CLI model, default `gpt-5.4`
- `CODEX_FALLBACK_MODEL`: optional fallback model
- `MEETING_NOTES_SKILL_PATH`: custom meeting-note format skill
- `PYTHON_BIN`: Python executable for Electron to spawn

## Meeting Note Format Skill

最终会议文档格式由下面的 skill 控制：

```text
skills/meeting-notes-format/SKILL.md
```

修改它可以调整章节顺序、TODO 提取规则、风险项处理和飞书文档风格。

## GitHub Actions

`.github/workflows/build.yml` 会在 Windows 和 macOS 上执行类型检查、生产构建和 unpacked 桌面包构建。

## Public Repository Hygiene

以下本地生成内容默认忽略，不应提交到公开仓库：

- `jobs/`
- `models/`
- `.runlogs/`
- `.superpowers/`
- `dist/`
- `dist-electron/`
- `release/`
- `node_modules/`
- `.env`

不要提交会议录音、转写稿、飞书 token、本地配置或云端派发结果。
