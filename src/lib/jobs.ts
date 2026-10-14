import { createClient } from "@supabase/supabase-js";

export type JobResult = {
  feedCaption: string;
  storyCaption: string;
  videoCaption: string;
  feedImage: string | null;
  storyImage: string | null;
  note: string | null;
};

export type GenerationOptions = {
  promptType: "redesign" | "keep_structure" | "new_from_reference";
  customPrompt: string;
  postCount: number;
  storyCount: number;
  videoCount: number;
  postCaptionCount: number;
  videoCaptionCount: number;
};

const BUCKET = "photos";
const WAIT_MS = 120_000;

type Suggestions = {
  feed_url?: unknown;
  story_url?: unknown;
  feed_image?: unknown;
  story_image?: unknown;
  image_url?: unknown;
  output_url?: unknown;
  feed_caption?: unknown;
  story_caption?: unknown;
  video_caption?: unknown;
  video_captions?: unknown;
  poster_urls?: unknown;
  captions?: unknown;
};

function config(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(header)?.[1] ?? "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function firstUrl(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && /^https?:\/\//.test(value.trim())) return value.trim();
    if (Array.isArray(value)) {
      const nested = firstUrl(...value);
      if (nested) return nested;
    }
  }
  return null;
}

function parseSuggestions(value: unknown): unknown {
  let parsed = value;
  for (let attempt = 0; attempt < 2 && typeof parsed === "string"; attempt += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      const normalized = String(parsed).replace(/\\n/g, "\n").replace(/\\"/g, '"');
      if (normalized === parsed) break;
      try {
        parsed = JSON.parse(normalized);
      } catch {
        break;
      }
    }
  }
  return parsed;
}

function readSuggestions(value: unknown, fallback: string): JobResult {
  const raw = parseSuggestions(value);
  const suggestions = (raw && typeof raw === "object" ? raw : {}) as Suggestions;
  const posters = asList(suggestions.poster_urls);
  const captions = asList(suggestions.captions);
  return {
    feedImage: firstUrl(suggestions.feed_url, suggestions.feed_image, posters[0], suggestions.image_url, suggestions.output_url),
    storyImage: firstUrl(suggestions.story_url, suggestions.story_image, posters[1], posters[0], suggestions.image_url, suggestions.output_url),
    feedCaption: asText(suggestions.feed_caption) || captions[0] || fallback,
    storyCaption: asText(suggestions.story_caption) || captions[1] || captions[0] || fallback,
    videoCaption: asText(suggestions.video_caption) || asList(suggestions.video_captions)[0] || fallback,
    note: null,
  };
}

async function resolveGeneratedImages(result: JobResult, cfg: { url: string; key: string }): Promise<JobResult> {
  const [feed, story] = await Promise.all(
    [result.feedImage, result.storyImage].map(async (url) => {
      if (!url) return null;
      try {
        const response = await fetch(url, { method: "HEAD" });
        return response.ok ? url : null;
      } catch {
        return null;
      }
    }),
  );
  if (feed && story) return result;

  const storage = createClient(cfg.url, cfg.key).storage.from("results");
  const listed = await storage.list("", {
    limit: 20,
    sortBy: { column: "created_at", order: "desc" },
    search: "generated-",
  });
  if (listed.error) throw new Error(`Could not find generated images: ${listed.error.message}`);
  const images = listed.data
    .filter((file) => file.name.startsWith("generated-") && /\.(jpe?g|png|webp)$/i.test(file.name))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (images.length === 0) return result;

  const publicUrl = (name: string) =>
    `${cfg.url}/storage/v1/object/public/results/${encodeURIComponent(name)}`;
  return {
    ...result,
    feedImage: feed ?? publicUrl(images[0].name),
    storyImage: story ?? publicUrl(images[1]?.name ?? images[0].name),
  };
}

export async function runJob(
  uploadDataUrl: string,
  caption: string,
  generationOptions: GenerationOptions,
  { aspect_ratio }: { aspect_ratio: string },
): Promise<JobResult> {
  const cfg = config();
  if (!cfg) {
    throw new Error("On Vercel, set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then redeploy.");
  }
  const db = createClient(cfg.url, cfg.key);
  const path = `uploads/${crypto.randomUUID()}.jpg`;
  const uploaded = await db.storage.from(BUCKET).upload(path, dataUrlToBlob(uploadDataUrl), {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);

  const originalUrl = `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}`;
  const inserted = await db
    .from("photo_jobs")
    .insert({
      original_path: path,
      original_url: originalUrl,
      aspect_ratio,
      prompt: generationOptions.customPrompt,
      caption,
      status: "pending",
      generation_options: generationOptions,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);

  const jobId = String(inserted.data.id);
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const row = await db.from("photo_jobs").select("*").eq("id", jobId).single();
    if (row.error) throw new Error(row.error.message);
    const status = String(row.data.status);
    if (status === "failed") throw new Error(asText(row.data.error_message) || "n8n marked this job as failed.");
    if (["completed", "complete", "done", "success"].includes(status)) {
      const result = readSuggestions(row.data.suggestions ?? row.data, caption);
      return resolveGeneratedImages(result, cfg);
    }
  }
  throw new Error("Still waiting on n8n. Check that ngrok is running and the Supabase trigger uses that URL.");
}