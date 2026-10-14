import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as LoaderCircle, c as Copy, i as RectangleVertical, o as ImagePlus, r as Square, s as Download, t as Video } from "../_libs/lucide-react.mjs";
import { t as createClient } from "../_libs/supabase__supabase-js.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-B5oouOk3.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var BUCKET = "photos";
var WAIT_MS = 12e4;
function config() {
	return null;
}
function dataUrlToBlob(dataUrl) {
	const [header, data] = dataUrl.split(",");
	const mime = /data:(.*?);/.exec(header)?.[1] ?? "image/jpeg";
	const binary = atob(data);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}
function asText(value) {
	return typeof value === "string" ? value.trim() : "";
}
function asList(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}
function firstUrl(...values) {
	for (const value of values) {
		if (typeof value === "string" && /^https?:\/\//.test(value.trim())) return value.trim();
		if (Array.isArray(value)) {
			const nested = firstUrl(...value);
			if (nested) return nested;
		}
	}
	return null;
}
function parseSuggestions(value) {
	let parsed = value;
	for (let attempt = 0; attempt < 2 && typeof parsed === "string"; attempt += 1) try {
		parsed = JSON.parse(parsed);
	} catch {
		const normalized = String(parsed).replace(/\\n/g, "\n").replace(/\\"/g, "\"");
		if (normalized === parsed) break;
		try {
			parsed = JSON.parse(normalized);
		} catch {
			break;
		}
	}
	return parsed;
}
function readSuggestions(value, fallback) {
	const raw = parseSuggestions(value);
	const suggestions = raw && typeof raw === "object" ? raw : {};
	const posters = asList(suggestions.poster_urls);
	const captions = asList(suggestions.captions);
	return {
		feedImage: firstUrl(suggestions.feed_url, suggestions.feed_image, posters[0], suggestions.image_url, suggestions.output_url),
		storyImage: firstUrl(suggestions.story_url, suggestions.story_image, posters[1], posters[0], suggestions.image_url, suggestions.output_url),
		feedCaption: asText(suggestions.feed_caption) || captions[0] || fallback,
		storyCaption: asText(suggestions.story_caption) || captions[1] || captions[0] || fallback,
		note: null
	};
}
async function resolveGeneratedImages(result, cfg) {
	const [feed, story] = await Promise.all([result.feedImage, result.storyImage].map(async (url) => {
		if (!url) return null;
		try {
			return (await fetch(url, { method: "HEAD" })).ok ? url : null;
		} catch {
			return null;
		}
	}));
	if (feed && story) return result;
	const listed = await createClient(cfg.url, cfg.key).storage.from("results").list("", {
		limit: 20,
		sortBy: {
			column: "created_at",
			order: "desc"
		},
		search: "generated-"
	});
	if (listed.error) throw new Error(`Could not find generated images: ${listed.error.message}`);
	const images = listed.data.filter((file) => file.name.startsWith("generated-") && /\.(jpe?g|png|webp)$/i.test(file.name)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
	if (images.length === 0) return result;
	const publicUrl = (name) => `${cfg.url}/storage/v1/object/public/results/${encodeURIComponent(name)}`;
	return {
		...result,
		feedImage: feed ?? publicUrl(images[0].name),
		storyImage: story ?? publicUrl(images[1]?.name ?? images[0].name)
	};
}
async function runJob(uploadDataUrl, caption, generationOptions) {
	const cfg = config();
	if (!cfg) throw new Error("On Vercel, set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then redeploy.");
	const db = createClient(cfg.url, cfg.key);
	const path = `uploads/${crypto.randomUUID()}.jpg`;
	const uploaded = await db.storage.from(BUCKET).upload(path, dataUrlToBlob(uploadDataUrl), {
		contentType: "image/jpeg",
		upsert: false
	});
	if (uploaded.error) throw new Error(uploaded.error.message);
	const originalUrl = `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}`;
	const inserted = await db.from("photo_jobs").insert({
		original_path: path,
		original_url: originalUrl,
		caption,
		status: "pending",
		generation_options: generationOptions
	}).select("id").single();
	if (inserted.error) throw new Error(inserted.error.message);
	const jobId = String(inserted.data.id);
	const started = Date.now();
	while (Date.now() - started < WAIT_MS) {
		await new Promise((resolve) => setTimeout(resolve, 3e3));
		const row = await db.from("photo_jobs").select("*").eq("id", jobId).single();
		if (row.error) throw new Error(row.error.message);
		const status = String(row.data.status);
		if (status === "failed") throw new Error(asText(row.data.error_message) || "n8n marked this job as failed.");
		if ([
			"completed",
			"complete",
			"done",
			"success"
		].includes(status)) return resolveGeneratedImages(readSuggestions(row.data.suggestions ?? row.data, caption), cfg);
	}
	throw new Error("Still waiting on n8n. Check that ngrok is running and the Supabase trigger uses that URL.");
}
function readFile(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.onerror = () => reject(/* @__PURE__ */ new Error("Could not read that file."));
		reader.readAsDataURL(file);
	});
}
function shrinkForUpload(dataUrl) {
	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () => {
			const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.round(image.width * scale));
			canvas.height = Math.max(1, Math.round(image.height * scale));
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				resolve(dataUrl);
				return;
			}
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
			resolve(canvas.toDataURL("image/jpeg", .84));
		};
		image.onerror = () => resolve(dataUrl);
		image.src = dataUrl;
	});
}
function download(dataUrl, name) {
	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = name;
	link.click();
}
function PostCard({ label, ratio, image, caption, fileName, tall }) {
	const [copied, setCopied] = (0, import_react.useState)(false);
	async function copyCaption() {
		if (!caption) return;
		await navigator.clipboard.writeText(caption);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1400);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "flex min-w-0 flex-col gap-3 rounded-card border border-line bg-card p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "flex items-center gap-2 text-sm font-medium text-ink",
					children: [tall ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RectangleVertical, {
						className: "size-4",
						"aria-hidden": "true"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, {
						className: "size-4",
						"aria-hidden": "true"
					}), label]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs tracking-wide text-muted uppercase",
					children: ratio
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: tall ? "mx-auto w-full max-w-52 frame-story overflow-hidden rounded-lg bg-paper" : "frame-square overflow-hidden rounded-lg bg-paper",
				children: image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: image,
					alt: "",
					className: "h-full w-full object-cover"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex h-full items-center justify-center px-4 text-center text-sm text-muted",
					children: "Waiting for a photo"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "min-h-12 text-sm leading-relaxed text-ink",
				children: caption || "Caption will sit here."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: copyCaption,
					disabled: !caption,
					className: "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card text-sm font-medium text-ink disabled:opacity-40",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {
						className: "size-4",
						"aria-hidden": "true"
					}), copied ? "Copied" : "Copy"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => image && download(image, fileName),
					disabled: !image,
					className: "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-paper disabled:opacity-40",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {
						className: "size-4",
						"aria-hidden": "true"
					}), "Save"]
				})]
			})
		]
	});
}
function Studio() {
	const inputRef = (0, import_react.useRef)(null);
	const [source, setSource] = (0, import_react.useState)(null);
	const [caption, setCaption] = (0, import_react.useState)("");
	const [promptType, setPromptType] = (0, import_react.useState)("redesign");
	const [postCount, setPostCount] = (0, import_react.useState)(1);
	const [storyCount, setStoryCount] = (0, import_react.useState)(0);
	const [videoCount, setVideoCount] = (0, import_react.useState)(0);
	const [postCaptionCount, setPostCaptionCount] = (0, import_react.useState)(3);
	const [videoCaptionCount, setVideoCaptionCount] = (0, import_react.useState)(2);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [result, setResult] = (0, import_react.useState)(null);
	async function onFile(file) {
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			setError("Use a photo file.");
			return;
		}
		setError(null);
		setResult(null);
		const preview = await readFile(file);
		const upload = await shrinkForUpload(preview);
		setSource({
			name: file.name,
			preview,
			upload
		});
	}
	async function onGenerate() {
		if (!source || busy) return;
		setBusy(true);
		setError(null);
		try {
			const next = await runJob(source.upload, caption.trim(), {
				promptType,
				postCount,
				storyCount,
				videoCount,
				postCaptionCount,
				videoCaptionCount
			});
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
	const hasInput = Boolean(source || caption.trim());
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex flex-col gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium tracking-[0.18em] text-accent uppercase",
					children: "Frame"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "font-display text-4xl leading-none text-ink sm:text-5xl",
					children: "One photo, two posts."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "max-w-xl text-base leading-relaxed text-muted",
					children: "Drop a picture and the caption you already like. Frame keeps the subject and writes a close caption for a square feed post and a tall Instagram story."
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "flex flex-col gap-4 rounded-card border border-line bg-card p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => inputRef.current?.click(),
						onDragOver: (event) => event.preventDefault(),
						onDrop: (event) => {
							event.preventDefault();
							onFile(event.dataTransfer.files[0]);
						},
						className: "flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-paper px-4 text-center",
						children: [source ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: source.preview,
							alt: "",
							className: "max-h-48 rounded-lg object-contain"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImagePlus, {
							className: "size-7 text-accent",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-sm text-muted",
							children: source ? source.name : "Drop a photo, or click to choose one"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						ref: inputRef,
						type: "file",
						accept: "image/*",
						className: "sr-only",
						onChange: (event) => {
							onFile(event.target.files?.[0]);
							event.target.value = "";
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex flex-col gap-2 text-sm font-medium text-ink",
						children: ["Caption", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							value: caption,
							onChange: (event) => setCaption(event.target.value),
							rows: 4,
							maxLength: 500,
							placeholder: "The line you would actually post.",
							className: "resize-none rounded-xl border border-line bg-paper px-3 py-3 text-base font-normal text-ink outline-none"
						})]
					}),
					hasInput ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-3 border-t border-line pt-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm font-medium text-ink",
								children: "Generation style"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-xs leading-relaxed text-muted",
								children: "Choose how Frame should use your reference."
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid gap-2",
								children: [
									{
										value: "redesign",
										label: "Redesign image"
									},
									{
										value: "keep_structure",
										label: "Keep structure the same"
									},
									{
										value: "new_from_reference",
										label: "New from reference image"
									}
								].map((tab) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setPromptType(tab.value),
									className: `rounded-xl border px-3 py-3 text-left text-sm transition ${promptType === tab.value ? "border-accent bg-accent/10 font-semibold text-ink" : "border-line bg-paper text-muted"}`,
									children: tab.label
								}, tab.value))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid gap-3 sm:grid-cols-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CountSelect, {
										label: "Instagram posts",
										value: postCount,
										onChange: setPostCount
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CountSelect, {
										label: "Instagram stories",
										value: storyCount,
										onChange: setStoryCount
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CountSelect, {
										label: "Portrait videos",
										value: videoCount,
										onChange: setVideoCount,
										icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Video, {
											className: "size-4",
											"aria-hidden": "true"
										})
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-xl bg-paper p-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mb-3 text-sm font-medium text-ink",
										children: "Generated captions"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid gap-3 sm:grid-cols-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CountSelect, {
											label: "Post captions",
											value: postCaptionCount,
											onChange: setPostCaptionCount,
											max: 10
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CountSelect, {
											label: "Video captions",
											value: videoCaptionCount,
											onChange: setVideoCaptionCount,
											max: 10,
											disabled: videoCount === 0
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-xs leading-relaxed text-muted",
										children: "Stories do not generate captions. Post captions are independent of the number of images."
									})
								]
							})
						]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void onGenerate(),
						disabled: !source || !hasInput || busy,
						className: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-40",
						children: [busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
							className: "size-4 animate-spin",
							"aria-hidden": "true"
						}) : null, busy ? "Sending to n8n" : "Generate similar posts"]
					}),
					error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm leading-relaxed text-warn",
						children: error
					}) : null,
					result?.note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm leading-relaxed text-muted",
						children: result.note
					}) : null
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "grid gap-4 sm:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PostCard, {
					label: "Feed",
					ratio: "1:1",
					image: feedImage,
					caption: feedCaption,
					fileName: "frame-feed.jpg"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PostCard, {
					label: "Story",
					ratio: "9:16",
					image: storyImage,
					caption: storyCaption,
					fileName: "frame-story.jpg",
					tall: true
				})]
			})]
		})]
	});
}
function CountSelect({ label, value, onChange, max = 5, disabled = false, icon }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: `flex flex-col gap-2 text-xs font-medium text-muted ${disabled ? "opacity-50" : ""}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex items-center gap-1.5",
			children: [icon, label]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
			value,
			disabled,
			onChange: (event) => onChange(Number(event.target.value)),
			className: "h-10 rounded-lg border border-line bg-card px-2 text-sm text-ink outline-none",
			children: Array.from({ length: max + 1 }, (_, count) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: count,
				children: count
			}, count))
		})]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Studio, {});
}
//#endregion
export { Home as component };
