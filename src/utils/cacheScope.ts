import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { createHash } from "node:crypto";

let scope = "uninitialized";
export async function initializeCacheScope(): Promise<string> {
  const preferences = getPreferenceValues();
  const token = preferences.apiKey || (await LocalStorage.getItem<string>("api_key")) || "";
  const origin = (preferences.apiUrl || "http://127.0.0.1:31009").replace("localhost", "127.0.0.1");
  scope = createHash("sha256").update(`${origin}\0${token}`).digest("hex");
  return scope;
}
export function getCacheNamespace(): string {
  const preferences = getPreferenceValues();
  return `${scope}:${preferences.sort || "last_modified_date"}:${preferences.limit || "50"}`;
}
