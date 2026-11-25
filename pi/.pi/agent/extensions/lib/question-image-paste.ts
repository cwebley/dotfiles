import { Buffer } from "node:buffer";
import type { ImageContent } from "@earendil-works/pi-ai";
import { convertToPng, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { Editor, type EditorTheme, type TUI, getNativeClipboard, truncateToWidth } from "@earendil-works/pi-tui";

export interface QuestionInput {
	text: string;
	images: ImageContent[];
}

function supportedMime(bytes: Uint8Array): string | undefined {
	const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
	if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
	if (starts(255, 216, 255)) return "image/jpeg";
	const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString("ascii");
	if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
	return undefined;
}

/** Dialog-local attachments. Only answer() exposes bytes, never render() or tool details. */
export class QuestionImageEditor extends Editor {
	onAnswer?: (answer: QuestionInput) => void;
	private attachments = new Map<string, ImageContent>();
	private nextId = 1;
	private epoch = 0;
	private editing = true;
	private closed = false;
	private pending = false;
	private notice = "";

	constructor(
		tui: TUI,
		theme: EditorTheme,
		private keybindings: KeybindingsManager,
		private changed: () => void,
		signal: AbortSignal,
	) {
		super(tui, theme);
		this.onSubmit = (text) => {
			if (!this.closed && this.editing && !this.pending) this.onAnswer?.(this.answer(text));
		};
		const close = () => {
			this.closed = true;
			this.setEditing(false);
			this.attachments.clear();
		};
		signal.addEventListener("abort", close, { once: true });
		if (signal.aborted) close();
	}

	setEditing(editing: boolean): void {
		this.editing = editing;
		if (!editing) {
			this.epoch++;
			this.pending = false;
			this.disableSubmit = false;
			this.notice = "";
		}
	}

	answer(text = this.getExpandedText()): QuestionInput {
		return {
			text: text.trim(),
			images: [...this.attachments].filter(([token]) => text.includes(token)).map(([, image]) => image),
		};
	}

	handleInput(data: string): void {
		if (this.closed || !this.editing) return;
		if (this.keybindings.matches(data, "app.clipboard.pasteImage")) {
			// One read at a time. Repeated shortcut events cannot reorder attachments.
			if (!this.pending) void this.pasteClipboard();
			return;
		}
		super.handleInput(data);
	}

	render(width: number): string[] {
		const count = this.answer().images.length;
		const status = this.notice || `${count} image${count === 1 ? "" : "s"} attached • Paste with clipboard shortcut • Delete token to remove`;
		return [...super.render(width), truncateToWidth(status, width)];
	}

	private async pasteClipboard(): Promise<void> {
		const epoch = this.epoch;
		const current = () => !this.closed && this.editing && epoch === this.epoch;
		this.pending = true;
		this.disableSubmit = true;
		this.notice = "Reading clipboard... Press Enter after it finishes.";
		this.changed();
		try {
			const clipboard = getNativeClipboard();
			// Native getImage works on older macOS where the shell clipboard backend fails.
			let bytes: Uint8Array | null | undefined;
			try { bytes = await clipboard?.getImage(); } catch { /* Try text before reporting failure. */ }
			if (!current()) return;
			if (bytes?.length) {
				const mimeType = supportedMime(bytes);
				const data = Buffer.from(bytes).toString("base64");
				const image = mimeType ? { data, mimeType } : await convertToPng(data, "application/octet-stream");
				if (!current()) return;
				if (!image) {
					this.notice = "Clipboard image format is unsupported. Nothing attached.";
					return;
				}
				const token = `[question-image:${this.nextId++}]`;
				this.attachments.set(token, { type: "image", data: image.data, mimeType: image.mimeType });
				this.insertTextAtCursor(token);
				this.notice = "";
			} else {
				const text = await clipboard?.getText?.();
				if (!current()) return;
				if (text) {
					this.insertTextAtCursor(text);
					this.notice = "";
				} else {
					this.notice = "No image or text available from the native clipboard.";
				}
			}
		} catch {
			// Clipboard errors may contain private data. Keep the UI message fixed.
			if (current()) this.notice = "Could not read clipboard. Try pasting again.";
		} finally {
			if (current()) {
				this.pending = false;
				this.disableSubmit = false;
				this.changed();
			}
		}
	}
}
