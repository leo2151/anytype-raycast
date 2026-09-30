import { MutatePromise, useCachedPromise } from "@raycast/utils";
import { getObject } from "../api";
import { BodyFormat, Member, Property, SpaceObject, Type } from "../models";
import { errorConnectionMessage, ErrorWithStatus, getPinned, removePinned } from "../utils";
import { getCacheNamespace } from "../utils/cacheScope";

export function usePinnedObjects(key: string, config?: { execute?: boolean }) {
  const { data, error, isLoading, mutate } = useCachedPromise(
    async (_cacheScope: string, key) => {
      const pinnedObjects = await getPinned(key);
      const objects: SpaceObject[] = [];

      for (const pinned of pinnedObjects) {
        try {
          const response = await getObject(pinned.spaceId, pinned.objectId, BodyFormat.Markdown);
          if (response.object.archived) {
            await removePinned(pinned.spaceId, pinned.objectId, key);
          } else {
            objects.push(response.object);
          }
        } catch (error) {
          const typedError = error as ErrorWithStatus;
          if (typedError.message === errorConnectionMessage) {
            throw error;
          } else if (typedError.status === 404 || typedError.status === 410) {
            await removePinned(pinned.spaceId, pinned.objectId, key);
          }
        }
      }

      return objects;
    },
    [getCacheNamespace(), key],
    {
      keepPreviousData: true,
      execute: config?.execute !== false,
    },
  );

  return {
    pinnedObjects: data as SpaceObject[],
    pinnedObjectsError: error,
    isLoadingPinnedObjects: isLoading,
    mutatePinnedObjects: mutate as MutatePromise<SpaceObject[] | Type[] | Property[] | Member[]>,
  };
}
