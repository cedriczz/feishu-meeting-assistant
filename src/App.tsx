import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CircleNotch,
  Desktop,
  FolderOpen,
  Play,
  Record,
  Stop,
  TerminalWindow
} from "@phosphor-icons/react";
import type { AppInfo, CaptureSource, JobSummary } from "./lib/types";

type JobArtifacts = {
  notes: string | null;
  transcript: string | null;
  tasks: string | null;
  dispatch: string | null;
};

function formatDate(value?: string) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function statusBadge(status: string) {
  switch (status) {
    case "recording":
      return "bg-red-500/15 text-red-100 ring-red-400/30";
    case "processing":
      return "bg-white/10 text-white ring-white/20";
    case "completed":
      return "bg-emerald-500/15 text-emerald-100 ring-emerald-400/30";
    case "failed":
      return "bg-amber-500/15 text-amber-100 ring-amber-400/30";
    default:
      return "bg-zinc-800 text-zinc-200 ring-white/10";
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
  const [recordingMessage, setRecordingMessage] = useState("Idle");
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

  async function loadSources() {
    setLoadingSources(true);
    try {
      const nextSources = await window.meetingAssistant.listCaptureSources();
      setSources(nextSources);
      if (!selectedSourceId && nextSources[0]) {
        setSelectedSourceId(nextSources[0].id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to read capture sources.");
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
    window.meetingAssistant.getAppInfo().then(setAppInfo).catch(() => undefined);
    loadSources().catch(() => undefined);
    loadJobs(true).catch(() => undefined);
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      loadJobs(false).catch(() => undefined);
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

  async function startRecording() {
    if (!selectedSource) {
      setErrorMessage("Select a meeting window first.");
      return;
    }

    setErrorMessage(null);
    setRecordingMessage("Preparing capture");

    try {
      await window.meetingAssistant.prepareCaptureSource(selectedSource.id);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true
      });

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
      setRecordingMessage("Recording");
      startedAtRef.current = Date.now();
      setElapsedMs(0);

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0) return;
        const buffer = new Uint8Array(await event.data.arrayBuffer());
        await window.meetingAssistant.appendRecordingChunk({ jobId, chunk: buffer });
      };

      recorder.onerror = (event) => {
        setErrorMessage(event.error?.message ?? "Recording failed.");
      };

      recorder.start(1000);
      await loadJobs(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start recording.");
      setRecording(false);
      setRecordingMessage("Idle");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function stopRecording() {
    if (!recorderRef.current || !activeJobId) return;

    setRecordingMessage("Saving recording");
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

    setRecordingMessage("Processing");
    setActiveJobId(null);
    await loadJobs(true);
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-50">
      <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-6 px-4 py-5 md:px-6 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-white/10 bg-zinc-900/80 p-5 shadow-diffusion shadow-black/30 backdrop-blur">
          <div className="border-b border-white/10 pb-5">
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Local Framework</p>
            <h1 className="mt-2 text-3xl tracking-tight text-zinc-100">Meeting Assistant</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Record a meeting window, process the audio locally, generate a meeting document, and create Lark To Do items.
            </p>
          </div>

          <div className="space-y-4 pt-5">
            <div className="rounded-[1.6rem] border border-white/10 bg-zinc-950/80 p-4">
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <Desktop size={18} weight="duotone" />
                <span>{appInfo?.platform ?? "Detecting platform"}</span>
              </div>
              <div className="mt-3 flex items-center gap-3 text-sm text-zinc-400">
                <TerminalWindow size={18} weight="duotone" />
                <span>Codex CLI and Lark CLI handle the AI and cloud actions.</span>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Capture Source</p>
                  <h2 className="mt-2 text-lg font-medium text-zinc-100">Select meeting window</h2>
                </div>
                <button
                  onClick={() => loadSources()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition duration-300 hover:-translate-y-[1px] hover:bg-white/[0.08]"
                  aria-label="Refresh capture sources"
                >
                  {loadingSources ? <CircleNotch size={18} className="animate-spin" /> : <ArrowsClockwise size={18} />}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {sources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    className={`w-full rounded-[1.3rem] border p-3 text-left transition duration-300 ${
                      selectedSourceId === source.id
                        ? "border-white/40 bg-white/[0.08]"
                        : "border-white/10 bg-zinc-950/70 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
                      <img src={source.thumbnailDataUrl} alt={source.name} className="h-28 w-full object-cover opacity-90" />
                    </div>
                    <div className="mt-3 min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{source.name}</p>
                      <p className="truncate font-mono text-xs text-zinc-500">{source.id}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_420px]">
            <div className="overflow-hidden rounded-[2.4rem] border border-white/10 bg-zinc-900 shadow-diffusion shadow-black/40">
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Capture</p>
                  <h2 className="mt-2 text-2xl tracking-tight text-white">Record Meeting</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${recording ? "bg-red-500/15 text-red-200" : "bg-white/[0.06] text-zinc-200"}`}>
                  {recording ? "REC" : "IDLE"}
                </span>
              </div>

              <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black">
                  <video ref={previewRef} autoPlay muted className="aspect-video w-full object-cover" />
                  {!recording && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-center">
                      <div className="rounded-full border border-white/10 bg-white/[0.04] p-5 text-zinc-300">
                        <Record size={30} weight="duotone" />
                      </div>
                      <div>
                        <p className="text-lg font-medium text-zinc-100">{selectedSource?.name ?? "Choose a window to begin"}</p>
                        <p className="mt-2 max-w-[48ch] text-sm text-zinc-500">
                          Stop recording to start the transcript, meeting-note, Lark document, and To Do workflow.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-between rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Session</p>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3">
                        <p className="text-xs text-zinc-500">State</p>
                        <p className="mt-2 text-lg font-medium text-zinc-100">{recordingMessage}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3">
                        <p className="text-xs text-zinc-500">Elapsed</p>
                        <p className="mt-2 font-mono text-lg text-zinc-100">{(elapsedMs / 1000).toFixed(1)}s</p>
                      </div>
                    </div>
                    {errorMessage && (
                      <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        {errorMessage}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={recording ? stopRecording : startRecording}
                    disabled={!recording && !selectedSource}
                    className={`mt-6 inline-flex items-center justify-center gap-3 rounded-full px-5 py-4 text-sm font-medium transition duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                      recording
                        ? "bg-red-500 text-white hover:-translate-y-[1px] hover:bg-red-400"
                        : "bg-white text-zinc-950 hover:-translate-y-[1px] hover:bg-zinc-100"
                    }`}
                  >
                    {recording ? <Stop size={18} weight="fill" /> : <Play size={18} weight="fill" />}
                    {recording ? "Stop and Process" : "Start Recording"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[2.4rem] border border-white/10 bg-white p-6 text-zinc-950 shadow-diffusion">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Pipeline</p>
              <h2 className="mt-2 text-2xl tracking-tight">Processing Flow</h2>
              <div className="mt-6 space-y-4">
                {[
                  "Record the selected meeting window.",
                  "Extract audio and generate a speaker transcript.",
                  "Use the meeting-notes-format skill to create the document.",
                  "Create a Lark cloud document.",
                  "Create visible Lark To Do items for the logged-in user."
                ].map((item, index) => (
                  <div key={item} className="flex gap-4 border-t border-zinc-200/80 pt-4 first:border-t-0 first:pt-0">
                    <div className="font-mono text-xs text-zinc-400">0{index + 1}</div>
                    <p className="text-sm leading-relaxed text-zinc-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="rounded-[2.2rem] border border-white/10 bg-zinc-900 p-5 shadow-diffusion shadow-black/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Jobs</p>
                  <h2 className="mt-2 text-2xl tracking-tight text-zinc-100">Recent Sessions</h2>
                </div>
                <button
                  onClick={() => loadJobs(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 transition duration-300 hover:-translate-y-[1px] hover:bg-white/[0.08]"
                  aria-label="Refresh jobs"
                >
                  {refreshingJobs ? <CircleNotch size={18} className="animate-spin" /> : <ArrowsClockwise size={18} />}
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {jobs.length === 0 ? (
                  <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-zinc-950/60 p-5 text-sm leading-relaxed text-zinc-500">
                    No jobs yet. Record a meeting to create the first local job folder.
                  </div>
                ) : (
                  jobs.map((job) => {
                    const status = String(job.status.status ?? "idle");
                    return (
                      <button
                        key={job.id}
                        onClick={() => setSelectedJobId(job.id)}
                        className={`w-full rounded-[1.5rem] border p-4 text-left transition duration-300 ${
                          selectedJobId === job.id
                            ? "border-white/30 bg-white/[0.07]"
                            : "border-white/10 bg-zinc-950/60 hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-100">{job.metadata?.sourceName ?? job.id}</p>
                            <p className="mt-1 truncate font-mono text-xs text-zinc-500">{job.id}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${statusBadge(status)}`}>{status}</span>
                        </div>
                        <p className="mt-3 text-xs text-zinc-500">{formatDate(job.metadata?.createdAt)}</p>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{String(job.status.message ?? "No status yet")}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-[2.2rem] border border-white/10 bg-zinc-900 p-5 shadow-diffusion shadow-black/30">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Selected Job</p>
                  <h2 className="mt-2 text-2xl tracking-tight text-zinc-100">{selectedJob?.metadata?.sourceName ?? "Select a job"}</h2>
                  <p className="mt-3 text-sm text-zinc-500">
                    {selectedJob ? formatDate(selectedJob.metadata?.createdAt) : "Results appear here after a recording is processed."}
                  </p>
                </div>
                {selectedJob && (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => window.meetingAssistant.revealInFolder(selectedJob.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-200 transition duration-300 hover:-translate-y-[1px] hover:bg-white/[0.08]"
                    >
                      <FolderOpen size={16} />
                      Open Folder
                    </button>
                    <button
                      onClick={() => window.meetingAssistant.startProcessing({ jobId: selectedJob.id }).then(() => loadJobs(false))}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition duration-300 hover:-translate-y-[1px] hover:bg-zinc-100"
                    >
                      <ArrowsClockwise size={16} />
                      Reprocess
                    </button>
                  </div>
                )}
              </div>

              {!selectedJob ? (
                <div className="mt-5 flex min-h-[360px] items-center justify-center rounded-[1.8rem] border border-dashed border-white/10 bg-zinc-950/50 text-center text-sm text-zinc-500">
                  Select a job from the left panel.
                </div>
              ) : (
                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
                  <div className="space-y-4">
                    <article className="rounded-[1.8rem] border border-white/10 bg-zinc-950/70 p-5">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Meeting Notes</p>
                      <div className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                        {artifacts.notes ?? "Meeting notes will appear here after processing."}
                      </div>
                    </article>
                    <article className="rounded-[1.8rem] border border-white/10 bg-zinc-950/70 p-5">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Raw Speaker Transcript</p>
                      <div className="mt-4 max-h-[300px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-zinc-300">
                        {artifacts.transcript ?? "Transcript not generated yet."}
                      </div>
                    </article>
                  </div>

                  <div className="space-y-4">
                    <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">TODO JSON</p>
                      <div className="mt-4 max-h-[250px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-zinc-300">
                        {artifacts.tasks ?? "Task extraction JSON will appear here."}
                      </div>
                    </article>
                    <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Lark Results</p>
                      <div className="mt-4 max-h-[250px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-zinc-300">
                        {artifacts.dispatch ?? "Lark document and To Do results will appear here."}
                      </div>
                    </article>
                    <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Current Status</p>
                      <div className="mt-4 space-y-3 text-sm text-zinc-300">
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3">
                          <p className="text-xs text-zinc-500">Stage</p>
                          <p className="mt-2">{String(selectedJob.status.stage ?? "unknown")}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3">
                          <p className="text-xs text-zinc-500">Message</p>
                          <p className="mt-2 leading-relaxed">{String(selectedJob.status.message ?? "No message")}</p>
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
