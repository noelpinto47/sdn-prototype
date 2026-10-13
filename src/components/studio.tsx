import { useRef, useState } from "react";
import { Copy, Download, ImagePlus, Loader2, RectangleVertical, Square } from "lucide-react";
import { runJob, type JobResult } from "@/lib/jobs";

type Source = {
  name: string;
  preview: string;
  upload: string;
};

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
}: {
  label: string;
  ratio: string;
  image: string | null;
  caption: string;
  fileName: string;
  tall?: boolean;
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
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">Waiting for a photo</div>
        )}
      </div>
      <p className="min-h-12 text-sm leading-relaxed text-ink">{caption || "Caption will sit here."}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copyCaption}
          disabled={!caption}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card text-sm font-medium text-ink disabled:opacity-40"
        >
          <Copy className="size-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => image && download(image, fileName)}
          disabled={!image}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-paper disabled:opacity-40"
        >
          <Download className="size-4" aria-hidden="true" />
          Save
        </button>
      </div>
    </article>
  );
}

export function Studio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Use a photo file.");
      return;
    }
    setError(null);
    setResult(null);
    const preview = await readFile(file);
    const upload = await shrinkForUpload(preview);
    setSource({ name: file.name, preview, upload });
  }

  async function onGenerate() {
    if (!source || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await runJob(source.upload, caption.trim());
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate posts.");
    } finally {
      setBusy(false);
    }
  }

  const feedImage = result?.feedImage ?? source?.preview ?? null;
  const storyImage = result?.storyImage ?? source?.preview ?? null;
  const feedCaption = result?.feedCaption ?? caption;
  const storyCaption = result?.storyCaption ?? caption;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-[0.18em] text-accent uppercase">Frame</p>
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">One photo, two posts.</h1>
        <p className="max-w-xl text-base leading-relaxed text-muted">
          Drop a picture and the caption you already like. Frame keeps the subject and writes a close caption for a square feed post and a tall Instagram story.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <section className="flex flex-col gap-4 rounded-card border border-line bg-card p-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void onFile(event.dataTransfer.files[0]);
            }}
            className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-paper px-4 text-center"
          >
            {source ? (
              <img src={source.preview} alt="" className="max-h-48 rounded-lg object-contain" />
            ) : (
              <ImagePlus className="size-7 text-accent" aria-hidden="true" />
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
          <label className="flex flex-col gap-2 text-sm font-medium text-ink">
            Caption
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="The line you would actually post."
              className="resize-none rounded-xl border border-line bg-paper px-3 py-3 text-base font-normal text-ink outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={!source || caption.trim().length < 2 || busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Sending to n8n" : "Generate similar posts"}
          </button>
          {error ? <p className="text-sm leading-relaxed text-warn">{error}</p> : null}
          {result?.note ? <p className="text-sm leading-relaxed text-muted">{result.note}</p> : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <PostCard
            label="Feed"
            ratio="1:1"
            image={feedImage}
            caption={feedCaption}
            fileName="frame-feed.jpg"
          />
          <PostCard
            label="Story"
            ratio="9:16"
            image={storyImage}
            caption={storyCaption}
            fileName="frame-story.jpg"
            tall
          />
        </section>
      </div>
    </main>
  );
}
