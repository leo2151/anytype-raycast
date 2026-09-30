import { useCachedPromise } from "@raycast/utils";
import { useMemo } from "react";
import { getSpaces } from "../api";
import { apiLimit } from "../utils";
import { getCacheNamespace } from "../utils/cacheScope";
import { collectPages } from "../utils/pagination";

export function useSpaces(searchText?: string, config?: { all?: boolean }) {
  const { data, error, isLoading, mutate, pagination } = useCachedPromise(
    (_cacheScope: string, searchText: string | undefined, all: boolean) => async (options: { page: number }) => {
      if (all) {
        const spaces = await collectPages(async (offset, limit) => {
          const result = await getSpaces({ offset, limit, name: searchText });
          return { items: result.spaces, pagination: result.pagination };
        });
        return { data: spaces, hasMore: false };
      }
      const offset = options.page * apiLimit;
      const response = await getSpaces({ offset, limit: apiLimit, name: searchText });

      return {
        data: response.spaces,
        hasMore: response.pagination.has_more,
      };
    },
    [getCacheNamespace(), searchText, config?.all === true],
    {
      keepPreviousData: true,
    },
  );

  // filter empty data to prevent flickering at the bottom
  const filteredData = useMemo(() => data?.filter((space) => space) || [], [data]);

  return {
    spaces: filteredData,
    spacesError: error,
    isLoadingSpaces: isLoading,
    mutateSpaces: mutate,
    spacesPagination: pagination,
  };
}
