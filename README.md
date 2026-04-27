# Feishu Meeting Assistant

Local desktop assistant for recording a meeting window, turning the audio into Chinese meeting notes, and dispatching actionable items to Lark/Feishu To Do.

The app is local-first:

- Electron records the selected meeting window or screen.
- Python extracts audio and orchestrates the processing pipeline.
- A media transcript skill generates the speaker transcript.
- Codex CLI creates meeting notes and task JSON.
- Lark CLI creates the cloud document and visible To Do items.

## What It Does

1. Select a meeting window or screen.
2. Record the meeting locally.
3. Extract audio from the recording.
4. Generate a speaker transcript.
5. Generate a Chinese meeting document.
6. Extract actionable TODO items.
7. Create a Lark cloud document and visible Lark To Do items.

Generated job output is written under `jobs/<job-id>/`:

- `output/raw-speaker-transcript.md`
- `output/meeting-notes.md`
- `output/tasks-review.json`
- `output/dispatch-result.json`

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

Windows portable build:

```bash
npm run dist:win
```

macOS DMG and ZIP build:

```bash
npm run dist:mac
```

Fast unpacked macOS build for local smoke tests:

```bash
npm run dist:mac:dir
```

## macOS Notes

The macOS app is packaged with a native hidden title bar, app menu, privacy usage descriptions, and unsigned DMG/ZIP targets for both Intel and Apple Silicon.

macOS requires Screen Recording permission before Electron can capture the selected window. Audio capture uses the default microphone or a virtual loopback input, such as BlackHole, Loopback, or another device configured in system audio settings. After changing permissions, quit and reopen the app.

The app includes shortcuts to open:

- System Settings > Privacy & Security > Screen Recording
- System Settings > Privacy & Security > Microphone

Unsigned public builds may require right-click > Open on first launch.

## Environment Variables

See `.env.example`.

Common overrides:

- `MEDIA_TRANSCRIPT_SCRIPT`: explicit path to `run_media_transcript.py`
- `MEDIA_TRANSCRIPT_QUALITY`: `balanced` or `best`
- `CODEX_MODEL`: Codex CLI model, default `gpt-5.4`
- `CODEX_FALLBACK_MODEL`: optional fallback model
- `MEETING_NOTES_SKILL_PATH`: custom meeting-note format skill
- `PYTHON_BIN`: Python executable for Electron to spawn

## Meeting Note Format Skill

The final meeting document format is controlled by:

```text
skills/meeting-notes-format/SKILL.md
```

Edit this skill to change section order, TODO extraction rules, risk handling, or the Lark document style.

## GitHub Actions

The workflow in `.github/workflows/build.yml` runs type checks and production builds on Windows and macOS. It also uploads unpacked desktop artifacts for inspection.

## Public Repository Hygiene

Generated and local-only data is ignored:

- `jobs/`
- `models/`
- `.runlogs/`
- `.superpowers/`
- `dist/`
- `dist-electron/`
- `release/`
- `node_modules/`
- `.env`

Do not commit meeting recordings, transcripts, Lark tokens, local config, or generated cloud dispatch results.

---

## 中文说明

这是一个本地优先的桌面助手，用于录制会议窗口、处理音频、生成中文会议纪要，并把可执行事项派发到飞书 To Do。

核心流程：

1. 选择会议窗口或屏幕。
2. 本地录制会议。
3. 从录制文件中提取音频。
4. 生成带说话人的转写稿。
5. 生成中文会议纪要。
6. 提取结构化 TODO。
7. 创建飞书云文档，并为当前登录用户创建可见 To Do。

### macOS 使用说明

Mac 版本已经适配 Electron 的 macOS 窗口、应用菜单、权限说明和打包配置。首次使用时需要在系统设置中授权：

- 屏幕录制：允许应用读取会议窗口画面。
- 麦克风：允许应用录入默认音频输入。若需要录制系统声音，请将 BlackHole、Loopback 等虚拟声卡设置为输入源。

修改权限后，请完全退出并重新打开应用。

### 打包命令

```bash
npm run dist:mac
```

会生成 macOS 的 DMG 和 ZIP 包。当前公开构建未签名，首次启动可能需要右键选择“打开”。
