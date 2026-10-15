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
type Lang = "nl" | "en";

const translations = {
  nl: {
    brand: "Samen Duurzaam Nieuwegein",
    title: "Maak van één foto een kant-en-klare update.",
    subtitle: "Voeg een foto van een SDN-initiatief toe, kies een formaat en krijg iets dat je direct op sociale media kunt plaatsen.",
    sectionPhoto: "01 · Foto",
    photoHelp: "Voeg een foto van een SDN-evenement, project of initiatief toe.",
    dropPhoto: "Sleep een foto hierheen of klik om te kiezen",
    sectionFormat: "02 · Formaat",
    formatHelp: "Kies waar dit naartoe gaat.",
    formatPost: "Post",
    formatStory: "Story",
    formatVideo: "Video",
    customPrompt: "Aangepaste prompt",
    customPromptPlaceholder: "Laat leeg om de standaard SDN-posterprompt voor dit formaat te gebruiken, met elke keer een nieuwe lay-outtwist. Of schrijf je eigen prompt om deze te overschrijven.",
    clear: "Wissen",
    generate: "Genereer",
    generating: "Bezig met genereren van",
    progressHint: "Dit duurt meestal 15–30 seconden.",
    sectionOutput: "03 · Resultaat",
    outputHelp: "Je gegenereerde update verschijnt hier.",
    feedPost: "Feedbericht",
    story: "Story",
    portraitVideo: "Staande video",
    waitingPhoto: "Wachten op een foto",
    copy: "Kopiëren",
    copied: "Gekopieerd",
    save: "Opslaan",
    videoCaptionPlaceholder: "Videobijschrift komt hier.",
    errorPhotoFile: "Gebruik een fotobestand.",
    errorGenerate: "Kon de post niet genereren.",
    errorCopy: "Kon deze afbeelding niet kopiëren.",
    errorDownload: "Kon deze afbeelding niet downloaden.",
  },
  en: {
    brand: "Samen Duurzaam Nieuwegein",
    title: "Turn one photo into a ready-to-post update.",
    subtitle: "Add a photo from an SDN initiative, pick a format, and get something you can post straight to social media.",
    sectionPhoto: "01 · Photo",
    photoHelp: "Add a photo from an SDN event, project, or initiative.",
    dropPhoto: "Drop a photo, or click to choose one",
    sectionFormat: "02 · Format",
    formatHelp: "Choose where this is going.",
    formatPost: "Post",
    formatStory: "Story",
    formatVideo: "Video",
    customPrompt: "Custom prompt",
    customPromptPlaceholder: "Leave blank to use the default SDN poster prompt for this format, with a fresh layout twist each time. Or write your own to override it.",
    clear: "Clear",
    generate: "Generate",
    generating: "Generating",
    progressHint: "This usually takes 15–30 seconds.",
    sectionOutput: "03 · Output",
    outputHelp: "Your generated update will appear here.",
    feedPost: "Feed post",
    story: "Story",
    portraitVideo: "Portrait video",
    waitingPhoto: "Waiting for a photo",
    copy: "Copy",
    copied: "Copied",
    save: "Save",
    videoCaptionPlaceholder: "Video caption will sit here.",
    errorPhotoFile: "Use a photo file.",
    errorGenerate: "Could not generate the post.",
    errorCopy: "Could not copy this image.",
    errorDownload: "Could not download this image.",
  },
} as const;

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

async function fetchImageBlob(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not load the image.");
  return response.blob();
}

async function saveImage(src: string, name: string) {
  const blob = await fetchImageBlob(src);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function copyImageToClipboard(src: string) {
  const blob = await fetchImageBlob(src);
  const pngBlob = blob.type === "image/png" ? blob : await toPng(blob);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
}

function toPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) {
        reject(new Error("Could not convert this image."));
        return;
      }
      ctx.drawImage(image, 0, 0);
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Could not convert this image."))), "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load this image."));
    };
    image.src = url;
  });
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
  t,
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
  t: typeof translations.nl;
}) {
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<"copy" | "save" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleCopyImage() {
    if (!image || busyAction) return;
    setActionError(null);
    setBusyAction("copy");
    try {
      await copyImageToClipboard(image);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setActionError(t.errorCopy);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveImage() {
    if (!image || busyAction) return;
    setActionError(null);
    setBusyAction("save");
    try {
      await saveImage(image, fileName);
    } catch {
      setActionError(t.errorDownload);
    } finally {
      setBusyAction(null);
    }
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
      <div className={tall ? "mx-auto w-full max-w-52 frame-story overflow-hidden rounded-lg bg-paper p-2.5" : "frame-square overflow-hidden rounded-lg bg-paper p-2.5"}>
        {image ? (
          <img src={image} alt="" className="h-full w-full rounded-md object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">{t.waitingPhoto}</div>
        )}
      </div>
      {showCaption && editableCaption ? (
        <textarea
          value={caption}
          onChange={(event) => onCaptionChange?.(event.target.value)}
          placeholder={t.videoCaptionPlaceholder}
          rows={3}
          className="min-h-20 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink outline-none"
        />
      ) : showCaption ? (
        <p className="min-h-12 text-sm leading-relaxed text-ink">{caption}</p>
      ) : null}
      {actionError ? <p className="text-xs leading-relaxed text-warn">{actionError}</p> : null}
      {downloadable ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleCopyImage()}
            disabled={!image || busyAction !== null}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card text-sm font-medium text-ink disabled:opacity-40"
          >
            {busyAction === "copy" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? t.copied : t.copy}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveImage()}
            disabled={!image || busyAction !== null}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-paper disabled:opacity-40"
          >
            {busyAction === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
            {t.save}
          </button>
        </div>
      ) : null}
    </article>
  );
}

const formatOptions: { value: ContentType; labelKey: keyof typeof translations.nl; icon: typeof Square }[] = [
  { value: "feed", labelKey: "formatPost", icon: Square },
  { value: "story", labelKey: "formatStory", icon: RectangleVertical },
  { value: "video", labelKey: "formatVideo", icon: Video },
];

const aspectRatioByFormat: Record<ContentType, string> = {
  feed: "1:1",
  story: "9:16",
  video: "9:16",
};

const DEFAULT_PROMPTS: Record<"feed" | "story", string> = {
  feed: "Create a fresh, modern Instagram feed poster variation based on the reference image. Keep the main event or campaign message, key text, date, time, and call-to-action clearly readable. Preserve the original brand colors, logo, and overall visual identity while allowing creative freedom in layout, photo treatment, and composition. Replace or recompose the background/photo with a new relevant scene that fits the theme. Leave a clear safe margin around all four edges of the canvas — no text, logo, badge, or graphic element should touch, crop against, or extend past the edge of the frame. Experiment with text placement, graphic shapes, overlays, and hierarchy so the design feels updated but still professional and on-brand. Ensure all important text remains sharp, fully within frame, and legible. Square 1:1 format, clean graphic design style, high visual quality, no watermarks.",
  story: "Create a fresh, modern Instagram Story poster variation based on the reference image. Keep the main event or campaign message, key text, date, time, and call-to-action clearly readable. Preserve the original brand colors, logo, and overall visual identity while allowing creative freedom in layout, photo treatment, and composition. Replace or recompose the background/photo with a new relevant scene that fits the theme. Design for a tall 9:16 canvas: keep the logo and all essential text inside the safe centre area, clear of the very top and bottom of the frame where Instagram's own UI (profile bar, reply field, sticker tray) sits on top of the image, and leave a clear safe margin on the left and right edges too — no text, logo, badge, or graphic element should touch, crop against, or extend past any edge of the frame. Use bold, large type and strong contrast so the message reads instantly while someone is tapping through stories. Experiment with text placement, graphic shapes, overlays, and hierarchy so the design feels updated but still professional and on-brand. Ensure all important text remains sharp, fully within frame, and legible. Vertical 9:16 format, clean graphic design style, high visual quality, no watermarks.",
};

const VARIATION_HINTS = [
  "For this variation, try an asymmetric layout with the headline anchored to one side.",
  "For this variation, try a bold color band or shape running behind the headline.",
  "For this variation, try a circular badge or sticker element framing the date and time.",
  "For this variation, try a full-bleed photo with a translucent color overlay behind the text block.",
  "For this variation, try large stacked type for the headline with a thin rule line above the call-to-action.",
  "For this variation, try a collage-style layout with two smaller photo panels instead of one large one.",
];

function promptFor(contentType: ContentType, customPrompt: string): string {
  const trimmed = customPrompt.trim();
  if (trimmed) return trimmed;
  const formatKey = contentType === "feed" ? "feed" : "story";
  const hint = VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];
  return `${DEFAULT_PROMPTS[formatKey]} ${hint}`;
}

function toGenerationOptions(contentType: ContentType, customPrompt: string): GenerationOptions {
  const base = {
    promptType: "redesign" as GenerationOptions["promptType"],
    customPrompt: promptFor(contentType, customPrompt),
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
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [resultFormat, setResultFormat] = useState<ContentType | null>(null);
  const [videoCaption, setVideoCaption] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [lang, setLang] = useState<Lang>("nl");

  const t = translations[lang];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sdn-lang");
      if (saved === "nl" || saved === "en") setLang(saved);
    } catch {
      // ignore
    }
  }, []);

  function switchLang(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem("sdn-lang", next);
    } catch {
      // ignore
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t.errorPhotoFile);
      return;
    }
    setError(null);
    setResult(null);
    setResultFormat(null);
    setVideoCaption("");
    const preview = await readFile(file);
    const upload = await shrinkForUpload(preview);
    setSource({ name: file.name, preview, upload });
  }

  useEffect(() => {
    if (!busy) {
      setProgress(0);
      return;
    }
    setProgress((prev) => (prev > 0 ? prev : 8));
    const interval = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const remaining = 90 - prev;
        return Math.min(90, prev + Math.max(1, remaining * 0.1));
      });
    }, 400);
    return () => window.clearInterval(interval);
  }, [busy]);

  function onClear() {
    setSource(null);
    setCaption("");
    setContentType("feed");
    setResult(null);
    setResultFormat(null);
    setVideoCaption("");
    setCustomPrompt("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onGenerate() {
    if (!source || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setResultFormat(null);
    setVideoCaption("");
    try {
      const generatingFor = contentType;
      const next = await runJob(source.upload, caption.trim(), toGenerationOptions(contentType, customPrompt), {
        aspect_ratio: aspectRatioByFormat[contentType],
      });
      setResult(next);
      setResultFormat(generatingFor);
      setVideoCaption(next.caption);
      setProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGenerate);
    } finally {
      setBusy(false);
    }
  }

  const matchesCurrentFormat = resultFormat === contentType;
  const resultImage = matchesCurrentFormat ? (result?.imageUrl ?? null) : null;
  const resultCaption = matchesCurrentFormat ? (result?.caption ?? caption) : caption;
  const defaultVideoCaption = matchesCurrentFormat ? (result?.caption ?? "") : "";
  useEffect(() => {
    if (!videoCaption && defaultVideoCaption) setVideoCaption(defaultVideoCaption);
  }, [defaultVideoCaption, videoCaption]);

  const formatLabel =
    contentType === "feed" ? t.formatPost.toLowerCase() : contentType === "story" ? t.formatStory.toLowerCase() : t.formatVideo.toLowerCase();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-[0.18em] text-emerald-700 uppercase">
            <Leaf className="size-3.5" aria-hidden="true" />
            {t.brand}
          </p>
          <div className="flex rounded-full border border-line bg-paper p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => switchLang("nl")}
              className={`rounded-full px-3 py-1 transition ${lang === "nl" ? "bg-emerald-600 text-white" : "text-muted"}`}
            >
              NL
            </button>
            <button
              type="button"
              onClick={() => switchLang("en")}
              className={`rounded-full px-3 py-1 transition ${lang === "en" ? "bg-emerald-600 text-white" : "text-muted"}`}
            >
              EN
            </button>
          </div>
        </div>
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">{t.title}</h1>
        <p className="max-w-xl text-base leading-relaxed text-muted">{t.subtitle}</p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,22rem)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-emerald-700 uppercase">{t.sectionPhoto}</p>
            <p className="mt-1 text-sm text-muted">{t.photoHelp}</p>
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
            <span className="text-sm text-muted">{source ? source.name : t.dropPhoto}</span>
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
        </section>

        <section className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-emerald-700 uppercase">{t.sectionFormat}</p>
              <p className="mt-1 text-sm text-muted">{t.formatHelp}</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {formatOptions.map((option) => {
                const Icon = option.icon;
                const active = contentType === option.value;
                return (
                  <button
                    disabled={option.value === "video"}
                    key={option.value}
                    type="button"
                    onClick={() => setContentType(option.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs transition ${
                      active ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-900" : "border-line bg-paper text-muted"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t[option.labelKey]}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink">{t.customPrompt}</p>
              <textarea
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
                rows={6}
                maxLength={1000}
                placeholder={t.customPromptPlaceholder}
                className="resize-none rounded-xl border border-line bg-paper px-3 py-3 text-sm font-normal text-ink outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              disabled={!source && !result}
              className="inline-flex h-12 items-center justify-center rounded-full border border-line bg-card px-5 text-sm font-medium text-ink disabled:opacity-40"
            >
              {t.clear}
            </button>
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={!source || busy}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? `${t.generating} ${formatLabel}…` : `${t.generate} ${formatLabel}`}
            </button>
          </div>
          {busy ? (
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted">{t.progressHint}</p>
            </div>
          ) : null}
          {error ? <p className="text-sm leading-relaxed text-warn">{error}</p> : null}
          {result?.note ? <p className="text-sm leading-relaxed text-muted">{result.note}</p> : null}
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-emerald-700 uppercase">{t.sectionOutput}</p>
            <p className="mt-1 text-sm text-muted">{t.outputHelp}</p>
          </div>
          {contentType === "feed" ? (
            <PostCard label={t.feedPost} ratio="1:1" image={resultImage} caption={resultCaption} fileName="sdn-feed-post.jpg" t={t} />
          ) : null}
          {contentType === "story" ? (
            <PostCard
              label={t.story}
              ratio="9:16"
              image={resultImage}
              caption=""
              fileName="sdn-story.jpg"
              tall
              showCaption={false}
              t={t}
            />
          ) : null}
          {contentType === "video" ? (
            <PostCard
              label={t.portraitVideo}
              ratio="9:16"
              image={resultImage}
              caption={videoCaption}
              fileName="sdn-video.mp4"
              tall
              editableCaption
              onCaptionChange={setVideoCaption}
              downloadable={false}
              t={t}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}