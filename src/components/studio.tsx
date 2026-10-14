import { useEffect, useState } from "react";
import { useRef } from "react";
import { Copy, Download, ImagePlus, Leaf, Loader2, RectangleVertical, Square, Video } from "lucide-react";
import { runJob, type GenerationOptions, type JobResult } from "@/lib/jobs";

type Source = {
  name: string;
  preview: string;
  upload: string;
};

type ContentType = "feed" | "story" | "video";

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function shrinkForUpload(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function download(dataUrl: string, name: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name;
  link.click();
}

function PostCard({
  label,
  ratio,
  image,
  caption,
  fileName,
  tall,
  editableCaption = false,
  onCaptionChange,
  downloadable = true,
  showCaption = true,
}: {
  label: string;
  ratio: string;
  image: string | null;
  caption: string;
  fileName: string;
  tall?: boolean;
  editableCaption?: boolean;
  onCaptionChange?: (caption: string) => void;
  downloadable?: boolean;
  showCaption?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCaption() {
    if (!caption) return;
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          {tall ? <RectangleVertical className="size-4" aria-hidden="true" /> : <Square className="size-4" aria-hidden="true" />}
          {label}
        </p>
        <span className="text-xs tracking-wide text-muted uppercase">{ratio}</span>
      </div>
      <div className={tall ? "mx-auto w-full max-w-52 frame-story overflow-hidden rounded-lg bg-paper" : "frame-square overflow-hidden rounded-lg bg-paper"}>
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">Start generating!</div>
        )}
      </div>
      {showCaption && editableCaption ? (
        <textarea
          value={caption}
          onChange={(event) => onCaptionChange?.(event.target.value)}
          placeholder="Video caption will sit here."
          rows={3}
          className="min-h-20 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink outline-none"
        />
      ) : null}
      <div className="flex gap-2">
        {showCaption ? (
          <button
            type="button"
            onClick={copyCaption}
            disabled={!caption}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card text-sm font-medium text-ink disabled:opacity-40"
          >
            <Copy className="size-4" aria-hidden="true" />
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
        {downloadable ? (
          <button
            type="button"
            onClick={() => image && download(image, fileName)}
            disabled={!image}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-paper disabled:opacity-40"
          >
            <Download className="size-4" aria-hidden="true" />
            Save
          </button>
        ) : null}
      </div>
    </article>
  );
}

const formatOptions: { value: ContentType; label: string; icon: typeof Square }[] = [
  { value: "feed", label: "Post", icon: Square },
  { value: "story", label: "Story", icon: RectangleVertical },
  { value: "video", label: "Video", icon: Video },
];

// Maps the simple Post / Story / Video choice onto the counts the job API
// still expects. promptType is fixed since the redesign / keep-structure /
// new-from-reference choice was removed from the UI for this prototype.
function toGenerationOptions(contentType: ContentType, customPrompt: string): GenerationOptions {
  const base = {
    promptType: "redesign" as GenerationOptions["promptType"],
    customPrompt,
    postCount: 0,
    storyCount: 0,
    videoCount: 0,
    postCaptionCount: 0,
    videoCaptionCount: 0,
  };
  if (contentType === "feed") return { ...base, postCount: 1, postCaptionCount: 1 };
  if (contentType === "story") return { ...base, storyCount: 1 };
  return { ...base, videoCount: 1, videoCaptionCount: 1 };
}

export function Studio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [caption, setCaption] = useState("");
  const [contentType, setContentType] = useState<ContentType>("feed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [videoCaption, setVideoCaption] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Use a photo file.");
      return;
    }
    setError(null);
    setResult(null);
    setVideoCaption("");
    const preview = await readFile(file);
    const upload = await shrinkForUpload(preview);
    setSource({ name: file.name, preview, upload });
  }

  function onClear() {
    setSource(null);
    setCaption("");
    setContentType("feed");
    setResult(null);
    setVideoCaption("");
    setCustomPrompt("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onGenerate() {
    if (!source || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await runJob(source.upload, caption.trim(), toGenerationOptions(contentType, customPrompt));
      setResult(next);
      setVideoCaption(next.videoCaption);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the post.");
    } finally {
      setBusy(false);
    }
  }

  const feedImage = result?.feedImage ?? null;
  const storyImage = result?.storyImage ?? null;
  const feedCaption = result?.feedCaption ?? caption;
  const defaultVideoCaption = result?.videoCaption ?? "";
  useEffect(() => {
    if (!videoCaption && defaultVideoCaption) setVideoCaption(defaultVideoCaption);
  }, [defaultVideoCaption, videoCaption]);

  const formatLabel = contentType === "feed" ? "post" : contentType === "story" ? "story" : "video";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-[0.18em] text-emerald-700 uppercase">
          <Leaf className="size-3.5" aria-hidden="true" />
          Samen Duurzaam Nieuwegein
        </p>
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Turn one photo into a ready-to-post update.</h1>
        <p className="max-w-xl text-base leading-relaxed text-muted">
          Add a photo from an SDN initiative, pick a format, and get something you can post straight to social media.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,22rem)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-emerald-700 uppercase">01 · Photo</p>
            <p className="mt-1 text-sm text-muted">Add a photo from an SDN event, project, or initiative.</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void onFile(event.dataTransfer.files[0]);
            }}
            className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-paper px-4 text-center"
          >
            {source ? (
              <img src={source.preview} alt="" className="max-h-36 rounded-lg object-contain" />
            ) : (
              <ImagePlus className="size-7 text-emerald-700" aria-hidden="true" />
            )}
            <span className="text-sm text-muted">{source ? source.name : "Drop a photo, or click to choose one"}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {/* <label className="flex flex-col gap-2 text-sm font-medium text-ink">
            Caption
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="The line you would actually post."
              className="resize-none rounded-xl border border-line bg-paper px-3 py-3 text-base font-normal text-ink outline-none"
            />
          </label> */}
        </section>

        <section className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-emerald-700 uppercase">02 · Format</p>
              <p className="mt-1 text-sm text-muted">Choose where this is going.</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {formatOptions.map((option) => {
                const Icon = option.icon;
                const active = contentType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setContentType(option.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs transition ${
                      active ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-900" : "border-line bg-paper text-muted"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/* Custom prompt section */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink">Custom prompt</p>
              <textarea
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Mention anything SDN-specific the post should reflect, e.g. a tuincoach visit or a Repair Café."
                className="resize-none rounded-xl border border-line bg-paper px-3 py-3 text-sm font-normal text-ink outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={!source || busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Sending to n8n" : `Generate ${formatLabel}`}
          </button>
          {error ? <p className="text-sm leading-relaxed text-warn">{error}</p> : null}
          {result?.note ? <p className="text-sm leading-relaxed text-muted">{result.note}</p> : null}
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-emerald-700 uppercase">03 · Output</p>
            <p className="mt-1 text-sm text-muted">Your generated update will appear here.</p>
          </div>
          {contentType === "feed" ? (
            <PostCard label="Feed post" ratio="1:1" image={feedImage} caption={feedCaption} fileName="sdn-feed-post.jpg" />
          ) : null}
          {contentType === "story" ? (
            <PostCard
              label="Story"
              ratio="9:16"
              image={storyImage}
              caption=""
              fileName="sdn-story.jpg"
              tall
              showCaption={false}
            />
          ) : null}
          {contentType === "video" ? (
            <PostCard
              label="Portrait video"
              ratio="9:16"
              image={result?.feedImage ?? null}
              caption={videoCaption}
              fileName="sdn-video.mp4"
              tall
              editableCaption
              onCaptionChange={setVideoCaption}
              downloadable={false}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}