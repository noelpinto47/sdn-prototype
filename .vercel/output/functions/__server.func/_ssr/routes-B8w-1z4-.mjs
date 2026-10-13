import { i as __toESM } from "../_runtime.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { a as ImagePlus, i as LoaderCircle, n as Square, o as Download, r as RectangleVertical, s as Copy } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-B8w-1z4-.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var MAX_DATA_URL = 24e5;
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
}).handler(createSsrRpc("7760775234ac9c5bd94e5a363032051f18656b0aecb9ed1ac1a5a57a634724e5"));
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
			const next = await generateVariants({ data: {
				imageDataUrl: source.upload,
				caption
			} });
			setResult(next);
			if (next.note && !next.feedImage && !next.storyImage) setError(next.note);
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
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void onGenerate(),
						disabled: !source || caption.trim().length < 2 || busy,
						className: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-40",
						children: [busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
							className: "size-4 animate-spin",
							"aria-hidden": "true"
						}) : null, busy ? "Making both formats" : "Generate similar posts"]
					}),
					error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm leading-relaxed text-warn",
						children: error
					}) : null,
					result?.note && (result.feedImage || result.storyImage) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
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
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Studio, {});
}
//#endregion
export { Home as component };
