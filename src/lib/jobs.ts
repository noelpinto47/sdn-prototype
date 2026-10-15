import { createClient } from "@supabase/supabase-js";

export type JobResult = {
  caption: string;
  imageUrl: string | null;
  note: string | null;
};

export type GeneratedImage = {
  /** Full public URL of the image in the results bucket. */
  url: string;
  /** Object path inside the results bucket. */
  path: string;
  /** File name, without its parent folder. */
  name: string;
  /** Storage creation time, when provided by Supabase. */
  createdAt: string | null;
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

type ContentFormat = "feed" | "story" | "video";
type Suggestions = Record<string, unknown> & {
  image_url?: unknown;
  output_url?: unknown;
  feed_url?: unknown;
  story_url?: unknown;
  video_url?: unknown;
  feed_image?: unknown;
  story_image?: unknown;
  video_image?: unknown;
  poster_urls?: unknown;
  caption?: unknown;
  feed_caption?: unknown;
  story_caption?: unknown;
  video_caption?: unknown;
  video_captions?: unknown;
  captions?: unknown;
};

type JobRow = {
  id: string;
  status: string;
  suggestions?: unknown;
  error_message?: unknown;
};

type StorageEntry = {
  id: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const UPLOAD_BUCKET = "photos";
const RESULTS_BUCKET = "results";
const POLL_INTERVAL_MS = 2_000;
const WAIT_MS = 180_000;
const STORAGE_PAGE_SIZE = 100;

function getConfig(): { url: string; key: string } {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
    );
  }

  return { url: url.replace(/\/$/, ""), key };
}

function createSupabaseClient() {
  const config = getConfig();
  return createClient(config.url, config.key);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("The selected image is not a valid data URL.");

  const mimeType = match[1] || "image/jpeg";
  const body = match[3];
  if (match[2]) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }
  return new Blob([decodeURIComponent(body)], { type: mimeType });
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSuggestions(value: unknown): Suggestions {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Suggestions;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Suggestions;
      }
    } catch {
      // Some old rows may contain non-JSON text; handled as an empty suggestion object.
    }
  }
  return {};
}

function firstUrl(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const nested = firstUrl(...value);
      if (nested) return nested;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const nested = firstUrl(record.url, record.publicUrl, record.public_url, record.href);
      if (nested) return nested;
    }
  }
  return null;
}

function readSuggestions(value: unknown, fallbackCaption: string, format: ContentFormat): JobResult {
  const suggestions = parseSuggestions(value);
  const posters = asList(suggestions.poster_urls);
  const genericUrl = firstUrl(
    suggestions.image_url,
    suggestions.output_url,
    suggestions.video_url,
    suggestions.video_image,
    posters,
  );

  // Prefer the requested format-specific URL. Do not let feed_url win for a Story job.
  const formatUrl = format === "story"
    ? firstUrl(suggestions.story_url, suggestions.story_image)
    : format === "video"
      ? firstUrl(suggestions.video_url, suggestions.video_image, suggestions.story_url, suggestions.story_image)
      : firstUrl(suggestions.feed_url, suggestions.feed_image);

  const captions = asList(suggestions.captions);
  const videoCaptions = asList(suggestions.video_captions);
  const caption = format === "story"
    ? asText(suggestions.story_caption) || asText(suggestions.caption) || asText(suggestions.feed_caption)
    : format === "video"
      ? asText(suggestions.video_caption) || asText(suggestions.caption) || asText(suggestions.feed_caption) || asText(videoCaptions[0])
      : asText(suggestions.feed_caption) || asText(suggestions.caption);

  return {
    imageUrl: formatUrl ?? genericUrl,
    caption: caption || asText(captions[0]) || fallbackCaption,
    note: null,
  };
}

function formatFromAspectRatio(aspectRatio: string, options: GenerationOptions): ContentFormat {
  if (options.videoCount > 0) return "video";
  if (options.storyCount > 0) return "story";
  if (options.postCount > 0) return "feed";
  return aspectRatio === "9:16" ? "story" : "feed";
}

function addCacheBuster(url: string, jobId: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("job", jobId);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Lists image files in the Supabase `results` bucket, including files in nested folders.
 * The bucket must be public for its public URLs to display in the browser.
 */
export async function listGeneratedImages(): Promise<GeneratedImage[]> {
  const supabase = createSupabaseClient();

  async function listFolder(prefix: string): Promise<GeneratedImage[]> {
    const entries: StorageEntry[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(RESULTS_BUCKET).list(prefix, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: "created_at", order: "desc" },
      });

      if (error) {
        throw new Error(`Could not load images from Supabase Storage: ${error.message}`);
      }

      const page = (data ?? []) as StorageEntry[];
      entries.push(...page);
      if (page.length < STORAGE_PAGE_SIZE) break;
      offset += page.length;
    }

    const folders = entries.filter((entry) => !entry.id && !entry.metadata && entry.name);
    const files = entries.filter((entry) => Boolean(entry.id) && entry.name);
    const images: GeneratedImage[] = files.flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const metadata = entry.metadata ?? {};
      const mimeType = String(metadata.mimetype ?? metadata.contentType ?? "").toLowerCase();
      const hasImageExtension = /\.(avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i.test(entry.name);
      if (!mimeType.startsWith("image/") && !hasImageExtension) return [];

      const { data: publicUrlData } = supabase.storage.from(RESULTS_BUCKET).getPublicUrl(path);
      return [{
        url: publicUrlData.publicUrl,
        path,
        name: entry.name,
        createdAt: entry.created_at ?? entry.updated_at ?? null,
      }];
    });

    const nestedImages = await Promise.all(
      folders.map((folder) => listFolder(prefix ? `${prefix}/${folder.name}` : folder.name)),
    );

    return images.concat(...nestedImages);
  }

  const images = await listFolder("");
  return images.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });
}

export async function runJob(
  uploadDataUrl: string,
  caption: string,
  generationOptions: GenerationOptions,
  { aspect_ratio: aspectRatio }: { aspect_ratio: string },
): Promise<JobResult> {
  const config = getConfig();
  const supabase = createClient(config.url, config.key);
  const format = formatFromAspectRatio(aspectRatio, generationOptions);
  const uploadPath = `uploads/${crypto.randomUUID()}.jpg`;

  const upload = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(uploadPath, dataUrlToBlob(uploadDataUrl), {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (upload.error) throw new Error(`Could not upload the source image: ${upload.error.message}`);

  const originalUrl = `${config.url}/storage/v1/object/public/${UPLOAD_BUCKET}/${uploadPath}`;
  const insert = await supabase
    .from("photo_jobs")
    .insert({
      original_path: uploadPath,
      original_url: originalUrl,
      aspect_ratio: aspectRatio,
      prompt: generationOptions.customPrompt,
      caption,
      status: "pending",
      generation_options: generationOptions,
    })
    .select("id")
    .single();

  if (insert.error) throw new Error(`Could not create the generation job: ${insert.error.message}`);
  const jobId = String(insert.data.id);
  const deadline = Date.now() + WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));

    const { data, error } = await supabase
      .from("photo_jobs")
      .select("id,status,suggestions,error_message")
      .eq("id", jobId)
      .single<JobRow>();

    if (error) throw new Error(`Could not check generation status: ${error.message}`);
    if (!data) throw new Error("The generation job disappeared from photo_jobs.");

    const status = String(data.status ?? "").toLowerCase();
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(asText(data.error_message) || "n8n marked this generation job as failed.");
    }

    if (["completed", "complete", "done", "success", "succeeded"].includes(status)) {
      const result = readSuggestions(data.suggestions, caption, format);
      if (!result.imageUrl) {
        throw new Error(
          `Job ${jobId} completed, but suggestions has no image URL for ${format}. Check the n8n Supabase update node.`,
        );
      }
      // This only prevents browser caching. n8n must still write a unique file per job.
      result.imageUrl = addCacheBuster(result.imageUrl, jobId);
      return result;
    }
  }

  throw new Error(
    `Generation timed out after ${Math.round(WAIT_MS / 1000)} seconds. Job ID: ${jobId}. ` +
    "The job is still pending/processing in Supabase; check the n8n execution and make sure its final update node sets photo_jobs.status to completed or failed.",
  );
}
