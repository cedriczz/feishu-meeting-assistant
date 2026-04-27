import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  Desktop,
  FolderOpen,
  Play,
  Record,
  Stop,
  TerminalWindow,
  WarningCircle
} from "@phosphor-icons/react";
import type { AppInfo, CaptureSource, JobSummary } from "./lib/types";

type JobArtifacts = {
  notes: string | null;
  transcript: string | null;
  tasks: string | null;
  dispatch: string | null;
};

function formatDate(value?: string) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "recording":
      return "bg-red-500/12 text-red-700 ring-red-500/20 dark:text-red-200";
    case "processing":
      return "bg-sky-500/12 text-sky-700 ring-sky-500/20 dark:text-sky-200";
    case "completed":
      return "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:text-emerald-200";
    case "failed":
      return "bg-amber-500/12 text-amber-700 ring-amber-500/20 dark:text-amber-200";
    default:
      return "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-300";
  }
}

function permissionTone(status?: string) {
  if (status === "granted" || status === "not-required") {
    return {
      label: status === "granted" ? "已授权" : "无需授权",
      className: "text-emerald-700 bg-emerald-500/10 ring-emerald-500/20 dark:text-emerald-200",
      icon: CheckCircle
    };
  }

  if (status === "denied" || status === "restricted") {
    return {
      label: "需处理",
      className: "text-amber-700 bg-amber-500/10 ring-amber-500/20 dark:text-amber-200",
      icon: WarningCircle
    };
  }

  return {
    label: status === "not-determined" ? "待授权" : "待检查",
    className: "text-zinc-700 bg-zinc-500/10 ring-zinc-500/20 dark:text-zinc-300",
    icon: WarningCircle
  };
}

function dependencyTone(available?: boolean) {
  if (available) {
    return {
      label: "已就绪",
      className: "text-emerald-700 bg-emerald-500/10 ring-emerald-500/20 dark:text-emerald-200",
      icon: CheckCircle
    };
  }

  return {
    label: "待安装",
    className: "text-amber-700 bg-amber-500/10 ring-amber-500/20 dark:text-amber-200",
    icon: WarningCircle
  };
}

function audioModeLabel(mode?: string) {
  switch (mode) {
    case "system-loopback":
      return "系统声音";
    case "microphone-or-loopback-input":
      return "麦克风/虚拟声卡";
    default:
      return "输入设备";
  }
}

async function supportedMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [artifacts, setArtifacts] = useState<JobArtifacts>({ notes: null, transcript: null, tasks: null, dispatch: null });
  const [loadingSources, setLoadingSources] = useState(true);
  const [refreshingJobs, setRefreshingJobs] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("就绪");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);
  const isMac = appInfo?.platform === "darwin";

  async function refreshAppInfo() {
    const info = await window.meetingAssistant.getAppInfo();
    setAppInfo(info);
  }

  async function loadSources() {
    setLoadingSources(true);
    try {
      const nextSources = await window.meetingAssistant.listCaptureSources();
      setSources(nextSources);
      if (!selectedSourceId && nextSources[0]) {
        setSelectedSourceId(nextSources[0].id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法读取可录制窗口。");
    } finally {
      setLoadingSources(false);
    }
  }

  async function loadJobs(selectNewest = false) {
    setRefreshingJobs(true);
    try {
      const nextJobs = await window.meetingAssistant.listJobs();
      setJobs(nextJobs);
      if (selectNewest && nextJobs[0]) {
        setSelectedJobId(nextJobs[0].id);
      } else if (!selectedJobId && nextJobs[0]) {
        setSelectedJobId(nextJobs[0].id);
      }
    } finally {
      setRefreshingJobs(false);
    }
  }

  async function loadArtifacts(job: JobSummary | null) {
    if (!job) {
      setArtifacts({ notes: null, transcript: null, tasks: null, dispatch: null });
      return;
    }

    const base = job.path.replace(/\\/g, "/");
    const [notes, transcript, tasks, dispatch] = await Promise.all([
      window.meetingAssistant.readTextFile(`${base}/output/meeting-notes.md`),
      window.meetingAssistant.readTextFile(`${base}/output/raw-speaker-transcript.md`),
      window.meetingAssistant.readTextFile(`${base}/output/tasks-review.json`),
      window.meetingAssistant.readTextFile(`${base}/output/dispatch-result.json`)
    ]);

    setArtifacts({ notes, transcript, tasks, dispatch });
  }

  useEffect(() => {
    refreshAppInfo().catch(() => undefined);
    loadSources().catch(() => undefined);
    loadJobs(true).catch(() => undefined);
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      loadJobs(false).catch(() => undefined);
      refreshAppInfo().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(poll);
  }, [selectedJobId]);

  useEffect(() => {
    loadArtifacts(selectedJob).catch(() => undefined);
  }, [selectedJob]);

  useEffect(() => {
    if (!recording) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 500);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [recording]);

  async function createCaptureStream(source: CaptureSource) {
    await window.meetingAssistant.prepareCaptureSource(source.id);

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: appInfo?.platform === "win32"
    });

    let stream = displayStream;
    if (isMac && displayStream.getAudioTracks().length === 0) {
      const audioStream = await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        .catch((error) => {
          displayStream.getTracks().forEach((track) => track.stop());
          throw error;
        });
      stream = new MediaStream([...displayStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
    }

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("没有可用音频轨道。请确认系统声音、麦克风或虚拟声卡输入已授权。");
    }

    return stream;
  }

  async function startRecording() {
    if (!selectedSource) {
      setErrorMessage("请先选择会议窗口。");
      return;
    }

    setErrorMessage(null);
    setRecordingMessage("准备录制");

    try {
      const stream = await createCaptureStream(selectedSource);
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
      }

      const { jobId } = await window.meetingAssistant.createRecording({
        sourceId: selectedSource.id,
        sourceName: selectedSource.name
      });

      const mimeType = await supportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      setActiveJobId(jobId);
      setSelectedJobId(jobId);
      setRecording(true);
      setRecordingMessage("录制中");
      startedAtRef.current = Date.now();
      setElapsedMs(0);

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0) return;
        const buffer = new Uint8Array(await event.data.arrayBuffer());
        await window.meetingAssistant.appendRecordingChunk({ jobId, chunk: buffer });
      };

      recorder.onerror = (event) => {
        setErrorMessage(event.error?.message ?? "录制失败。");
      };

      recorder.start(1000);
      await loadJobs(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法开始录制。");
      setRecording(false);
      setRecordingMessage("就绪");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function stopRecording() {
    if (!recorderRef.current || !activeJobId) return;

    setRecordingMessage("保存录制");
    await new Promise<void>((resolve) => {
      const recorder = recorderRef.current!;
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);

    await window.meetingAssistant.finishRecording({
      jobId: activeJobId,
      durationMs: Date.now() - startedAtRef.current
    });
    await window.meetingAssistant.startProcessing({ jobId: activeJobId });

    setRecordingMessage("处理中");
    setActiveJobId(null);
    await loadJobs(true);
  }

  const readinessItems = [
    { label: "屏幕录制", value: appInfo?.permissions.screen, action: "screen" as const },
    { label: "音频输入", value: appInfo?.permissions.microphone, action: "microphone" as const }
  ];
  const dependencyItems = appInfo
    ? [
        { label: "Python", detail: appInfo.dependencies.python.command, available: appInfo.dependencies.python.available },
        { label: "ffmpeg", detail: appInfo.dependencies.ffmpeg.command, available: appInfo.dependencies.ffmpeg.available },
        { label: "Codex CLI", detail: appInfo.dependencies.codex.command ?? "codex", available: appInfo.dependencies.codex.available },
        { label: "Lark CLI", detail: appInfo.dependencies.larkCli.command ?? "lark-cli", available: appInfo.dependencies.larkCli.available },
        {
          label: "media-transcript",
          detail: appInfo.dependencies.mediaTranscript.path ?? "MEDIA_TRANSCRIPT_SCRIPT",
          available: appInfo.dependencies.mediaTranscript.available
        }
      ]
    : [];

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-zinc-100">
      <header className={`app-drag-region border-b border-white/10 bg-zinc-950/90 px-5 py-3 ${isMac ? "pl-24" : ""}`}>
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-500">Feishu Meeting Assistant</p>
            <h1 className="text-lg font-semibold tracking-normal text-white">会议纪要 + 任务派发助手</h1>
          </div>
          <div className="app-no-drag flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-300">{appInfo?.platformLabel ?? "检测平台"}</span>
            <span className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-300">
              音频：{audioModeLabel(appInfo?.captureAudioMode)}
            </span>
            <span
              className={`rounded-md px-2.5 py-1 ring-1 ${
                appInfo?.codexAvailable
                  ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20"
                  : "bg-amber-500/10 text-amber-200 ring-amber-500/20"
              }`}
            >
              Codex {appInfo?.codexAvailable ? "可用" : "未检测"}
            </span>
            <span
              className={`rounded-md px-2.5 py-1 ring-1 ${
                appInfo?.larkCliAvailable
                  ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20"
                  : "bg-amber-500/10 text-amber-200 ring-amber-500/20"
              }`}
            >
              Lark CLI {appInfo?.larkCliAvailable ? "可用" : "未检测"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-5 px-4 py-5 md:px-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-lg border border-white/10 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-500">录制来源</p>
                <h2 className="mt-1 text-base font-semibold text-white">会议窗口</h2>
              </div>
              <button
                onClick={() => loadSources()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                aria-label="刷新录制来源"
              >
                {loadingSources ? <CircleNotch size={18} className="animate-spin" /> : <ArrowsClockwise size={18} />}
              </button>
            </div>

            <div className="mt-4 max-h-[590px] space-y-3 overflow-auto pr-1">
              {sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => setSelectedSourceId(source.id)}
                  className={`w-full rounded-lg border p-2 text-left transition ${
                    selectedSourceId === source.id
                      ? "border-sky-300/60 bg-sky-400/10"
                      : "border-white/10 bg-zinc-950/70 hover:border-white/25"
                  }`}
                >
                  <img src={source.thumbnailDataUrl} alt={source.name} className="aspect-video w-full rounded-md object-cover" />
                  <p className="mt-2 truncate text-sm font-medium text-zinc-100">{source.name}</p>
                  <p className="truncate font-mono text-[11px] text-zinc-500">{source.id}</p>
                </button>
              ))}
              {!loadingSources && sources.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-zinc-400">
                  未读取到窗口。macOS 首次使用需要在系统设置里允许屏幕录制。
                </div>
              )}
            </div>
          </section>

          {appInfo && (
            <section className="rounded-lg border border-white/10 bg-zinc-900 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Desktop size={18} />
                Mac 适配检查
              </div>
              <div className="mt-4 space-y-2">
                {readinessItems.map((item) => {
                  const tone = permissionTone(item.value);
                  const Icon = tone.icon;
                  return (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-md bg-zinc-950/70 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-300">
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </div>
                      {isMac ? (
                        <button
                          onClick={() => window.meetingAssistant.openSystemSettings(item.action).then(() => refreshAppInfo())}
                          className={`rounded-md px-2 py-1 text-xs ring-1 ${tone.className}`}
                        >
                          {tone.label}
                        </button>
                      ) : (
                        <span className={`rounded-md px-2 py-1 text-xs ring-1 ${tone.className}`}>{tone.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-xs text-zinc-500">本地依赖</p>
                <div className="mt-3 space-y-2">
                  {dependencyItems.map((item) => {
                    const tone = dependencyTone(item.available);
                    const Icon = tone.icon;
                    return (
                      <div key={item.label} className="flex items-center justify-between gap-3 rounded-md bg-zinc-950/70 px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm text-zinc-300">
                            <Icon size={16} />
                            <span>{item.label}</span>
                          </div>
                          <p className="mt-1 truncate font-mono text-[11px] text-zinc-600">{item.detail}</p>
                        </div>
                        <span className={`shrink-0 rounded-md px-2 py-1 text-xs ring-1 ${tone.className}`}>{tone.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </aside>

        <main className="space-y-5">
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-lg border border-white/10 bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-xs text-zinc-500">Capture</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">录制会议</h2>
                </div>
                <span className={`rounded-md px-2.5 py-1 text-xs ring-1 ${recording ? "bg-red-500/15 text-red-200 ring-red-500/25" : "bg-white/[0.06] text-zinc-300 ring-white/10"}`}>
                  {recording ? "REC" : "IDLE"}
                </span>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
                  <video ref={previewRef} autoPlay muted className="aspect-video w-full object-contain" />
                  {!recording && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-center">
                      <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-zinc-300">
                        <Record size={28} weight="duotone" />
                      </div>
                      <div className="max-w-[44ch] px-5">
                        <p className="truncate text-base font-medium text-zinc-100">{selectedSource?.name ?? "请选择会议窗口"}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">停止录制后会自动进入转写、纪要和任务派发流程。</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-between rounded-lg border border-white/10 bg-zinc-950/70 p-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-zinc-500">状态</p>
                      <p className="mt-1 text-lg font-semibold text-white">{recordingMessage}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">时长</p>
                      <p className="mt-1 font-mono text-2xl text-white">{formatDuration(elapsedMs)}</p>
                    </div>
                    {errorMessage && (
                      <div className="rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-100">
                        {errorMessage}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={recording ? stopRecording : startRecording}
                    disabled={!recording && !selectedSource}
                    className={`mt-5 inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      recording ? "bg-red-500 text-white hover:bg-red-400" : "bg-white text-zinc-950 hover:bg-zinc-100"
                    }`}
                  >
                    {recording ? <Stop size={18} weight="fill" /> : <Play size={18} weight="fill" />}
                    {recording ? "停止并处理" : "开始录制"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-zinc-100 p-5 text-zinc-950">
              <p className="text-xs text-zinc-500">流水线</p>
              <h2 className="mt-1 text-xl font-semibold">处理进度</h2>
              <div className="mt-5 space-y-3">
                {["录制会议窗口", "提取音频并转写", "生成中文纪要", "创建飞书云文档", "派发可见 To Do"].map((item, index) => (
                  <div key={item} className="flex items-center gap-3 rounded-md bg-white px-3 py-2">
                    <span className="font-mono text-xs text-zinc-400">{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-sm text-zinc-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
            <div className="rounded-lg border border-white/10 bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-500">Jobs</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">最近会议</h2>
                </div>
                <button
                  onClick={() => loadJobs(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
                  aria-label="刷新任务"
                >
                  {refreshingJobs ? <CircleNotch size={18} className="animate-spin" /> : <ArrowsClockwise size={18} />}
                </button>
              </div>

              <div className="mt-4 max-h-[680px] space-y-3 overflow-auto pr-1">
                {jobs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm leading-6 text-zinc-500">
                    暂无会议任务。
                  </div>
                ) : (
                  jobs.map((job) => {
                    const status = String(job.status.status ?? "idle");
                    return (
                      <button
                        key={job.id}
                        onClick={() => setSelectedJobId(job.id)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedJobId === job.id
                            ? "border-sky-300/60 bg-sky-400/10"
                            : "border-white/10 bg-zinc-950/70 hover:border-white/25"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-100">{job.metadata?.sourceName ?? job.id}</p>
                            <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">{job.id}</p>
                          </div>
                          <span className={`rounded-md px-2 py-1 text-[11px] ring-1 ${statusBadge(status)}`}>{status}</span>
                        </div>
                        <p className="mt-3 text-xs text-zinc-500">{formatDate(job.metadata?.createdAt)}</p>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{String(job.status.message ?? "暂无状态")}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-zinc-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">Selected Job</p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-white">{selectedJob?.metadata?.sourceName ?? "选择会议任务"}</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    {selectedJob ? formatDate(selectedJob.metadata?.createdAt) : "处理结果会显示在这里。"}
                  </p>
                </div>
                {selectedJob && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => window.meetingAssistant.revealInFolder(selectedJob.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.08]"
                    >
                      <FolderOpen size={16} />
                      打开目录
                    </button>
                    <button
                      onClick={() => window.meetingAssistant.startProcessing({ jobId: selectedJob.id }).then(() => loadJobs(false))}
                      className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
                    >
                      <ArrowsClockwise size={16} />
                      重新处理
                    </button>
                  </div>
                )}
              </div>

              {!selectedJob ? (
                <div className="mt-4 flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-zinc-950/50 text-center text-sm text-zinc-500">
                  从左侧选择一条会议任务。
                </div>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="space-y-4">
                    <article className="rounded-lg border border-white/10 bg-zinc-950/70 p-4">
                      <p className="text-xs text-zinc-500">会议纪要</p>
                      <div className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                        {artifacts.notes ?? "会议纪要生成后会显示在这里。"}
                      </div>
                    </article>
                    <article className="rounded-lg border border-white/10 bg-zinc-950/70 p-4">
                      <p className="text-xs text-zinc-500">原始转写</p>
                      <div className="mt-3 max-h-[300px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-zinc-300">
                        {artifacts.transcript ?? "暂无转写结果。"}
                      </div>
                    </article>
                  </div>

                  <div className="space-y-4">
                    <article className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs text-zinc-500">TODO JSON</p>
                      <div className="mt-3 max-h-[230px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-zinc-300">
                        {artifacts.tasks ?? "暂无任务提取结果。"}
                      </div>
                    </article>
                    <article className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs text-zinc-500">飞书结果</p>
                      <div className="mt-3 max-h-[230px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-zinc-300">
                        {artifacts.dispatch ?? "暂无云文档和 To Do 结果。"}
                      </div>
                    </article>
                    <article className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <TerminalWindow size={15} />
                        当前状态
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-zinc-300">
                        <div className="rounded-md bg-zinc-950/70 px-3 py-2">
                          <p className="text-xs text-zinc-500">Stage</p>
                          <p className="mt-1">{String(selectedJob.status.stage ?? "unknown")}</p>
                        </div>
                        <div className="rounded-md bg-zinc-950/70 px-3 py-2">
                          <p className="text-xs text-zinc-500">Message</p>
                          <p className="mt-1 leading-6">{String(selectedJob.status.message ?? "暂无消息")}</p>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
