#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const expectedPlatform = args.has("--mac") ? "darwin" : args.has("--win") ? "win32" : process.platform;
const strict = args.has("--strict");

function loadEnvFile() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return {};

  const values = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...valueParts] = line.split("=");
    values[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

const envFile = loadEnvFile();
const env = { ...envFile, ...process.env };

function run(command, commandArgs = []) {
  return spawnSync(command, commandArgs, {
    encoding: "utf8",
    windowsHide: true,
    shell: false
  });
}

function commandExists(command) {
  const lookup = process.platform === "win32" ? "where" : "which";
  return run(lookup, [command]).status === 0;
}

function firstAvailable(commands) {
  return commands.find((command) => commandExists(command)) ?? null;
}

function parseVersion(text) {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: match[0]
  };
}

function versionAtLeast(version, major, minor) {
  if (!version) return false;
  return version.major > major || (version.major === major && version.minor >= minor);
}

function pythonInfo() {
  const candidates = env.PYTHON_BIN ? [env.PYTHON_BIN] : expectedPlatform === "win32" ? ["python", "py"] : ["python3", "python"];
  for (const candidate of candidates) {
    const result = run(candidate, ["--version"]);
    if (result.status === 0) {
      const output = `${result.stdout} ${result.stderr}`.trim();
      return { command: candidate, version: parseVersion(output), output };
    }
  }
  return null;
}

function mediaTranscriptPath() {
  const candidates = [
    env.MEDIA_TRANSCRIPT_SCRIPT,
    join(root, "tools", "media-transcript", "scripts", "run_media_transcript.py"),
    join(homedir(), ".codex", "skills", "media-transcript", "scripts", "run_media_transcript.py")
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function platformCommandNames(command) {
  return expectedPlatform === "win32" ? [`${command}.cmd`, command] : [command];
}

function normalizeAgentProvider(provider) {
  const normalized = (provider || "auto").trim().toLowerCase() || "auto";
  if (normalized === "cloud" || normalized === "claude-code") return "claude";
  return normalized;
}

function detectAgentCli() {
  const configuredProvider = normalizeAgentProvider(env.AGENT_CLI_PROVIDER || "auto");
  const customCommand = (env.AGENT_CLI_COMMAND || "").trim();
  const model = env.AGENT_CLI_MODEL || (env.CODEX_MODEL && configuredProvider === "codex" ? env.CODEX_MODEL : "");

  if (configuredProvider === "custom") {
    return {
      ok: Boolean(customCommand),
      provider: "custom",
      command: customCommand || "not configured",
      model
    };
  }

  if (configuredProvider !== "auto") {
    const command = firstAvailable(platformCommandNames(configuredProvider));
    return {
      ok: Boolean(command),
      provider: configuredProvider,
      command: command ?? "not found",
      model
    };
  }

  if (customCommand) {
    return {
      ok: true,
      provider: "custom",
      command: customCommand,
      model
    };
  }

  for (const provider of ["claude", "gemini", "codex"]) {
    const command = firstAvailable(platformCommandNames(provider));
    if (command) {
      return {
        ok: true,
        provider,
        command,
        model: env.AGENT_CLI_MODEL || (provider === "codex" ? env.CODEX_MODEL || "gpt-5.4" : "")
      };
    }
  }

  return {
    ok: false,
    provider: "auto",
    command: "not found",
    model
  };
}

function printCheck(check) {
  const status = check.ok ? "ok" : check.required ? "missing" : "warn";
  const suffix = check.detail ? ` - ${check.detail}` : "";
  console.log(`[${status}] ${check.label}${suffix}`);
  if (!check.ok && check.help) {
    console.log(`      ${check.help}`);
  }
}

const nodeVersion = parseVersion(process.versions.node);
const python = pythonInfo();
const agentCli = detectAgentCli();
const checks = [
  {
    label: "Node.js 20+",
    ok: versionAtLeast(nodeVersion, 20, 0),
    required: true,
    detail: nodeVersion ? `found ${nodeVersion.raw}` : "not found",
    help: "Install Node.js 20 or newer, then run npm install again."
  },
  {
    label: ".env file",
    ok: existsSync(join(root, ".env")),
    required: false,
    detail: existsSync(join(root, ".env")) ? "ready" : "not created yet",
    help: "Run npm run setup:mac or copy .env.example to .env."
  },
  {
    label: "Python 3.11+",
    ok: Boolean(python && versionAtLeast(python.version, 3, 11)),
    required: false,
    detail: python ? `${python.command} ${python.version?.raw ?? python.output}` : "not found",
    help: expectedPlatform === "darwin" ? "Install with: brew install python@3.12" : "Install Python 3.11 or newer."
  },
  {
    label: "ffmpeg",
    ok: commandExists("ffmpeg"),
    required: false,
    detail: commandExists("ffmpeg") ? "available" : "not found",
    help: expectedPlatform === "darwin" ? "Install with: brew install ffmpeg" : "Install ffmpeg and make it available in PATH."
  },
  {
    label: "Agent CLI",
    ok: agentCli.ok,
    required: false,
    detail: `${agentCli.provider}: ${agentCli.command}${agentCli.model ? `, model ${agentCli.model}` : ""}`,
    help: "Install and sign in to Claude Code CLI, Gemini CLI, Codex CLI, or set AGENT_CLI_PROVIDER=custom with AGENT_CLI_COMMAND."
  },
  {
    label: "Lark CLI",
    ok: Boolean(firstAvailable(expectedPlatform === "win32" ? ["lark-cli.cmd", "lark-cli"] : ["lark-cli"])),
    required: false,
    detail: firstAvailable(expectedPlatform === "win32" ? ["lark-cli.cmd", "lark-cli"] : ["lark-cli"]) ?? "not found",
    help: "Install and authorize lark-cli before dispatching docs and To Dos."
  },
  {
    label: "media-transcript script",
    ok: Boolean(mediaTranscriptPath()),
    required: false,
    detail: mediaTranscriptPath() ?? "not found",
    help: "Set MEDIA_TRANSCRIPT_SCRIPT in .env or install the media-transcript skill."
  }
];

console.log("Feishu Meeting Assistant doctor");
console.log(`Repository: ${root}`);
console.log(`Mode: ${expectedPlatform === "darwin" ? "macOS local source run" : process.platform}`);
console.log("");

for (const check of checks) {
  printCheck(check);
}

if (expectedPlatform === "darwin") {
  console.log("");
  console.log("macOS permissions are granted by the system after the app starts:");
  console.log("- Screen Recording: required to capture the selected meeting window.");
  console.log("- Microphone: required unless you route system audio through a virtual input.");
  console.log("- For system audio, configure BlackHole, Loopback, or another virtual audio device as input.");
}

const missingRequired = checks.filter((check) => check.required && !check.ok);
const missingRuntime = checks.filter((check) => !check.required && !check.ok);

console.log("");
if (missingRequired.length > 0) {
  console.log("Result: required launch checks failed.");
  process.exitCode = 1;
} else if (missingRuntime.length > 0) {
  console.log("Result: the app can launch, but full meeting processing needs the missing runtime tools above.");
  process.exitCode = strict ? 1 : 0;
} else {
  console.log("Result: local runtime checks passed.");
}
