import { useCachedPromise } from "@raycast/utils";
import { getProperty } from "../api";
import { getCacheNamespace } from "../utils/cacheScope";

export function useProperty(spaceId: string, propertyId: string) {
  const { data, error, isLoading, mutate } = useCachedPromise(
    async (_cacheScope: string, spaceId: string, propertyId: string) => {
      const response = await getProperty(spaceId, propertyId);
      return response.property;
    },
    [getCacheNamespace(), spaceId, propertyId],
    {
      keepPreviousData: true,
      execute: !!spaceId && !!propertyId,
    },
  );

  return {
    property: data,
    propertyError: error,
    isLoadingProperty: isLoading,
    mutateProperty: mutate,
  };
}
