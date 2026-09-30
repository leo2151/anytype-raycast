import { useCachedPromise } from "@raycast/utils";
import { useMemo } from "react";
import { getObjects } from "../api";
import { apiLimit } from "../utils";
import { getCacheNamespace } from "../utils/cacheScope";

export function useObjects(spaceId: string, searchText?: string) {
  const { data, error, isLoading, mutate, pagination } = useCachedPromise(
    (_cacheScope: string, spaceId: string, searchText?: string) => async (options: { page: number }) => {
      const offset = options.page * apiLimit;
      const response = await getObjects(spaceId, { offset, limit: apiLimit, name: searchText });

      return {
        data: response.objects,
        hasMore: response.pagination.has_more,
      };
    },
    [getCacheNamespace(), spaceId, searchText],
    {
      keepPreviousData: true,
      execute: !!spaceId,
    },
  );

  // filter empty data to prevent flickering at the bottom
  const filteredData = useMemo(() => data?.filter((object) => object) || [], [data]);

  return {
    objects: filteredData,
    objectsError: error,
    isLoadingObjects: isLoading,
    mutateObjects: mutate,
    objectsPagination: pagination,
  };
}
