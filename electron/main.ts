import { app, BrowserWindow, Menu, desktopCapturer, ipcMain, session, shell, systemPreferences } from "electron";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

type SourceSummary = {
  id: string;
  name: string;
  displayId: string;
  thumbnailDataUrl: string;
  appIconDataUrl: string | null;
};

type JobMetadata = {
  id: string;
  sourceId: string;
  sourceName: string;
  createdAt: string;
  endedAt?: string;
  platform: NodeJS.Platform;
  fileName: string;
};

type RecordingHandle = {
  stream: ReturnType<typeof createWriteStream>;
  filePath: string;
};

const activeRecordings = new Map<string, RecordingHandle>();
const activeProcesses = new Map<string, ReturnType<typeof spawn>>();
let mainWindow: BrowserWindow | null = null;
let pendingSourceId: string | null = null;
const isMac = process.platform === "darwin";

function getPlatformLabel() {
  if (process.platform === "darwin") return "macOS";
  if (process.platform === "win32") return "Windows";
  if (process.platform === "linux") return "Linux";
  return process.platform;
}

function getWorkspaceRoot() {
  return app.isPackaged ? join(app.getPath("documents"), "FeishuMeetingAssistant") : process.cwd();
}

function getJobsRoot() {
  const jobsRoot = join(getWorkspaceRoot(), "jobs");
  mkdirSync(jobsRoot, { recursive: true });
  return jobsRoot;
}

function getJobPath(jobId: string) {
  return join(getJobsRoot(), jobId);
}

function getProcessorScriptPath() {
  return app.isPackaged
    ? join(process.resourcesPath, "scripts", "process_job.py")
    : join(getWorkspaceRoot(), "scripts", "process_job.py");
}

function loadDotEnv() {
  const envPath = join(getWorkspaceRoot(), ".env");
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...valueParts] = line.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function commandAvailable(command: string) {
  const lookup = process.platform === "win32" ? "where" : "which";
  return spawnSync(lookup, [command], { stdio: "ignore" }).status === 0;
}

function platformCommandNames(command: string) {
  return process.platform === "win32" ? [`${command}.cmd`, command] : [command];
}

function findCommand(commands: string[]) {
  return commands.find((command) => commandAvailable(command)) ?? null;
}

function getPythonCommand() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === "win32" ? "python" : "python3";
}

function getMediaAccessStatus(mediaType: "screen" | "microphone") {
  if (!isMac) return "not-required";

  try {
    return systemPreferences.getMediaAccessStatus(
      mediaType as Parameters<typeof systemPreferences.getMediaAccessStatus>[0]
    );
  } catch {
    return "unknown";
  }
}

function getCaptureAudioMode() {
  if (process.platform === "win32") {
    return "system-loopback";
  }

  if (isMac) {
    return "microphone-or-loopback-input";
  }

  return "input-device";
}

function getMediaTranscriptScriptPath() {
  const candidates = [
    process.env.MEDIA_TRANSCRIPT_SCRIPT,
    join(getWorkspaceRoot(), "tools", "media-transcript", "scripts", "run_media_transcript.py"),
    join(homedir(), ".codex", "skills", "media-transcript", "scripts", "run_media_transcript.py")
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function getAgentCliStatus() {
  const configuredProvider = (process.env.AGENT_CLI_PROVIDER || "auto").trim().toLowerCase() || "auto";
  const customCommand = (process.env.AGENT_CLI_COMMAND || "").trim();
  const normalizedProvider =
    configuredProvider === "cloud" || configuredProvider === "claude-code" ? "claude" : configuredProvider;

  if (normalizedProvider === "custom") {
    return {
      available: Boolean(customCommand),
      provider: "custom",
      configuredProvider,
      command: customCommand || null,
      model: process.env.AGENT_CLI_MODEL || null
    };
  }

  if (normalizedProvider !== "auto") {
    const command = findCommand(platformCommandNames(normalizedProvider));
    return {
      available: Boolean(command),
      provider: normalizedProvider,
      configuredProvider,
      command,
      model: process.env.AGENT_CLI_MODEL || null
    };
  }

  if (customCommand) {
    return {
      available: true,
      provider: "custom",
      configuredProvider,
      command: customCommand,
      model: process.env.AGENT_CLI_MODEL || null
    };
  }

  for (const provider of ["claude", "gemini", "codex"]) {
    const command = findCommand(platformCommandNames(provider));
    if (command) {
      return {
        available: true,
        provider,
        configuredProvider,
        command,
        model: process.env.AGENT_CLI_MODEL || (provider === "codex" ? process.env.CODEX_MODEL || "gpt-5.4" : null)
      };
    }
  }

  return {
    available: false,
    provider: null,
    configuredProvider,
    command: null,
    model: process.env.AGENT_CLI_MODEL || null
  };
}

function getDependencyStatus() {
  const larkCliCommand = findCommand(platformCommandNames("lark-cli"));
  const pythonCommand = getPythonCommand();
  const mediaTranscriptScript = getMediaTranscriptScriptPath();
  const agentCli = getAgentCliStatus();

  return {
    python: {
      available: commandAvailable(pythonCommand),
      command: pythonCommand
    },
    ffmpeg: {
      available: commandAvailable("ffmpeg"),
      command: "ffmpeg"
    },
    agentCli,
    larkCli: {
      available: Boolean(larkCliCommand),
      command: larkCliCommand
    },
    mediaTranscript: {
      available: Boolean(mediaTranscriptScript),
      path: mediaTranscriptScript
    }
  };
}

function ensureJobSubdirs(jobId: string) {
  const jobPath = getJobPath(jobId);
  for (const relative of ["input", "intermediate", "output", "logs"]) {
    mkdirSync(join(jobPath, relative), { recursive: true });
  }
}

function writeJson(filePath: string, payload: unknown) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getJobSummary(jobId: string) {
  const jobPath = getJobPath(jobId);
  const metadata = readJsonSafe<JobMetadata>(join(jobPath, "input", "capture-metadata.json"));
  const status = readJsonSafe<Record<string, unknown>>(join(jobPath, "status.json")) ?? { status: "idle" };

  return {
    id: jobId,
    path: jobPath,
    metadata,
    status
  };
}

async function listSources(): Promise<SourceSummary[]> {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    displayId: source.display_id,
    thumbnailDataUrl: source.thumbnail.toDataURL(),
    appIconDataUrl: source.appIcon ? source.appIcon.toDataURL() : null
  }));
}

function createMainWindow() {
  const devServerUrl = process.env.MEETING_ASSISTANT_DEV_SERVER_URL;
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: !isMac,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    title: "Feishu Meeting Assistant",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(app.getAppPath(), "dist", "index.html"));
  }
}

function createApplicationMenu() {
  if (!isMac) {
    Menu.setApplicationMenu(null);
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Open Screen Recording Settings",
          click: () => {
            shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
          }
        },
        {
          label: "Open Microphone Settings",
          click: () => {
            shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
          }
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["window", "screen"],
          thumbnailSize: { width: 1, height: 1 }
        });

        const matchedSource = sources.find((source) => source.id === pendingSourceId) ?? sources[0];
        if (!matchedSource) {
          callback({});
          return;
        }

        if (process.platform === "win32") {
          callback({
            video: matchedSource,
            audio: "loopback"
          });
        } else {
          callback({
            video: matchedSource
          });
        }
      } finally {
        pendingSourceId = null;
      }
    },
    { useSystemPicker: false }
  );
}

function registerIpcHandlers() {
  ipcMain.handle("app:get-info", () => {
    const dependencies = getDependencyStatus();
    return {
      platform: process.platform,
      platformLabel: getPlatformLabel(),
      workspaceRoot: getWorkspaceRoot(),
      jobsRoot: getJobsRoot(),
      isPackaged: app.isPackaged,
      captureAudioMode: getCaptureAudioMode(),
      permissions: {
        screen: getMediaAccessStatus("screen"),
        microphone: getMediaAccessStatus("microphone")
      },
      dependencies,
      agentCliAvailable: dependencies.agentCli.available,
      larkCliAvailable: dependencies.larkCli.available
    };
  });

  ipcMain.handle("app:open-system-settings", async (_event, section: "screen" | "microphone") => {
    if (!isMac) return { ok: true };

    const url =
      section === "screen"
        ? "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        : "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("capture:list-sources", async () => listSources());

  ipcMain.handle("capture:prepare-source", async (_event, sourceId: string) => {
    pendingSourceId = sourceId;
    return { ok: true };
  });

  ipcMain.handle(
    "jobs:create-recording",
    async (_event, payload: { sourceId: string; sourceName: string }) => {
      const jobId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`;
      ensureJobSubdirs(jobId);

      const fileName = "meeting.webm";
      const filePath = join(getJobPath(jobId), "input", fileName);
      const stream = createWriteStream(filePath);
      activeRecordings.set(jobId, { stream, filePath });

      const metadata: JobMetadata = {
        id: jobId,
        sourceId: payload.sourceId,
        sourceName: payload.sourceName,
        createdAt: new Date().toISOString(),
        platform: process.platform,
        fileName
      };

      writeJson(join(getJobPath(jobId), "input", "capture-metadata.json"), metadata);
      writeJson(join(getJobPath(jobId), "status.json"), {
        status: "recording",
        stage: "capture",
        progress: 0.05,
        message: "Recording Feishu meeting window",
        updatedAt: new Date().toISOString()
      });

      return { jobId, filePath };
    }
  );

  ipcMain.handle("jobs:append-recording-chunk", async (_event, payload: { jobId: string; chunk: Uint8Array }) => {
    const handle = activeRecordings.get(payload.jobId);
    if (!handle) {
      throw new Error("Recording session not found.");
    }

    handle.stream.write(Buffer.from(payload.chunk));
    return { ok: true };
  });

  ipcMain.handle("jobs:finish-recording", async (_event, payload: { jobId: string; durationMs: number }) => {
    const handle = activeRecordings.get(payload.jobId);
    if (!handle) {
      throw new Error("Recording session not found.");
    }

    await new Promise<void>((resolve) => handle.stream.end(() => resolve()));
    activeRecordings.delete(payload.jobId);

    const metadataPath = join(getJobPath(payload.jobId), "input", "capture-metadata.json");
    const metadata = readJsonSafe<JobMetadata>(metadataPath);
    if (metadata) {
      metadata.endedAt = new Date().toISOString();
      writeJson(metadataPath, metadata);
    }

    writeJson(join(getJobPath(payload.jobId), "status.json"), {
      status: "recorded",
      stage: "capture",
      progress: 0.1,
      durationMs: payload.durationMs,
      message: "Recording saved. Ready to process.",
      updatedAt: new Date().toISOString()
    });

    return { ok: true };
  });

  ipcMain.handle("jobs:cancel-recording", async (_event, jobId: string) => {
    const handle = activeRecordings.get(jobId);
    if (handle) {
      handle.stream.destroy();
      activeRecordings.delete(jobId);
    }

    rmSync(getJobPath(jobId), { recursive: true, force: true });
    return { ok: true };
  });

  ipcMain.handle("jobs:list", async () => {
    const root = getJobsRoot();
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => getJobSummary(entry.name))
      .sort((a, b) => {
        const left = a.metadata?.createdAt ?? "";
        const right = b.metadata?.createdAt ?? "";
        return right.localeCompare(left);
      });
  });

  ipcMain.handle("jobs:get", async (_event, jobId: string) => getJobSummary(jobId));

  ipcMain.handle("jobs:read-text-file", async (_event, filePath: string) => {
    return existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
  });

  ipcMain.handle("jobs:reveal-in-folder", async (_event, jobId: string) => {
    shell.showItemInFolder(getJobPath(jobId));
    return { ok: true };
  });

  ipcMain.handle("jobs:open-path", async (_event, targetPath: string) => {
    await shell.openPath(targetPath);
    return { ok: true };
  });

  ipcMain.handle("jobs:start-processing", async (_event, payload: { jobId: string }) => {
    if (activeProcesses.has(payload.jobId)) {
      return { ok: true };
    }

    const jobPath = getJobPath(payload.jobId);
    const logsDir = join(jobPath, "logs");
    const scriptPath = getProcessorScriptPath();

    mkdirSync(logsDir, { recursive: true });
    writeJson(join(jobPath, "status.json"), {
      status: "processing",
      stage: "bootstrap",
      progress: 0.12,
      message: "Preparing meeting assets",
      updatedAt: new Date().toISOString()
    });

    const child = spawn(getPythonCommand(), [scriptPath, "--job-dir", jobPath], {
      cwd: getWorkspaceRoot(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    activeProcesses.set(payload.jobId, child);

    const stdoutStream = createWriteStream(join(logsDir, "processor.stdout.log"));
    const stderrStream = createWriteStream(join(logsDir, "processor.stderr.log"));

    child.stdout.pipe(stdoutStream);
    child.stderr.pipe(stderrStream);

    child.on("close", (code) => {
      activeProcesses.delete(payload.jobId);
      if (code !== 0) {
        writeJson(join(jobPath, "status.json"), {
          status: "failed",
          stage: "processing",
          progress: 1,
          message: "Processing failed. Check processor logs.",
          code,
          updatedAt: new Date().toISOString()
        });
      }
    });

    return { ok: true };
  });
}

app.whenReady().then(() => {
  app.setName("Feishu Meeting Assistant");
  loadDotEnv();
  createApplicationMenu();
  setupDisplayMediaHandler();
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
