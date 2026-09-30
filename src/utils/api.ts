import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { Headers as FetchHeaders } from "node-fetch";
import { currentApiVersion, errorConnectionMessage, localStorageKeys } from "./constant";
import { checkResponseError } from "./error";
import { request } from "./request";

interface FetchOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: boolean;
}

export interface ApiResponse<T> {
  headers: FetchHeaders;
  payload: T;
}

/**
 * Retrieve the API key from preferences, falling back to local storage.
 * @returns The API key, or undefined if none is set.
 */
export async function getApiKey(): Promise<string | undefined> {
  return getPreferenceValues().apiKey || ((await LocalStorage.getItem(localStorageKeys.apiKey)) as string | undefined);
}

/**
 * A central API fetch function that applies uniform error handling.
 * @param url The URL to fetch.
 * @param options The fetch options.
 * @returns The API response.
 */
export async function apiFetch<T>(url: string, options: FetchOptions): Promise<ApiResponse<T>> {
  try {
    const token = await getApiKey();

    return await request(
      url,
      {
        method: options.method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
          "Anytype-Version": currentApiVersion,
          ...options.headers,
        },
        body: options.body,
      },
      async (response) => {
        await checkResponseError(response);
        if (response.status === 204) return { payload: undefined as T, headers: response.headers };
        try {
          return { payload: (await response.json()) as T, headers: response.headers };
        } catch {
          throw new Error("Failed to parse JSON response");
        }
      },
      { signal: options.signal, timeoutMs: options.timeoutMs, retry: options.retry ?? options.method === "GET" },
    );
  } catch (error) {
    if (error instanceof Error && (error as { code?: string }).code === "ECONNREFUSED") {
      throw new Error(errorConnectionMessage);
    }
    throw error;
  }
}
