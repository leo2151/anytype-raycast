import { showToast, Toast } from "@raycast/api";
import { PaginatedResponse, RawSpace } from "../../models";
import { apiEndpoints, apiFetch, currentApiVersion, ErrorWithStatus } from "../../utils";

// Validate api version and token by checking if data can be fetched without errors
export async function checkApiTokenValidity(): Promise<boolean> {
  try {
    const { url, method } = apiEndpoints.getSpaces({ offset: 0, limit: 1 });
    const response = await apiFetch<PaginatedResponse<RawSpace>>(url, { method: method });

    const apiVersion = response.headers.get("Anytype-Version");
    if (!apiVersion || apiVersion < currentApiVersion) {
      await showToast(
        Toast.Style.Failure,
        "App Update Required",
        `Please update the Anytype app to match the extension's API version ${currentApiVersion}.`,
      );
    } else if (apiVersion > currentApiVersion) {
      await showToast(
        Toast.Style.Failure,
        "Extension Update Required",
        `Please update the extension to match the Anytype app's API version ${apiVersion}.`,
      );
    }
    return true;
  } catch (error) {
    // Only an explicit authentication rejection should invalidate a saved key.
    // A stopped desktop app, rate limit, timeout, or gateway failure can recover.
    if ((error as ErrorWithStatus)?.status === 401) return false;
    await showToast(
      Toast.Style.Failure,
      "Anytype is temporarily unavailable",
      "Open Anytype and retry if results do not load.",
    );
    return true;
  }
}
