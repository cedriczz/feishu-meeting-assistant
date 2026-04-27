import { contextBridge, ipcRenderer } from "electron";

const api = {
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  openSystemSettings: (section: "screen" | "microphone") =>
    ipcRenderer.invoke("app:open-system-settings", section),
  listCaptureSources: () => ipcRenderer.invoke("capture:list-sources"),
  prepareCaptureSource: (sourceId: string) => ipcRenderer.invoke("capture:prepare-source", sourceId),
  createRecording: (payload: { sourceId: string; sourceName: string }) =>
    ipcRenderer.invoke("jobs:create-recording", payload),
  appendRecordingChunk: (payload: { jobId: string; chunk: Uint8Array }) =>
    ipcRenderer.invoke("jobs:append-recording-chunk", payload),
  finishRecording: (payload: { jobId: string; durationMs: number }) =>
    ipcRenderer.invoke("jobs:finish-recording", payload),
  cancelRecording: (jobId: string) => ipcRenderer.invoke("jobs:cancel-recording", jobId),
  listJobs: () => ipcRenderer.invoke("jobs:list"),
  getJob: (jobId: string) => ipcRenderer.invoke("jobs:get", jobId),
  readTextFile: (filePath: string) => ipcRenderer.invoke("jobs:read-text-file", filePath),
  startProcessing: (payload: { jobId: string }) => ipcRenderer.invoke("jobs:start-processing", payload),
  revealInFolder: (jobId: string) => ipcRenderer.invoke("jobs:reveal-in-folder", jobId),
  openPath: (targetPath: string) => ipcRenderer.invoke("jobs:open-path", targetPath)
};

contextBridge.exposeInMainWorld("meetingAssistant", api);
