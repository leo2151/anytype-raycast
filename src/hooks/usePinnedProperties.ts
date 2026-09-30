import { useCachedPromise } from "@raycast/utils";
import { getProperty } from "../api";
import { Property } from "../models";
import { errorConnectionMessage, ErrorWithStatus, getPinned, removePinned } from "../utils";
import { getCacheNamespace } from "../utils/cacheScope";

export function usePinnedProperties(key: string, config?: { execute?: boolean }) {
  const { data, error, isLoading, mutate } = useCachedPromise(
    async (_cacheScope: string, key: string) => {
      const pinnedProperties = await getPinned(key);
      const properties: Property[] = [];

      for (const pinned of pinnedProperties) {
        try {
          const response = await getProperty(pinned.spaceId, pinned.objectId);
          // TODO: enable this when the API supports it
          // if (response.property?.archived) {
          //   await removePinned(pinned.spaceId, pinned.objectId, key);
          // } else {
          //   properties.push(response.property);
          // }
          properties.push(response.property);
        } catch (error) {
          const typedError = error as ErrorWithStatus;
          if (typedError.message === errorConnectionMessage) {
            throw error;
          } else if (typedError.status === 404 || typedError.status === 410) {
            await removePinned(pinned.spaceId, pinned.objectId, key);
          }
        }
      }

      return properties;
    },
    [getCacheNamespace(), key],
    {
      keepPreviousData: true,
      execute: config?.execute !== false,
    },
  );

  return {
    pinnedProperties: data,
    pinnedPropertiesError: error,
    isLoadingPinnedProperties: isLoading,
    mutatePinnedProperties: mutate,
  };
}
