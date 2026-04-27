#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import subprocess
import sys
import textwrap
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from shutil import which


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MEETING_NOTES_SKILL = REPO_ROOT / "skills" / "meeting-notes-format" / "SKILL.md"
SUPPORTED_AGENT_PROVIDERS = ("claude", "gemini", "codex", "custom")


@dataclass
class AgentCommand:
    provider: str
    command: list[str]
    model: str | None
    prompt_input: str | None
    output_message: Path


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv(REPO_ROOT / ".env")


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_status(job_dir: Path, status: str, stage: str, progress: float, message: str) -> None:
    write_json(
        job_dir / "status.json",
        {
            "status": status,
            "stage": stage,
            "progress": progress,
            "message": message,
            "updatedAt": datetime.now().isoformat(timespec="seconds"),
        },
    )


def run(command: list[str], cwd: Path | None = None, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        encoding="utf-8",
        errors="replace",
        input=input_text,
        check=True,
    )


def run_capture(command: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=True,
    )


def run_agent_process(command: list[str], job_dir: Path, input_text: str | None) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=str(job_dir),
        text=True,
        encoding="utf-8",
        errors="replace",
        input=input_text,
        capture_output=True,
    )
    logs_dir = job_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    (logs_dir / "agent.stdout.log").write_text(result.stdout or "", encoding="utf-8")
    (logs_dir / "agent.stderr.log").write_text(result.stderr or "", encoding="utf-8")
    if result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, command, result.stdout, result.stderr)
    return result


def optional_path_from_env(name: str) -> Path | None:
    value = os.environ.get(name)
    if not value:
        return None
    path = Path(value).expanduser()
    return path if path.exists() else None


def find_media_transcript_script() -> Path | None:
    candidates = [
        optional_path_from_env("MEDIA_TRANSCRIPT_SCRIPT"),
        REPO_ROOT / "tools" / "media-transcript" / "scripts" / "run_media_transcript.py",
        Path.home() / ".codex" / "skills" / "media-transcript" / "scripts" / "run_media_transcript.py",
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    return None


def find_meeting_notes_skill() -> Path | None:
    candidates = [
        optional_path_from_env("MEETING_NOTES_SKILL_PATH"),
        DEFAULT_MEETING_NOTES_SKILL,
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    return None


def which_any(commands: list[str]) -> str | None:
    for command in commands:
        found = which(command)
        if found:
            return found
    return None


def platform_commands(base: str) -> list[str]:
    if sys.platform == "win32":
        return [f"{base}.cmd", base]
    return [base]


def split_agent_args(value: str) -> list[str]:
    value = value.strip()
    if not value:
        return []
    if value.startswith("["):
        parsed = json.loads(value)
        if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
            raise ValueError("AGENT_CLI_ARGS JSON must be a string array.")
        return parsed
    return shlex.split(value, posix=sys.platform != "win32")


def requested_agent_provider() -> str:
    provider = os.environ.get("AGENT_CLI_PROVIDER", "auto").strip().lower() or "auto"
    if provider == "cloud":
        return "claude"
    if provider == "claude-code":
        return "claude"
    return provider


def resolve_agent_provider() -> tuple[str, str]:
    requested = requested_agent_provider()
    custom_command = os.environ.get("AGENT_CLI_COMMAND", "").strip()

    if requested == "custom":
        if not custom_command:
            raise FileNotFoundError("AGENT_CLI_PROVIDER=custom requires AGENT_CLI_COMMAND.")
        return "custom", custom_command

    if requested != "auto":
        if requested not in SUPPORTED_AGENT_PROVIDERS:
            raise ValueError(
                f"Unsupported AGENT_CLI_PROVIDER={requested}. Use auto, claude, gemini, codex, or custom."
            )
        found = which_any(platform_commands(requested))
        if not found:
            raise FileNotFoundError(f"Requested Agent CLI provider '{requested}' was not found in PATH.")
        return requested, found

    if custom_command:
        return "custom", custom_command

    for provider in ["claude", "gemini", "codex"]:
        found = which_any(platform_commands(provider))
        if found:
            return provider, found

    raise FileNotFoundError(
        "No supported Agent CLI found. Install Claude Code CLI, Gemini CLI, Codex CLI, or set AGENT_CLI_PROVIDER=custom with AGENT_CLI_COMMAND."
    )


def load_meeting_notes_skill() -> str:
    path = find_meeting_notes_skill()
    if not path:
        return "No meeting-notes-format skill was found. Use a concise Chinese meeting note format."
    return path.read_text(encoding="utf-8")


def extract_audio(job_dir: Path) -> Path:
    input_video = job_dir / "input" / "meeting.webm"
    output_audio = job_dir / "input" / "audio.wav"
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(input_video),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            str(output_audio),
        ]
    )
    return output_audio


def run_media_transcript(job_dir: Path) -> Path:
    transcript_path = job_dir / "output" / "raw-speaker-transcript.md"
    script = find_media_transcript_script()
    if not script:
        raise FileNotFoundError(
            "media-transcript script not found. Set MEDIA_TRANSCRIPT_SCRIPT or install the media-transcript skill."
        )

    run(
        [
            sys.executable,
            str(script),
            "--input",
            str(job_dir / "input" / "audio.wav"),
            "--output",
            str(transcript_path),
            "--quality",
            os.environ.get("MEDIA_TRANSCRIPT_QUALITY", "balanced"),
        ]
    )
    return transcript_path


def build_agent_prompt(job_dir: Path, transcript_path: Path) -> str:
    metadata_path = job_dir / "input" / "capture-metadata.json"
    skill_text = load_meeting_notes_skill()

    return textwrap.dedent(
        f"""
        You are an AI Agent CLI processing a local Lark/Feishu meeting recording job.

        Current job root:
        - Capture metadata: {metadata_path.relative_to(job_dir).as_posix()}
        - Raw speaker transcript: {transcript_path.relative_to(job_dir).as_posix()}

        Meeting note formatting skill:
        ```markdown
        {skill_text}
        ```

        Required local outputs:
        1. Read the full transcript and write a cleaned transcript digest to `output/cleaned-transcript.md`.
        2. Write the final Chinese meeting note to `output/meeting-notes.md`.
        3. Extract actionable TODO items into `output/tasks-review.json`.
        4. Create a Lark cloud document from `output/meeting-notes.md` with `lark-cli`.
        5. Create one visible Lark To Do for each actionable TODO.
        6. Write cloud document and To Do results to `output/dispatch-result.json`.

        Rules:
        - This is not a dry run. The user has authorized creating the Lark document and To Dos.
        - Do not modify files under `input/`.
        - Do not summarize too aggressively. Preserve all projects, regions, risks, numbers, owners, deadlines, and unresolved questions.
        - Use the meeting note formatting skill exactly for document structure and quality standards.
        - Do not infer real project owners from the meeting.
        - For visibility, assign created To Dos only to the currently logged-in Lark user.
        - Get the current user open_id from `lark-cli auth status`.
        - If a due date is unclear, set `due` to null and omit `--due`.
        - If `lark-cli` fails, still write the local output files and record failures in `dispatch-result.json`.
        - Write all local files as UTF-8.

        Useful commands:
        - `lark-cli docs +create --title "<title>" --markdown "<markdown>"`
        - `lark-cli docs +fetch --doc "<doc token or url>" --format json`
        - `lark-cli docs +update --doc "<doc token or url>" --mode overwrite --markdown "<markdown>"`
        - `lark-cli task +create --summary "<summary>" --description "<description>" --assignee "<current_user_open_id>" --format json`

        `output/tasks-review.json` schema:
        {{
          "tasks": [
            {{
              "summary": "TODO title",
              "description": "TODO detail",
              "assignee_name": null,
              "assignee_open_id": null,
              "due": "YYYY-MM-DD or null",
              "reminder": null,
              "confidence": 0.0,
              "auto_dispatch": true,
              "evidence": ["evidence 1", "evidence 2"]
            }}
          ]
        }}

        `output/dispatch-result.json` schema:
        {{
          "mode": "lark",
          "cloud_document": {{
            "status": "created or failed",
            "title": "document title",
            "url": "document URL or null",
            "token": "document token or null",
            "raw": {{}},
            "error": null
          }},
          "created": [
            {{
              "summary": "TODO title",
              "task_id": "task id or null",
              "url": "task URL or null",
              "assignee_open_id": "current user open_id or null",
              "raw": {{}}
            }}
          ],
          "skipped": [],
          "failed": [
            {{
              "summary": "TODO title or cloud document",
              "reason": "Failure reason"
            }}
          ]
        }}

        Finish with one short Chinese summary sentence.
        """
    ).strip()


def agent_model_for(provider: str) -> str | None:
    explicit = os.environ.get("AGENT_CLI_MODEL", "").strip()
    if explicit:
        return explicit
    if provider == "codex":
        return os.environ.get("CODEX_MODEL", "gpt-5.4").strip() or "gpt-5.4"
    return None


def agent_fallback_model_for(provider: str) -> str | None:
    explicit = os.environ.get("AGENT_CLI_FALLBACK_MODEL", "").strip()
    if explicit:
        return explicit
    if provider == "codex":
        return os.environ.get("CODEX_FALLBACK_MODEL", "").strip() or None
    return None


def wrap_windows_batch(command: list[str]) -> list[str]:
    if sys.platform == "win32" and command and Path(command[0]).suffix.lower() == ".cmd":
        return ["cmd.exe", "/c", *command]
    return command


def build_agent_command(job_dir: Path, prompt_path: Path, provider: str, executable: str, model: str | None) -> AgentCommand:
    output_message = job_dir / "logs" / "agent-last-message.txt"
    short_instruction = (
        "Read intermediate/agent-prompt.md and complete the requested local outputs. "
        "You may read and write files in this job directory."
    )

    if provider == "codex":
        command = [
            executable,
            "exec",
            "--dangerously-bypass-approvals-and-sandbox",
            "--skip-git-repo-check",
            "--cd",
            str(job_dir),
            "--output-last-message",
            str(output_message),
        ]
        if model:
            command.extend(["-m", model])
        command.append("-")
        return AgentCommand(provider, wrap_windows_batch(command), model, prompt_path.read_text(encoding="utf-8"), output_message)

    if provider == "claude":
        command = [executable, "--print", "--dangerously-skip-permissions", short_instruction]
        if model:
            command[1:1] = ["--model", model]
        return AgentCommand(provider, wrap_windows_batch(command), model, None, output_message)

    if provider == "gemini":
        command = [executable, "--prompt", short_instruction, "--approval-mode=yolo"]
        if model:
            command.extend(["--model", model])
        return AgentCommand(provider, wrap_windows_batch(command), model, None, output_message)

    if provider == "custom":
        base = split_agent_args(executable)
        args_template = os.environ.get("AGENT_CLI_ARGS", "").strip()
        args = split_agent_args(args_template) if args_template else []
        replacements = {
            "{job_dir}": str(job_dir),
            "{prompt_file}": str(prompt_path),
            "{model}": model or "",
            "{output_message}": str(output_message),
        }
        expanded_args = []
        for arg in args:
            for placeholder, value in replacements.items():
                arg = arg.replace(placeholder, value)
            expanded_args.append(arg)
        use_stdin = os.environ.get("AGENT_CLI_STDIN", "false").strip().lower() in {"1", "true", "yes"}
        return AgentCommand(provider, wrap_windows_batch([*base, *expanded_args]), model, prompt_path.read_text(encoding="utf-8") if use_stdin else None, output_message)

    raise ValueError(f"Unsupported Agent CLI provider: {provider}")


def run_agent_cli(job_dir: Path, prompt: str) -> None:
    prompt_path = job_dir / "intermediate" / "agent-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    provider, executable = resolve_agent_provider()
    model = agent_model_for(provider)
    fallback_model = agent_fallback_model_for(provider)

    command = build_agent_command(job_dir, prompt_path, provider, executable, model)
    try:
        result = run_agent_process(command.command, job_dir, command.prompt_input)
        command.output_message.write_text(result.stdout or "", encoding="utf-8")
        write_json(
            job_dir / "intermediate" / "agent-cli.json",
            {
                "provider": provider,
                "command": command.command[0] if command.command else executable,
                "model": model,
                "fallback_used": False,
            },
        )
    except subprocess.CalledProcessError as exc:
        if not fallback_model:
            raise
        fallback_command = build_agent_command(job_dir, prompt_path, provider, executable, fallback_model)
        result = run_agent_process(fallback_command.command, job_dir, fallback_command.prompt_input)
        fallback_command.output_message.write_text(result.stdout or "", encoding="utf-8")
        write_json(
            job_dir / "intermediate" / "agent-cli.json",
            {
                "provider": provider,
                "command": fallback_command.command[0] if fallback_command.command else executable,
                "model": fallback_model,
                "fallback_used": True,
                "failed_model": model,
                "failed_return_code": exc.returncode,
            },
        )


def ensure_minimum_outputs(job_dir: Path) -> None:
    cleaned_path = job_dir / "output" / "cleaned-transcript.md"
    notes_path = job_dir / "output" / "meeting-notes.md"
    tasks_path = job_dir / "output" / "tasks-review.json"
    dispatch_path = job_dir / "output" / "dispatch-result.json"

    if not cleaned_path.exists():
        cleaned_path.write_text(
            "# Cleaned Transcript Digest\n\nAgent CLI did not write cleaned-transcript.md. Check `output/raw-speaker-transcript.md` first.\n",
            encoding="utf-8",
        )
    if not notes_path.exists():
        notes_path.write_text(
            "# Meeting Notes\n\nAgent CLI did not write meeting-notes.md. Check `output/raw-speaker-transcript.md` first.\n",
            encoding="utf-8",
        )
    if not tasks_path.exists():
        write_json(tasks_path, {"tasks": []})
    if not dispatch_path.exists():
        write_json(
            dispatch_path,
            {
                "mode": "lark",
                "cloud_document": {
                    "status": "failed",
                    "title": None,
                    "url": None,
                    "token": None,
                    "raw": {},
                    "error": "Agent CLI did not write dispatch-result.json",
                },
                "created": [],
                "skipped": [],
                "failed": [{"summary": "all", "reason": "Agent CLI did not write dispatch-result.json"}],
            },
        )


def first_value(payload: object, keys: list[str]) -> object | None:
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if value:
                return value
        for value in payload.values():
            found = first_value(value, keys)
            if found:
                return found
    if isinstance(payload, list):
        for value in payload:
            found = first_value(value, keys)
            if found:
                return found
    return None


def parse_cli_json(stdout: str, stderr: str = "") -> dict:
    raw = stdout.strip()
    if raw:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"stdout": raw}
    else:
        payload = {}
    if stderr.strip():
        payload["stderr"] = stderr.strip()
    return payload


def lark_command(args: list[str]) -> list[str]:
    lark_bin = which("lark-cli.cmd") or which("lark-cli") or which("lark-cli.ps1")
    if not lark_bin:
        raise FileNotFoundError("lark-cli was not found in PATH")

    if sys.platform == "win32":
        lark_dir = Path(lark_bin).parent
        node_script = lark_dir / "node_modules" / "@larksuite" / "cli" / "scripts" / "run.js"
        node_bin = which("node")
        if node_bin and node_script.exists():
            # Avoid cmd.exe argument truncation/corruption for multiline Markdown.
            return [node_bin, str(node_script), *args]

    if sys.platform == "win32" and Path(lark_bin).suffix.lower() == ".cmd":
        return ["cmd.exe", "/c", lark_bin, *args]
    return [lark_bin, *args]


def run_lark(args: list[str]) -> dict:
    result = run_capture(lark_command(args))
    return parse_cli_json(result.stdout, result.stderr)


def current_user_open_id() -> str | None:
    try:
        payload = run_lark(["auth", "status"])
    except Exception:
        return None
    value = first_value(payload, ["userOpenId", "open_id", "openId"])
    return str(value) if value else None


def infer_document_title(notes: str) -> str:
    for line in notes.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            return f"{line[:80]} - {datetime.now().date().isoformat()}"
    return f"Meeting Notes - {datetime.now().date().isoformat()}"


def task_description(task: dict, cloud_url: str | None) -> str:
    parts = []
    description = task.get("description")
    if description:
        parts.append(str(description))
    evidence = task.get("evidence") or []
    if evidence:
        parts.append("来源证据：\n" + "\n".join(f"- {item}" for item in evidence))
    if cloud_url:
        parts.append(f"会议纪要：{cloud_url}")
    return "\n\n".join(parts)


def fetched_document_markdown(doc: str) -> str:
    payload = run_lark(["docs", "+fetch", "--doc", doc, "--format", "json"])
    markdown = first_value(payload, ["markdown"])
    return str(markdown or "")


def ensure_document_body(cloud_document: dict, notes: str) -> None:
    doc = cloud_document.get("token") or cloud_document.get("url")
    if not doc:
        return

    try:
        markdown = fetched_document_markdown(str(doc))
        required_sections = ["重点项目", "项目跟进表", "详细纪要", "待办事项"]
        if len(markdown) >= 500 and all(section in markdown for section in required_sections):
            return
    except Exception:
        # Fall through and try to repair using overwrite.
        pass

    raw = run_lark(["docs", "+update", "--doc", str(doc), "--mode", "overwrite", "--markdown", notes])
    cloud_document["repair"] = {
        "status": "overwritten_after_fetch_validation",
        "raw": raw,
    }


def create_lark_artifacts(job_dir: Path) -> None:
    notes_path = job_dir / "output" / "meeting-notes.md"
    tasks_path = job_dir / "output" / "tasks-review.json"
    dispatch_path = job_dir / "output" / "dispatch-result.json"

    notes = notes_path.read_text(encoding="utf-8")
    tasks_payload = read_json(tasks_path)
    tasks = tasks_payload.get("tasks") or []
    assignee_open_id = current_user_open_id()

    existing_dispatch = read_json(dispatch_path) if dispatch_path.exists() else {}
    existing_cloud = existing_dispatch.get("cloud_document") or {}
    existing_created = existing_dispatch.get("created") or []
    created_by_summary = {
        item.get("summary"): item
        for item in existing_created
        if isinstance(item, dict)
        and item.get("summary")
        and (item.get("task_id") or item.get("url"))
        and (not assignee_open_id or item.get("assignee_open_id") == assignee_open_id)
    }

    failed: list[dict] = []
    created: list[dict] = []
    cloud_document = {
        "status": existing_cloud.get("status") or "failed",
        "title": existing_cloud.get("title") or infer_document_title(notes),
        "url": existing_cloud.get("url"),
        "token": existing_cloud.get("token"),
        "raw": existing_cloud.get("raw") or {},
        "error": existing_cloud.get("error"),
    }

    if cloud_document["status"] != "created" or not cloud_document["url"]:
        try:
            raw = run_lark(["docs", "+create", "--title", cloud_document["title"], "--markdown", notes])
            cloud_document.update(
                {
                    "status": "created",
                    "url": first_value(raw, ["doc_url", "url", "document_url"]),
                    "token": first_value(raw, ["doc_id", "token", "document_id", "file_token"]),
                    "raw": raw,
                    "error": None,
                }
            )
        except Exception as exc:
            reason = str(exc)
            cloud_document["status"] = "failed"
            cloud_document["error"] = reason
            failed.append({"summary": "cloud document", "reason": reason})

    if cloud_document["status"] == "created":
        try:
            ensure_document_body(cloud_document, notes)
        except Exception as exc:
            failed.append({"summary": "cloud document body", "reason": str(exc)})

    for index, task in enumerate(tasks, start=1):
        summary = str(task.get("summary") or f"Meeting TODO {index}")
        if summary in created_by_summary:
            created.append(created_by_summary[summary])
            continue

        idempotency_seed = f"{job_dir.name}:{index}:{summary}"
        if assignee_open_id:
            idempotency_seed = f"{idempotency_seed}:assignee:{assignee_open_id}"

        args = [
            "task",
            "+create",
            "--summary",
            summary,
            "--description",
            task_description(task, cloud_document.get("url")),
            "--idempotency-key",
            hashlib.sha256(idempotency_seed.encode("utf-8")).hexdigest()[:32],
            "--format",
            "json",
        ]
        if assignee_open_id:
            args.extend(["--assignee", assignee_open_id])
        due = task.get("due")
        if due:
            args.extend(["--due", str(due)])

        try:
            raw = run_lark(args)
            created.append(
                {
                    "summary": summary,
                    "task_id": first_value(raw, ["guid", "task_id", "id"]),
                    "url": first_value(raw, ["url", "app_link", "applink"]),
                    "assignee_open_id": assignee_open_id,
                    "raw": raw,
                }
            )
        except Exception as exc:
            failed.append({"summary": summary, "reason": str(exc)})

    write_json(
        dispatch_path,
        {
            "mode": "lark",
            "source_job": job_dir.name,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "cloud_document": cloud_document,
            "created": created,
            "skipped": [],
            "failed": failed,
            "assignment_policy": "assigned_to_current_user_for_visibility" if assignee_open_id else "unassigned_no_current_user_found",
        },
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-dir", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    job_dir = Path(args.job_dir).resolve()
    (job_dir / "logs").mkdir(parents=True, exist_ok=True)
    (job_dir / "output").mkdir(parents=True, exist_ok=True)
    (job_dir / "intermediate").mkdir(parents=True, exist_ok=True)

    write_status(job_dir, "processing", "audio", 0.22, "Extracting meeting audio")
    extract_audio(job_dir)

    write_status(job_dir, "processing", "transcript", 0.52, "Generating speaker transcript")
    transcript_path = run_media_transcript(job_dir)

    write_status(job_dir, "processing", "agent", 0.78, "Agent CLI is creating meeting notes, cloud document, and Lark To Dos")
    prompt = build_agent_prompt(job_dir, transcript_path)
    run_agent_cli(job_dir, prompt)

    ensure_minimum_outputs(job_dir)
    write_status(job_dir, "processing", "lark", 0.92, "Ensuring Lark cloud document and To Dos are created")
    create_lark_artifacts(job_dir)
    write_status(job_dir, "completed", "done", 1.0, "Processing completed")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        job_dir_arg = None
        if "--job-dir" in sys.argv:
            job_dir_arg = Path(sys.argv[sys.argv.index("--job-dir") + 1])
        if job_dir_arg:
            write_status(job_dir_arg, "failed", "error", 1.0, f"Processing failed: {exc}")
        raise
