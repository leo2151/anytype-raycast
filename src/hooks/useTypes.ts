import { useCachedPromise } from "@raycast/utils";
import { useMemo } from "react";
import { getTypes } from "../api";
import { apiLimit } from "../utils";
import { getCacheNamespace } from "../utils/cacheScope";

export function useTypes(spaceId: string, searchText?: string, config?: { execute?: boolean }) {
  const { data, error, isLoading, mutate, pagination } = useCachedPromise(
    (_cacheScope: string, spaceId: string, searchText?: string) => async (options: { page: number }) => {
      const offset = options.page * apiLimit;
      const response = await getTypes(spaceId, { offset, limit: apiLimit, name: searchText });

      return {
        data: response.types,
        hasMore: response.pagination.has_more,
      };
    },
    [getCacheNamespace(), spaceId, searchText],
    {
      keepPreviousData: true,
      execute: !!spaceId && config?.execute !== false,
    },
  );

  // filter empty data to prevent flickering at the bottom
  const filteredData = useMemo(() => data?.filter((type) => type) || [], [data]);

  return {
    types: filteredData,
    typesError: error,
    isLoadingTypes: isLoading,
    mutateTypes: mutate,
    typesPagination: pagination,
  };
}
