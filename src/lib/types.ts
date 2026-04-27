export type AppInfo = {
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

export type CaptureSource = {
  id: string;
  name: string;
  displayId: string;
  thumbnailDataUrl: string;
  appIconDataUrl: string | null;
};

export type JobSummary = {
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
