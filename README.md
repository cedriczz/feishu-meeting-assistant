# Feishu Meeting Assistant

Cross-platform local desktop framework for recording a meeting window, processing the audio, generating a meeting document, and creating Lark To Do items.

The app is intentionally local-first:

- Electron records the selected meeting window.
- Python extracts audio and orchestrates processing.
- A media transcript skill generates the speaker transcript.
- Codex CLI creates the meeting notes and task JSON.
- Lark CLI creates the cloud document and visible To Do items.

## Current Workflow

1. Open the desktop app.
2. Select the meeting window or screen.
3. Click `Start Recording`.
4. Click `Stop and Process` after the meeting ends.
5. The app creates a local job under `jobs/`.
6. The processing script writes:
   - `output/raw-speaker-transcript.md`
   - `output/meeting-notes.md`
   - `output/tasks-review.json`
   - `output/dispatch-result.json`
7. If Lark CLI is configured, the script creates:
   - one Lark cloud document
   - one visible Lark To Do per actionable TODO

## Meeting Note Format Skill

The final meeting document format is controlled by:

```text
skills/meeting-notes-format/SKILL.md
```

Edit this skill to change the final output style. For example, you can:

- add or remove meeting-note sections
- change the TODO extraction rules
- make the document more executive-summary focused
- require tables or risk sections
- change when low-confidence tasks should be dispatched

You can also point the processor to another skill:

```bash
MEETING_NOTES_SKILL_PATH=/path/to/your/SKILL.md
```

## Requirements

- Node.js 20+
- Python 3.11+
- `ffmpeg`
- Codex CLI available as `codex`
- Lark CLI available as `lark-cli`
- A media transcript skill script, either at:
  - `./tools/media-transcript/scripts/run_media_transcript.py`
  - `~/.codex/skills/media-transcript/scripts/run_media_transcript.py`
  - or `MEDIA_TRANSCRIPT_SCRIPT=/path/to/run_media_transcript.py`

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
npm run dev
```

## Build

```bash
npm run build
```

## Environment Variables

See `.env.example`.

Common overrides:

- `MEDIA_TRANSCRIPT_SCRIPT`: explicit path to `run_media_transcript.py`
- `MEDIA_TRANSCRIPT_QUALITY`: `balanced` or `best`
- `CODEX_MODEL`: Codex CLI model, default `gpt-5.4`
- `CODEX_FALLBACK_MODEL`: optional fallback model
- `MEETING_NOTES_SKILL_PATH`: custom meeting-note format skill
- `PYTHON_BIN`: Python executable for Electron to spawn

## Platform Notes

### Windows

Windows uses Electron desktop capture with system loopback audio when available. Lark CLI is invoked through Node directly when possible to avoid `cmd.exe` multiline Markdown argument issues.

### macOS

macOS requires screen-recording permission for Electron. System audio capture may require a loopback device or meeting-app audio routing depending on OS and hardware configuration.

## Public Repository Hygiene

Generated and local-only data is ignored:

- `jobs/`
- `models/`
- `.runlogs/`
- `.superpowers/`
- `dist/`
- `dist-electron/`
- `node_modules/`
- `.env`

Do not commit meeting recordings, transcripts, Lark tokens, local config, or generated cloud dispatch results.

## Limits

- This is a framework/MVP, not a packaged installer yet.
- Speaker attribution depends on the installed media transcript pipeline.
- Fully automatic assignee detection is intentionally not enabled by default.
- Lark document and To Do creation require a configured and authorized `lark-cli`.

---

## 中文说明

这是一个跨平台的本地桌面框架，用于录制会议窗口、处理音频、生成会议文档，并自动创建 Lark/飞书 To Do。

这个项目以本地优先为核心设计：

- Electron 负责录制用户选择的会议窗口。
- Python 负责提取音频并编排后续处理流程。
- media-transcript skill 负责生成带说话人分组的转写稿。
- Codex CLI 负责生成会议纪要和任务 JSON。
- Lark CLI 负责创建飞书云文档和可见的飞书 To Do。

## 当前流程

1. 打开桌面应用。
2. 选择会议窗口或屏幕。
3. 点击 `Start Recording` 开始录制。
4. 会议结束后点击 `Stop and Process`。
5. 应用会在 `jobs/` 下创建本地任务目录。
6. 处理脚本会写入以下结果：
   - `output/raw-speaker-transcript.md`
   - `output/meeting-notes.md`
   - `output/tasks-review.json`
   - `output/dispatch-result.json`
7. 如果已配置 Lark CLI，脚本会继续创建：
   - 一个飞书云文档
   - 每个可执行 TODO 对应一个飞书 To Do

## 会议纪要格式 Skill

最终会议文档的格式由下面这个 skill 控制：

```text
skills/meeting-notes-format/SKILL.md
```

如果想调整最终会议纪要的样式，优先修改这个 skill。例如可以调整：

- 增加或删除会议纪要章节。
- 修改 TODO 提取规则。
- 改成更偏高管摘要的文档风格。
- 要求输出表格、风险清单或待确认项。
- 调整低置信度任务是否自动派发。

也可以通过环境变量指定另一个 skill：

```bash
MEETING_NOTES_SKILL_PATH=/path/to/your/SKILL.md
```

## 环境要求

- Node.js 20+
- Python 3.11+
- `ffmpeg`
- Codex CLI，可通过 `codex` 命令调用
- Lark CLI，可通过 `lark-cli` 命令调用
- media transcript skill 脚本，位置可以是：
  - `./tools/media-transcript/scripts/run_media_transcript.py`
  - `~/.codex/skills/media-transcript/scripts/run_media_transcript.py`
  - 或通过 `MEDIA_TRANSCRIPT_SCRIPT=/path/to/run_media_transcript.py` 指定

## 安装与运行

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
npm run dev
```

## 构建

```bash
npm run build
```

## 环境变量

参考 `.env.example`。

常用配置：

- `MEDIA_TRANSCRIPT_SCRIPT`：显式指定 `run_media_transcript.py` 路径。
- `MEDIA_TRANSCRIPT_QUALITY`：转写质量，支持 `balanced` 或 `best`。
- `CODEX_MODEL`：Codex CLI 使用的模型，默认 `gpt-5.4`。
- `CODEX_FALLBACK_MODEL`：可选的 fallback 模型。
- `MEETING_NOTES_SKILL_PATH`：自定义会议纪要格式 skill。
- `PYTHON_BIN`：Electron 调用的 Python 可执行文件。

## 平台说明

### Windows

Windows 使用 Electron 桌面采集能力，并在可用时使用系统 loopback 音频。Lark CLI 在 Windows 下会尽量绕过 `cmd.exe`，直接通过 Node 调用，以避免多行 Markdown 参数被截断或破坏。

### macOS

macOS 需要给 Electron 开启屏幕录制权限。系统音频采集可能需要额外的 loopback 设备，或根据会议软件和系统版本配置音频路由。

## 公开仓库注意事项

以下本地生成内容默认不会提交：

- `jobs/`
- `models/`
- `.runlogs/`
- `.superpowers/`
- `dist/`
- `dist-electron/`
- `node_modules/`
- `.env`

不要提交会议录音、转写稿、Lark token、本地配置或云端派发结果。

## 当前限制

- 这是框架/MVP，还不是完整安装包。
- 说话人识别效果取决于本地安装的 media transcript 流水线。
- 默认不启用完全自动的负责人识别。
- 创建飞书云文档和 To Do 需要先配置并授权 `lark-cli`。
