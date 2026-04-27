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
