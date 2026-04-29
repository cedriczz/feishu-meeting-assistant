# Feishu Meeting Assistant

本地优先的桌面会议助手：录制会议窗口，生成高覆盖中文会议纪要，提取待办，并把纪要和 To Do 派发到 Lark/飞书。

## 给人类用户的最短说明

你不需要自己理解整个工程。把这个 GitHub 链接直接丢给你本机的 AI Agent，让它按本 README 操作即可：

```text
请打开并运行这个项目：
https://github.com/cedriczz/feishu-meeting-assistant

目标：
1. 按 README 完成本地环境检查。
2. 根据我的机器情况选择可用的 Agent CLI provider。
3. 启动桌面应用。
4. 如缺依赖，告诉我需要安装什么，不要提交任何 token、录音、转写稿或 .env。
```

适合处理这个仓库的 Agent：

- Claude Code CLI
- Gemini CLI
- Codex CLI
- 其他支持本地读写文件、执行命令、作为 AI Agent 工作的 CLI

本项目已经不绑定单一 Codex CLI。默认会自动选择可用的 Agent CLI，也可以通过 `.env` 强制指定。

## 给 AI Agent 的快速执行路径

如果你是正在接手这个仓库的 AI Agent，按下面顺序做：

项目级操作约定见 `AGENTS.md`。先读本 README，再读 `AGENTS.md`，然后执行环境检查。

```bash
git clone https://github.com/cedriczz/feishu-meeting-assistant.git
cd feishu-meeting-assistant
npm install
npm run setup:mac
npm run doctor:mac
npm run dev
```

如果是在 Windows：

```powershell
git clone https://github.com/cedriczz/feishu-meeting-assistant.git
cd feishu-meeting-assistant
npm install
npm run setup
npm run doctor
npm run dev
```

不要提交这些内容：

- `.env`
- `jobs/`
- 录音文件
- 转写稿
- 飞书 token
- 本地 credential
- 任何会议隐私内容

## 产品能力

核心流程：

1. Electron 录制用户选择的会议窗口或屏幕。
2. Python 用 `ffmpeg` 从录制文件中提取音频。
3. media-transcript 脚本生成带说话人信息的转写稿。
4. Agent CLI 读取转写稿和 meeting-notes skill，生成：
   - `output/cleaned-transcript.md`
   - `output/meeting-notes.md`
   - `output/tasks-review.json`
5. Lark CLI 创建飞书云文档。
6. Lark CLI 为当前登录用户创建可见 To Do。
7. 所有结果写回本地 job 目录。

生成结果位于：

```text
jobs/<job-id>/
  input/
    meeting.webm
    audio.wav
    capture-metadata.json
  output/
    raw-speaker-transcript.md
    cleaned-transcript.md
    meeting-notes.md
    tasks-review.json
    dispatch-result.json
  logs/
    processor.stdout.log
    processor.stderr.log
    agent.stdout.log
    agent.stderr.log
```

## Agent CLI Provider

本项目通过 `AGENT_CLI_PROVIDER` 选择会议纪要生成引擎。

默认：

```env
AGENT_CLI_PROVIDER=auto
```

`auto` 的选择顺序：

1. 如果设置了 `AGENT_CLI_COMMAND`，使用 custom。
2. 检测 `claude`，使用 Claude Code CLI。
3. 检测 `gemini`，使用 Gemini CLI。
4. 检测 `codex`，使用 Codex CLI。

支持的 provider：

| Provider | 说明 | 默认命令 |
| --- | --- | --- |
| `auto` | 自动选择可用 Agent CLI | n/a |
| `claude` | Claude Code CLI | `claude` |
| `gemini` | Gemini CLI | `gemini` |
| `codex` | OpenAI Codex CLI | `codex` |
| `custom` | 任意本地 Agent CLI | 由 `AGENT_CLI_COMMAND` 指定 |

### Claude Code CLI 示例

```env
AGENT_CLI_PROVIDER=claude
AGENT_CLI_MODEL=claude-sonnet-4-5
```

处理脚本会在 job 目录中调用 Claude Code CLI，让它读取 `intermediate/agent-prompt.md` 并写入 `output/` 文件。

### Gemini CLI 示例

```env
AGENT_CLI_PROVIDER=gemini
AGENT_CLI_MODEL=gemini-2.5-pro
```

Gemini CLI 会以 `--approval-mode=yolo` 运行，以便在本地 job 目录中自动写出纪要和 JSON 文件。

### Codex CLI 示例

```env
AGENT_CLI_PROVIDER=codex
AGENT_CLI_MODEL=gpt-5.4
AGENT_CLI_FALLBACK_MODEL=
```

为了兼容旧配置，`CODEX_MODEL` 和 `CODEX_FALLBACK_MODEL` 仍然可用；但推荐新配置统一使用 `AGENT_CLI_MODEL`。

### Custom Agent CLI 示例

如果用户机器上有其他 Agent CLI，可以使用 custom：

```env
AGENT_CLI_PROVIDER=custom
AGENT_CLI_COMMAND=my-agent
AGENT_CLI_ARGS=run --cwd {job_dir} --prompt-file {prompt_file}
AGENT_CLI_STDIN=false
```

可用占位符：

- `{job_dir}`：当前会议 job 目录
- `{prompt_file}`：Agent prompt 文件路径
- `{model}`：`AGENT_CLI_MODEL`
- `{output_message}`：最后回复应写入的位置

如果 CLI 需要从 stdin 读取完整 prompt：

```env
AGENT_CLI_PROVIDER=custom
AGENT_CLI_COMMAND=my-agent
AGENT_CLI_ARGS=run --cwd {job_dir}
AGENT_CLI_STDIN=true
```

## 环境要求

启动桌面应用至少需要：

- Node.js 20+
- npm

完整处理会议需要：

- Python 3.11+
- `ffmpeg`
- 一个可用的 Agent CLI provider
- Lark CLI
- media-transcript 脚本

Mac 常见安装：

```bash
brew install node python ffmpeg
```

然后分别登录或配置你选择的 Agent CLI、Lark CLI 和 media-transcript 能力。

## Mac 使用说明

源码运行不需要 Apple Developer 账号，不需要签名，不需要 notarization。

```bash
npm install
npm run setup:mac
npm run dev
```

首次录制时，macOS 会要求授权：

- 屏幕录制：用于读取会议窗口画面。
- 麦克风：用于录入默认音频输入。

如果要录制系统声音，请把 BlackHole、Loopback 等虚拟声卡配置为系统音频输入。修改权限后，请完全退出并重新打开应用。

## 本地检查命令

```bash
npm run doctor
npm run doctor:mac
npm run doctor:strict
```

`doctor` 会检查：

- Node.js
- `.env`
- Python
- ffmpeg
- Agent CLI
- Lark CLI
- media-transcript script

如果 Agent CLI 未检测到，应用仍可启动和录制，但完整处理流程会失败。

## `.env` 配置

从模板创建：

```bash
cp .env.example .env
```

关键配置：

```env
MEDIA_TRANSCRIPT_SCRIPT=
MEDIA_TRANSCRIPT_QUALITY=balanced

AGENT_CLI_PROVIDER=auto
AGENT_CLI_MODEL=
AGENT_CLI_FALLBACK_MODEL=
AGENT_CLI_COMMAND=
AGENT_CLI_ARGS=
AGENT_CLI_STDIN=false

MEETING_NOTES_SKILL_PATH=
PYTHON_BIN=
```

## 会议纪要质量控制

会议纪要格式由这个 skill 控制：

```text
skills/meeting-notes-format/SKILL.md
```

当前要求生成接近飞书妙记质量的结构：

- 重点项目
- 项目跟进表
- 详细纪要
- 关键决策与核心共识
- 风险与待确认项
- 待办事项
- 信息压缩说明

如果你是 Agent，要优化纪要质量，优先修改这个 skill，而不是硬编码处理脚本。

## 常用命令

```bash
npm run setup:mac
npm run doctor:mac
npm run dev
npm run build
npm run dist:mac
npm run dist:win
```

## 打包说明

Mac 打包：

```bash
npm run dist:mac
```

Windows 打包：

```bash
npm run dist:win
```

当前打包产物是未签名构建。源码运行不需要 Apple Developer 账号；只有发布“普通用户双击安装且没有系统警告”的正式 Mac App 时，才需要 Apple Developer ID 签名和 notarization。

## GitHub Actions

`.github/workflows/build.yml` 会在 Windows 和 macOS 上执行：

- `npm ci`
- `npm run lint`
- `npm run build`
- unpacked 桌面包构建

## 公开仓库安全规则

不要提交：

- `jobs/`
- `models/`
- `.runlogs/`
- `.superpowers/`
- `dist/`
- `dist-electron/`
- `release/`
- `node_modules/`
- `.env`
- 会议录音
- 转写稿
- 飞书 token
- 本地 credential
- 云端派发结果

这些已经通过 `.gitignore` 默认忽略。Agent 在提交前必须运行：

```bash
git status --short
```

确认没有隐私文件进入暂存区。
