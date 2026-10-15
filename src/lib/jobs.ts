import { createClient } from "@supabase/supabase-js";

export type JobResult = {
  caption: string;
  imageUrl: string | null;
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
  image_url?: unknown;
  output_url?: unknown;
  feed_url?: unknown;
  story_url?: unknown;
  video_url?: unknown;
  feed_image?: unknown;
  story_image?: unknown;
  poster_urls?: unknown;
  caption?: unknown;
  feed_caption?: unknown;
  story_caption?: unknown;
  video_caption?: unknown;
  video_captions?: unknown;
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
    imageUrl: firstUrl(
      suggestions.image_url,
      suggestions.output_url,
      suggestions.feed_url,
      suggestions.story_url,
      suggestions.video_url,
      suggestions.feed_image,
      suggestions.story_image,
      posters[0],
    ),
    caption:
      asText(suggestions.caption) ||
      asText(suggestions.feed_caption) ||
      asText(suggestions.story_caption) ||
      asText(suggestions.video_caption) ||
      asList(suggestions.video_captions)[0] ||
      captions[0] ||
      fallback,
    note: null,
  };
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveGeneratedImage(
  result: JobResult,
  cfg: { url: string; key: string },
  generatedAfter: string,
): Promise<JobResult> {
  if (result.imageUrl && (await isReachable(result.imageUrl))) return result;

  const storage = createClient(cfg.url, cfg.key).storage.from("results");
  const listed = await storage.list("", {
    limit: 20,
    sortBy: { column: "created_at", order: "desc" },
    search: "generated-",
  });
  if (listed.error) throw new Error(`Could not find generated images: ${listed.error.message}`);
  // A file is only a valid fallback if it was created after THIS job
  // started — otherwise we'd risk picking up a previous job's output,
  // which is exactly how a story request could end up showing a feed image.
  const newest = listed.data
    .filter((file) => file.name.startsWith("generated-") && /\.(jpe?g|png|webp)$/i.test(file.name))
    .filter((file) => String(file.created_at) > generatedAfter)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (!newest) return result;

  return {
    ...result,
    imageUrl: `${cfg.url}/storage/v1/object/public/results/${encodeURIComponent(newest.name)}`,
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
  const jobStartedAt = new Date().toISOString();
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
      return resolveGeneratedImage(result, cfg, jobStartedAt);
    }
  }
  throw new Error("Still waiting on n8n. Check that ngrok is running and the Supabase trigger uses that URL.");
}