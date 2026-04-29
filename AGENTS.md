# Agent Guide

This repository is designed to be handed directly to a local AI Agent. Read `README.md` first for the full human-facing and agent-facing setup flow.

## Project Purpose

Feishu Meeting Assistant is a local-first Electron desktop app that records a meeting window, extracts audio, generates a high-coverage Chinese meeting note, extracts action items, and dispatches the result to Lark/Feishu Docs and To Do.

## Safe First Steps

```bash
npm install
npm run setup:mac
npm run doctor:mac
npm run dev
```

On Windows:

```powershell
npm install
npm run setup
npm run doctor
npm run dev
```

Use `npm run doctor` before changing runtime assumptions. It checks Node, Python, ffmpeg, Agent CLI provider, Lark CLI, and media-transcript availability.

## Agent CLI Provider

The note-generation backend is intentionally generic. Do not reintroduce a hard dependency on one AI CLI.

Configuration lives in `.env.example` and user-local `.env`:

- `AGENT_CLI_PROVIDER=auto|claude|gemini|codex|custom`
- `AGENT_CLI_MODEL`
- `AGENT_CLI_FALLBACK_MODEL`
- `AGENT_CLI_COMMAND`
- `AGENT_CLI_ARGS`
- `AGENT_CLI_STDIN`

Runtime implementation is in `scripts/process_job.py`. The provider resolution order for `auto` is custom command, Claude Code CLI, Gemini CLI, then Codex CLI.

## Meeting Note Quality

Meeting note format is governed by:

```text
skills/meeting-notes-format/SKILL.md
```

If the generated document is too shallow, update this skill first. The processing script should stay provider-agnostic and should not hard-code document prose.

Required note outputs:

- `output/cleaned-transcript.md`
- `output/meeting-notes.md`
- `output/tasks-review.json`
- `output/dispatch-result.json`

## Verification

Run these before committing code or docs changes:

```bash
python -m py_compile scripts/process_job.py
npm run doctor
npm run lint
npm run build
npm audit --audit-level=high
```

For documentation-only changes, still run `npm run doctor` and inspect `git diff --check`.

## Public Repo Hygiene

Never commit:

- `.env`
- `jobs/`
- meeting recordings
- transcripts
- Lark tokens
- local credentials
- `dist/`
- `dist-electron/`
- `release/`
- `node_modules/`

Before staging, run:

```bash
git status --short
```

Stage explicit files only. Generated output and meeting data are intentionally ignored.

## Important Files

- `README.md`: full handoff guide for humans and Agents.
- `.env.example`: runtime provider and dependency configuration template.
- `scripts/doctor.mjs`: local dependency check.
- `scripts/setup-local.mjs`: first-run setup wrapper.
- `scripts/process_job.py`: audio extraction, transcript orchestration, Agent CLI execution, and Lark dispatch.
- `electron/main.ts`: desktop capture, job lifecycle, runtime dependency status.
- `src/App.tsx`: desktop UI.
- `skills/meeting-notes-format/SKILL.md`: meeting-note generation contract.
