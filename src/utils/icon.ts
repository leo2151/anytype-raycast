import { Icon, Image } from "@raycast/api";
import { IconFormat, IconName, ObjectIcon, ObjectLayout, RawType } from "../models";
import { getApiKey } from "./api";
import { getCacheNamespace } from "./cacheScope";
import { colorToHex, iconWidth } from "./constant";
import { request } from "./request";

/**
 * Determine which icon to show for a given Object. Icon can be url or emoji.
 * @param icon The icon of the object.
 * @param layout The layout of the object.
 * @param type The type of the object .
 * @returns The base64 data URI or Raycast Icon.
 */
export async function getIconWithFallback(
  icon: ObjectIcon | null,
  layout: string,
  type?: RawType | null,
): Promise<Image.ImageLike> {
  if (icon && icon.format) {
    // type built-in icons
    if (icon.format === IconFormat.Icon && icon.name) {
      return getCustomTypeIcon(icon.name, icon.color);
    }

    // file reference
    if (icon.format === IconFormat.File && icon.file) {
      const fileSource = await getFile(icon.file);
      if (fileSource) {
        return { source: fileSource, mask: getMaskForObject(icon.file, layout) };
      }
    }

    // regular emoji
    if (icon.format === IconFormat.Emoji && icon.emoji) {
      return icon.emoji;
    }
  }

  // fallback to grey version of type built-in icon
  if (type && type.icon && type.icon.format === IconFormat.Icon && type.icon.name) {
    return getCustomTypeIcon(type.icon.name, "grey");
  }

  // fallback to layout
  return await fallbackToLayout(layout);
}

/**
 * Fallback to a default icon based on the layout.
 * @param layout The layout of the object.
 * @returns The base64 data URI or Raycast Icon.
 */
async function fallbackToLayout(layout: string): Promise<Image.ImageLike> {
  switch (layout) {
    case ObjectLayout.Action:
      return getCustomTypeIcon(IconName.Checkbox, "grey");
    case ObjectLayout.Set:
    case ObjectLayout.Collection:
      return getCustomTypeIcon(IconName.Layers, "grey");
    case ObjectLayout.Participant:
      return getCustomTypeIcon(IconName.Person, "grey");
    case ObjectLayout.Bookmark:
      return getCustomTypeIcon(IconName.Bookmark, "grey");
    case "type":
      return getCustomTypeIcon(IconName.ExtensionPuzzle, "grey");
    case "template":
      return getCustomTypeIcon(IconName.Copy, "grey");
    case "space":
      return { source: "icons/space/space.svg", tintColor: { light: colorToHex["grey"], dark: colorToHex["grey"] } };
    case "chat":
      return { source: "icons/space/chat.svg", tintColor: { light: colorToHex["grey"], dark: colorToHex["grey"] } };
    default:
      return getCustomTypeIcon(IconName.Document, "grey");
  }
}

/**
 * Retrieve a custom type icon by name from the local assets directory.
 * @param name The name of the icon file (without extension).
 * @param color The color of the icon.
 * @returns The base64 data URI of the icon.
 */
export function getCustomTypeIcon(name: string, color?: string): Image.ImageLike {
  return {
    source: `icons/type/${name}.svg`,
    tintColor: {
      light: colorToHex[color || "grey"],
      dark: colorToHex[color || "grey"],
    },
  };
}

/**
 * Fetch an icon from local gateway and return it as a base64 data URI.
 * @param iconUrl The URL of the icon.
 * @returns The base64 data URI of the icon or undefined.
 */
const iconCache = new Map<string, { value: Promise<string | undefined>; expires: number }>();

export async function getFile(iconUrl: string): Promise<string | undefined> {
  // Only send the API key to the local gateway, not a hostname with a similar prefix.
  let url: URL;
  try {
    url = new URL(iconUrl);
  } catch {
    return undefined;
  }
  if (url.protocol === "http:" && url.hostname === "127.0.0.1") {
    url.searchParams.set("width", String(iconWidth));
    const key = `${getCacheNamespace()}:${url.toString()}`;
    const cached = iconCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (iconCache.size >= 256) iconCache.delete(iconCache.keys().next().value!);
    const value = fetchWithTimeout(url.toString(), 1500);
    iconCache.set(key, { value, expires: Date.now() + 60000 });
    return value;
  }

  return undefined;
}

/**
 * Fetch an icon, respecting a given timeout (in milliseconds).
 * @param url The URL of the icon.
 * @param timeout The timeout in milliseconds.
 * @returns The base64 data URI of the icon or undefined.
 */
export async function fetchWithTimeout(url: string, timeout: number): Promise<string | undefined> {
  try {
    const token = await getApiKey();
    return await request(
      url,
      {
        redirect: "error",
        size: 2 * 1024 * 1024,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      async (response) => {
        if (!response.ok) return undefined;
        const mime = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
        if (!mime.startsWith("image/")) return undefined;
        const data = await response.arrayBuffer();
        return `data:${mime};base64,${Buffer.from(data).toString("base64")}`;
      },
      { timeoutMs: timeout },
    );
  } catch {
    return undefined;
  }
}

/**
 * Determine which mask to use for a given Object.
 * @param icon The icon of the object.
 * @param layout The layout of the object.
 * @returns The mask to use for the object.
 */
export function getMaskForObject(icon: Image.ImageLike, layout: string): Image.Mask {
  return (layout === ObjectLayout.Participant || layout === ObjectLayout.Profile || layout === "chat") &&
    icon != Icon.Document
    ? Image.Mask.Circle
    : Image.Mask.RoundedRectangle;
}
