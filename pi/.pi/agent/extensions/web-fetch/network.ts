import { isIP } from "node:net";

export class FetchFailure extends Error {
	constructor(message: string, readonly terminal = true) {
		super(message);
	}
}

function blockedIPv4(host: string): boolean {
	const [a, b, c] = host.split(".").map(Number);
	return a === 0 || a === 10 || a === 127 || a >= 224 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) ||
		(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
		(a === 203 && b === 0 && c === 113);
}

function blockedIPv6(host: string): boolean {
	const halves = host.split("::");
	const left = halves[0] ? halves[0].split(":") : [];
	const right = halves[1] ? halves[1].split(":") : [];
	const groups = halves.length === 2
		? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
		: left;
	const words = groups.map(value => parseInt(value, 16));
	const allZero = words.slice(0, 7).every(value => value === 0);
	if (allZero && (words[7] === 0 || words[7] === 1)) return true;
	if (words.slice(0, 5).every(value => value === 0) && words[5] === 0xffff) {
		return blockedIPv4(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
	}
	return (words[0] & 0xfe00) === 0xfc00 ||
		(words[0] & 0xffc0) === 0xfe80 ||
		(words[0] & 0xffc0) === 0xfec0 ||
		(words[0] & 0xff00) === 0xff00 ||
		(words[0] === 0x2001 && words[1] === 0x0db8);
}

// These checks cover literal hosts only. They do not inspect DNS or prevent rebinding.
export function publicURL(value: string): string {
	let url: URL;
	try { url = new URL(value); } catch { throw new FetchFailure("Invalid URL"); }
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new FetchFailure("URL rejected: only HTTP(S) is supported");
	}
	if (url.username || url.password) throw new FetchFailure("URL rejected: credentials are not allowed");
	const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
	const host = hostname.replace(/^\[|\]$/g, "");
	const ip = isIP(host);
	if ((ip === 4 && blockedIPv4(host)) || (ip === 6 && blockedIPv6(host)) ||
		(!ip && (host === "localhost" || host.endsWith(".localhost") ||
			host.endsWith(".local") || !host.includes(".")))) {
		throw new FetchFailure("URL rejected: non-public host");
	}
	url.hostname = hostname;
	url.hash = "";
	return url.href;
}

export class Operation {
	readonly signal: AbortSignal;
	private readonly expiresAt = performance.now() + 30_000;
	private readonly deadline = AbortSignal.timeout(30_000);
	private readonly controller = new AbortController();
	private readonly onCallerAbort = () => this.controller.abort(new FetchFailure("Caller cancellation"));
	private readonly onTimeout = () => this.controller.abort(new FetchFailure("Fetch timeout after 30 seconds"));
	constructor(private readonly caller?: AbortSignal) {
		this.signal = this.controller.signal;
		caller?.addEventListener("abort", this.onCallerAbort, { once: true });
		this.deadline.addEventListener("abort", this.onTimeout, { once: true });
		if (caller?.aborted) this.onCallerAbort();
		else if (this.deadline.aborted) this.onTimeout();
	}
	check(): void {
		if (!this.signal.aborted && performance.now() >= this.expiresAt) this.onTimeout();
		if (this.signal.aborted) throw this.signal.reason;
	}
	async run<T>(promise: Promise<T>): Promise<T> {
		// Attach handlers even when already aborted, so late rejection is consumed.
		return new Promise<T>((resolve, reject) => {
			const cleanup = () => this.signal.removeEventListener("abort", onAbort);
			const onAbort = () => { cleanup(); reject(this.signal.reason); };
			this.signal.addEventListener("abort", onAbort, { once: true });
			promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
			if (this.signal.aborted) onAbort();
		});
	}
	dispose(): void {
		this.caller?.removeEventListener("abort", this.onCallerAbort);
		this.deadline.removeEventListener("abort", this.onTimeout);
	}
}

export async function discard(response: Response): Promise<void> {
	try { await response.body?.cancel(); } catch { /* Already closed or locked. */ }
}

export async function fetchRedirects(
	url: string, headers: Record<string, string>, operation: Operation,
): Promise<{ response: Response; finalUrl: string }> {
	let current = publicURL(url);
	for (let hops = 0; ; hops++) {
		operation.check();
		let response: Response;
		try {
			const pending = fetch(current, { headers, signal: operation.signal, redirect: "manual" });
			// Fetch may resolve after our abort race, including before body reading starts.
			void pending.then(lateResponse => {
				if (operation.signal.aborted) void discard(lateResponse);
			}, () => {});
			response = await operation.run(pending);
		} catch (error) {
			operation.check();
			if (error instanceof FetchFailure) throw error;
			throw new FetchFailure("Network failure", false);
		}
		if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current };
		const location = response.headers.get("location");
		void discard(response);
		if (hops >= 5) throw new FetchFailure("Redirect limit exceeded: at most five hops");
		if (!location) throw new FetchFailure("Redirect is missing a destination");
		let destination: string;
		try { destination = new URL(location, current).href; } catch { throw new FetchFailure("Invalid redirect URL"); }
		current = publicURL(destination);
	}
}

export function checkStatus(response: Response): void {
	if (response.ok) return;
	void discard(response);
	const terminal = [401, 403, 429].includes(response.status);
	throw new FetchFailure(`HTTP ${response.status}${terminal ? ": authentication or rate limit failure" : ""}`, terminal);
}

// Fetch exposes decompressed bytes in the response stream. Content-Length alone is not a bound.
export async function readBounded(response: Response, limit: number, operation: Operation): Promise<Uint8Array> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > limit) {
		void discard(response);
		throw new FetchFailure(`Response too large: exceeds ${limit / 1024 / 1024} MiB`);
	}
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const cancel = () => { void reader.cancel().catch(() => {}); };
	operation.signal.addEventListener("abort", cancel, { once: true });
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			operation.check();
			const { done, value } = await operation.run(reader.read());
			if (done) break;
			size += value.byteLength;
			if (size > limit) throw new FetchFailure(`Response too large: exceeds ${limit / 1024 / 1024} MiB`);
			chunks.push(value);
		}
		operation.check();
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
		return bytes;
	} catch (error) {
		cancel();
		operation.check();
		if (error instanceof FetchFailure) throw error;
		throw new FetchFailure("Network failure while reading response", false);
	} finally {
		operation.signal.removeEventListener("abort", cancel);
		reader.releaseLock();
	}
}
