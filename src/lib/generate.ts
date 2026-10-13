import { createServerFn } from "@tanstack/react-start";

export type StudioResult = {
  feedCaption: string;
  storyCaption: string;
  feedImage: string | null;
  storyImage: string | null;
  note: string | null;
};

const MAX_DATA_URL = 2_400_000;

function captionsFromModel(text: string, fallback: string): { feed: string; story: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as {
        feed?: unknown;
        story?: unknown;
      };
      const feed = typeof parsed.feed === "string" ? parsed.feed.trim() : "";
      const story = typeof parsed.story === "string" ? parsed.story.trim() : "";
      if (feed && story) return { feed, story };
    } catch {
      /* fall through */
    }
  }
  const trimmed = fallback.trim();
  return {
    feed: trimmed,
    story: trimmed.length > 90 ? `${trimmed.slice(0, 87).trim()}…` : trimmed,
  };
}

async function rewriteCaptions(apiKey: string, caption: string): Promise<{ feed: string; story: string }> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content:
            "Rewrite one social caption into two close variants. Keep the same language, facts, and voice. Do not invent prices, offers, or claims. Return only JSON {\"feed\":\"...\",\"story\":\"...\"}. feed is 1-2 sentences for a square Instagram post. story is one short line for an Instagram story.",
        },
        { role: "user", content: caption },
      ],
    }),
  });
  if (!res.ok) return captionsFromModel("", caption);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  return captionsFromModel(text, caption);
}

async function editImage(
  apiKey: string,
  imageDataUrl: string,
  caption: string,
  aspectRatio: "1:1" | "9:16",
): Promise<string | null> {
  const format =
    aspectRatio === "1:1"
      ? "square Instagram feed photo, subject centered with breathing room"
      : "vertical Instagram story photo, subject still readable in a tall frame";
  const prompt = `New photograph in the same subject, setting, lighting, and mood as the reference. ${format}. Caption context, do not render this text: ${caption}. No words, logos, watermarks, or interface.`;

  const res = await fetch("https://api.x.ai/v1/images/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-imagine-image-2.0",
      prompt,
      image: { url: imageDataUrl, type: "image_url" },
      aspect_ratio: aspectRatio,
      resolution: "1k",
      quality: "low",
      response_format: "b64_json",
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    data?: { b64_json?: string }[];
    b64_json?: string;
  };
  const b64 = body.data?.[0]?.b64_json ?? body.b64_json;
  if (!b64) return null;
  return `data:image/jpeg;base64,${b64}`;
}

export const generateVariants = createServerFn({ method: "POST" })
  .validator((input: unknown): { imageDataUrl: string; caption: string } => {
    if (!input || typeof input !== "object") throw new Error("Missing image and caption.");
    const imageDataUrl = "imageDataUrl" in input ? input.imageDataUrl : "";
    const caption = "caption" in input ? input.caption : "";
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      throw new Error("Upload a photo first.");
    }
    if (imageDataUrl.length > MAX_DATA_URL) {
      throw new Error("That photo is too large. Try a smaller image.");
    }
    if (typeof caption !== "string" || caption.trim().length < 2) {
      throw new Error("Add a caption first.");
    }
    if (caption.trim().length > 500) throw new Error("Keep the caption under 500 characters.");
    return { imageDataUrl, caption: caption.trim() };
  })
  .handler(async ({ data }): Promise<StudioResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return {
        feedCaption: data.caption,
        storyCaption: data.caption,
        feedImage: null,
        storyImage: null,
        note: "Image generation is unavailable right now. The crops below use your original photo.",
      };
    }

    const [captions, feedImage, storyImage] = await Promise.all([
      rewriteCaptions(apiKey, data.caption),
      editImage(apiKey, data.imageDataUrl, data.caption, "1:1"),
      editImage(apiKey, data.imageDataUrl, data.caption, "9:16"),
    ]);

    const missing = [feedImage, storyImage].filter((item) => !item).length;
    return {
      feedCaption: captions.feed,
      storyCaption: captions.story,
      feedImage,
      storyImage,
      note:
        missing === 2
          ? "The new photos did not come back. Your original crops are still here."
          : missing === 1
            ? "One format did not generate. The other is ready."
            : null,
    };
  });
