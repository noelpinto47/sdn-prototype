import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/generate-DR2O655I.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var MAX_DATA_URL = 24e5;
function captionsFromModel(text, fallback) {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start >= 0 && end > start) try {
		const parsed = JSON.parse(text.slice(start, end + 1));
		const feed = typeof parsed.feed === "string" ? parsed.feed.trim() : "";
		const story = typeof parsed.story === "string" ? parsed.story.trim() : "";
		if (feed && story) return {
			feed,
			story
		};
	} catch {}
	const trimmed = fallback.trim();
	return {
		feed: trimmed,
		story: trimmed.length > 90 ? `${trimmed.slice(0, 87).trim()}…` : trimmed
	};
}
async function rewriteCaptions(apiKey, caption) {
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: "grok-4.5",
			max_tokens: 280,
			messages: [{
				role: "system",
				content: "Rewrite one social caption into two close variants. Keep the same language, facts, and voice. Do not invent prices, offers, or claims. Return only JSON {\"feed\":\"...\",\"story\":\"...\"}. feed is 1-2 sentences for a square Instagram post. story is one short line for an Instagram story."
			}, {
				role: "user",
				content: caption
			}]
		})
	});
	if (!res.ok) return captionsFromModel("", caption);
	return captionsFromModel((await res.json()).choices?.[0]?.message?.content ?? "", caption);
}
async function editImage(apiKey, imageDataUrl, caption, aspectRatio) {
	const prompt = `New photograph in the same subject, setting, lighting, and mood as the reference. ${aspectRatio === "1:1" ? "square Instagram feed photo, subject centered with breathing room" : "vertical Instagram story photo, subject still readable in a tall frame"}. Caption context, do not render this text: ${caption}. No words, logos, watermarks, or interface.`;
	const res = await fetch("https://api.x.ai/v1/images/edits", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: "grok-imagine-image-2.0",
			prompt,
			image: {
				url: imageDataUrl,
				type: "image_url"
			},
			aspect_ratio: aspectRatio,
			resolution: "1k",
			quality: "low",
			response_format: "b64_json"
		})
	});
	if (!res.ok) return null;
	const body = await res.json();
	const b64 = body.data?.[0]?.b64_json ?? body.b64_json;
	if (!b64) return null;
	return `data:image/jpeg;base64,${b64}`;
}
var generateVariants_createServerFn_handler = createServerRpc({
	id: "7760775234ac9c5bd94e5a363032051f18656b0aecb9ed1ac1a5a57a634724e5",
	name: "generateVariants",
	filename: "src/lib/generate.ts"
}, (opts) => generateVariants.__executeServer(opts));
var generateVariants = createServerFn({ method: "POST" }).validator((input) => {
	if (!input || typeof input !== "object") throw new Error("Missing image and caption.");
	const imageDataUrl = "imageDataUrl" in input ? input.imageDataUrl : "";
	const caption = "caption" in input ? input.caption : "";
	if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) throw new Error("Upload a photo first.");
	if (imageDataUrl.length > MAX_DATA_URL) throw new Error("That photo is too large. Try a smaller image.");
	if (typeof caption !== "string" || caption.trim().length < 2) throw new Error("Add a caption first.");
	if (caption.trim().length > 500) throw new Error("Keep the caption under 500 characters.");
	return {
		imageDataUrl,
		caption: caption.trim()
	};
}).handler(generateVariants_createServerFn_handler, async ({ data }) => {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		feedCaption: data.caption,
		storyCaption: data.caption,
		feedImage: null,
		storyImage: null,
		note: "Image generation is unavailable right now. The crops below use your original photo."
	};
	const [captions, feedImage, storyImage] = await Promise.all([
		rewriteCaptions(apiKey, data.caption),
		editImage(apiKey, data.imageDataUrl, data.caption, "1:1"),
		editImage(apiKey, data.imageDataUrl, data.caption, "9:16")
	]);
	const missing = [feedImage, storyImage].filter((item) => !item).length;
	return {
		feedCaption: captions.feed,
		storyCaption: captions.story,
		feedImage,
		storyImage,
		note: missing === 2 ? "The new photos did not come back. Your original crops are still here." : missing === 1 ? "One format did not generate. The other is ready." : null
	};
});
//#endregion
export { generateVariants_createServerFn_handler };
