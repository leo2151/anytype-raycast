import { getRawObject, updateObjectRaw } from "../api";
import { BodyFormat } from "../models";
import { propKeys } from "./constant";
const pending = new Map<string, Promise<unknown>>();
/** Read latest tags before modifying the set; serialize local changes to one object. */
export async function changeObjectTag(spaceId: string, objectId: string, tagId: string, remove = false) {
  const key = `${spaceId}:${objectId}`;
  const operation = (pending.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const { object } = await getRawObject(spaceId, objectId, BodyFormat.Markdown);
      const tags = object.properties.find((p) => p.key === propKeys.tag)?.multi_select ?? [];
      const ids = new Set(tags.map((t) => t.id));
      if (remove) ids.delete(tagId);
      else ids.add(tagId);
      await updateObjectRaw(spaceId, objectId, { properties: [{ key: propKeys.tag, multi_select: [...ids] }] });
    });
  pending.set(key, operation);
  try {
    await operation;
  } finally {
    if (pending.get(key) === operation) pending.delete(key);
  }
}
