import { getTemplates, getTypes } from "../api";
import { ObjectLayout, Space, SpaceObject, Type } from "../models";
import { bundledTypeKeys } from "../utils";
import { getCacheNamespace } from "./cacheScope";
import { collectPages, mapConcurrent } from "./pagination";

/**
 * Fetches all `Type`s from a single space, doing pagination if necessary.
 */
const typeCache = new Map<string, { expires: number; value: Promise<Type[]> }>();
export async function fetchAllTypesForSpace(spaceId: string): Promise<Type[]> {
  const key = `${getCacheNamespace()}:${spaceId}`;
  const cached = typeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = collectPages(async (offset, limit) => {
    const result = await getTypes(spaceId, { offset, limit });
    return { items: result.types, pagination: result.pagination };
  });
  typeCache.set(key, { expires: Date.now() + 30000, value });
  try {
    return await value;
  } catch (error) {
    typeCache.delete(key);
    throw error;
  }
}

/**
 * Aggregates all `Type`s from all given spaces.
 */
export async function getAllTypesFromSpaces(spaces: Space[]): Promise<Type[]> {
  return (await mapConcurrent(spaces, (space) => fetchAllTypesForSpace(space.id))).flat();
}

/**
 * Fetches all `Template`s from a single space and type, doing pagination if necessary.
 */
export async function fetchAllTemplatesForSpace(spaceId: string, typeId: string): Promise<SpaceObject[]> {
  return collectPages(async (offset, limit) => {
    const result = await getTemplates(spaceId, typeId, { offset, limit });
    return { items: result.templates, pagination: result.pagination };
  });
}

/**
 * Fetches all unique type keys for page types.
 */
export async function fetchTypeKeysForPages(
  spaces: Space[],
  typeKeysForTasks: string[],
  typeKeysForLists: string[],
): Promise<string[]> {
  const excludedKeysForPages = new Set([
    // not shown anywhere
    bundledTypeKeys.audio,
    bundledTypeKeys.chat,
    bundledTypeKeys.file,
    bundledTypeKeys.image,
    bundledTypeKeys.object_type,
    bundledTypeKeys.tag,
    bundledTypeKeys.template,
    bundledTypeKeys.video,

    // shown in other views
    bundledTypeKeys.set,
    bundledTypeKeys.collection,
    bundledTypeKeys.bookmark,
    bundledTypeKeys.participant,
    ...typeKeysForTasks,
    ...typeKeysForLists,
  ]);

  const allTypes = await getAllTypesFromSpaces(spaces);
  const pageTypeKeys = new Set(allTypes.map((type) => type.key).filter((key) => !excludedKeysForPages.has(key)));
  return Array.from(pageTypeKeys);
}

/**
 * Fetches all type keys for task types.
 */
export async function fetchTypesKeysForTasks(spaces: Space[]): Promise<string[]> {
  const tasksTypes = await getAllTypesFromSpaces(spaces);
  const taskTypeKeys = new Set(
    tasksTypes.filter((type) => type.layout === ObjectLayout.Action).map((type) => type.key),
  );
  return Array.from(taskTypeKeys);
}

/**
 * Fetches all type keys for list types.
 */
export async function fetchTypeKeysForLists(spaces: Space[]): Promise<string[]> {
  const listsTypes = await getAllTypesFromSpaces(spaces);
  const listTypeKeys = new Set(
    listsTypes
      .filter((type) => type.layout === ObjectLayout.Set || type.layout === ObjectLayout.Collection)
      .map((type) => type.key),
  );
  return Array.from(listTypeKeys);
}

export async function fetchSearchTypeKeys(spaces: Space[]) {
  const allTypes = await getAllTypesFromSpaces(spaces);
  const tasks = allTypes.filter((t) => t.layout === ObjectLayout.Action).map((t) => t.key);
  const lists = allTypes
    .filter((t) => t.layout === ObjectLayout.Set || t.layout === ObjectLayout.Collection)
    .map((t) => t.key);
  const excluded = new Set([
    bundledTypeKeys.audio,
    bundledTypeKeys.chat,
    bundledTypeKeys.file,
    bundledTypeKeys.image,
    bundledTypeKeys.object_type,
    bundledTypeKeys.tag,
    bundledTypeKeys.template,
    bundledTypeKeys.video,
    bundledTypeKeys.set,
    bundledTypeKeys.collection,
    bundledTypeKeys.bookmark,
    bundledTypeKeys.participant,
    ...tasks,
    ...lists,
  ]);
  return {
    tasks: [...new Set(tasks)],
    lists: [...new Set(lists)],
    pages: [...new Set(allTypes.map((t) => t.key).filter((key) => !excluded.has(key)))],
  };
}
