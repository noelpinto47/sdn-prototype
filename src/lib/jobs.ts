import { createClient } from "@supabase/supabase-js";

export type JobResult = {
  feedCaption: string;
  storyCaption: string;
  feedImage: string | null;
  storyImage: string | null;
  note: string | null;
};

const BUCKET = "photos";
const WAIT_MS = 120_000;

type Suggestions = {
  feed_url?: unknown;
  story_url?: unknown;
  feed_caption?: unknown;
  story_caption?: unknown;
  poster_urls?: unknown;
  captions?: unknown;
};

function config(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
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

function readSuggestions(value: unknown, fallback: string): JobResult {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = null;
    }
  }
  const suggestions = (raw && typeof raw === "object" ? raw : {}) as Suggestions;
  const posters = asList(suggestions.poster_urls).filter((item) => item.startsWith("http"));
  const captions = asList(suggestions.captions);
  return {
    feedImage: asText(suggestions.feed_url) || posters[0] || null,
    storyImage: asText(suggestions.story_url) || posters[1] || posters[0] || null,
    feedCaption: asText(suggestions.feed_caption) || captions[0] || fallback,
    storyCaption: asText(suggestions.story_caption) || captions[1] || captions[0] || fallback,
    note: null,
  };
}

export async function runJob(uploadDataUrl: string, caption: string): Promise<JobResult> {
  const cfg = config();
  if (!cfg) {
    throw new Error("On Vercel, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.");
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
    .insert({ original_path: path, original_url: originalUrl, caption, status: "pending" })
    .select("id")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);

  const jobId = String(inserted.data.id);
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const row = await db.from("photo_jobs").select("status, suggestions, error_message").eq("id", jobId).single();
    if (row.error) throw new Error(row.error.message);
    const status = String(row.data.status);
    if (status === "failed") throw new Error(asText(row.data.error_message) || "n8n marked this job as failed.");
    if (status === "completed") return readSuggestions(row.data.suggestions, caption);
  }
  throw new Error("Still waiting on n8n. Check that ngrok is running and the Supabase trigger uses that URL.");
}
