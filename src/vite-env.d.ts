/// <reference types="vite/client" />

type AppInfo = {
  platform: string;
  platformLabel: string;
  workspaceRoot: string;
  jobsRoot: string;
  isPackaged: boolean;
  captureAudioMode: string;
  permissions: {
    screen: string;
    microphone: string;
  };
  dependencies: {
    python: {
      available: boolean;
      command: string;
    };
    ffmpeg: {
      available: boolean;
      command: string;
    };
    codex: {
      available: boolean;
      command: string | null;
    };
    larkCli: {
      available: boolean;
      command: string | null;
    };
    mediaTranscript: {
      available: boolean;
      path: string | null;
    };
  };
  codexAvailable: boolean;
  larkCliAvailable: boolean;
};

type CaptureSource = {
  id: string;
  name: string;
  displayId: string;
  thumbnailDataUrl: string;
  appIconDataUrl: string | null;
};

type JobSummary = {
  id: string;
  path: string;
  metadata: {
    id: string;
    sourceId: string;
    sourceName: string;
    createdAt: string;
    endedAt?: string;
    platform: string;
    fileName: string;
  } | null;
  status: Record<string, unknown>;
};

type MeetingAssistantApi = {
  getAppInfo: () => Promise<AppInfo>;
  openSystemSettings: (section: "screen" | "microphone") => Promise<{ ok: true }>;
  listCaptureSources: () => Promise<CaptureSource[]>;
  prepareCaptureSource: (sourceId: string) => Promise<{ ok: true }>;
  createRecording: (payload: { sourceId: string; sourceName: string }) => Promise<{ jobId: string; filePath: string }>;
  appendRecordingChunk: (payload: { jobId: string; chunk: Uint8Array }) => Promise<{ ok: true }>;
  finishRecording: (payload: { jobId: string; durationMs: number }) => Promise<{ ok: true }>;
  cancelRecording: (jobId: string) => Promise<{ ok: true }>;
  listJobs: () => Promise<JobSummary[]>;
  getJob: (jobId: string) => Promise<JobSummary>;
  readTextFile: (filePath: string) => Promise<string | null>;
  startProcessing: (payload: { jobId: string }) => Promise<{ ok: true }>;
  revealInFolder: (jobId: string) => Promise<{ ok: true }>;
  openPath: (targetPath: string) => Promise<{ ok: true }>;
};

declare global {
  interface Window {
    meetingAssistant: MeetingAssistantApi;
  }
}

export {};
