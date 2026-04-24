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
