import fetch, { RequestInit, Response } from "node-fetch";
import { setTimeout as delay } from "node:timers/promises";

/** Safe reads may retry transient failures. Writes are never automatically repeated. */
export async function request<T>(
  url: string,
  options: RequestInit,
  read: (response: Response) => Promise<T>,
  config: { signal?: AbortSignal; timeoutMs?: number; retry?: boolean } = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  config.signal?.addEventListener("abort", abort, { once: true });
  if (config.signal?.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs ?? 15000);
  const retries = config.retry ? 2 : 0;
  try {
    for (let attempt = 0; ; attempt++) {
      // node-fetch can emit an unhandled body-stream error for an already-aborted POST.
      // Reject before constructing that request (API key lookup can race with cancellation).
      if (controller.signal.aborted) {
        const error = new Error("Request cancelled");
        error.name = "AbortError";
        throw error;
      }
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (attempt < retries && [429, 502, 503, 504].includes(response.status)) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter ? Number(retryAfter) : NaN;
        const wait = Number.isFinite(seconds)
          ? seconds * 1000
          : retryAfter
            ? Date.parse(retryAfter) - Date.now()
            : 300 * 2 ** attempt;
        // A longer Retry-After must be reported rather than retried prematurely.
        if (!Number.isFinite(wait) || wait > 5000) return await read(response);
        await response.text();
        await delay(Math.max(0, wait), undefined, { signal: controller.signal });
        continue;
      }
      return await read(response);
    }
  } catch (error) {
    if (timedOut && !config.signal?.aborted) throw new Error("Anytype request timed out. Please retry.");
    throw error;
  } finally {
    clearTimeout(timer);
    config.signal?.removeEventListener("abort", abort);
  }
}
