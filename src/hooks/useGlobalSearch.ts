import { getPreferenceValues } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useRef, useState } from "react";
import { globalSearch } from "../api";
import { SearchFilters, SortDirection } from "../models";
import { apiLimit } from "../utils";
import { getCacheNamespace } from "../utils/cacheScope";

export function useGlobalSearch(
  query: string,
  types: string[],
  config?: { execute?: boolean; filters?: SearchFilters },
) {
  const abortable = useRef<AbortController | null>(null);
  const [allStoresLoaded, setAllStoresLoaded] = useState<boolean | undefined>();
  const shouldExecute = config?.execute !== false;
  const { data, error, isLoading, mutate, pagination } = useCachedPromise(
    (_cacheScope: string, query: string, types: string[], shouldExecute: boolean, filters?: SearchFilters) =>
      async (options: { page: number }) => {
        if (!shouldExecute) {
          return {
            data: [],
            hasMore: false,
          };
        }

        const offset = options.page * apiLimit;
        const sortPreference = getPreferenceValues().sort;
        const sortDirection = sortPreference === "name" ? SortDirection.Ascending : SortDirection.Descending;

        const response = await globalSearch(
          { query, types, filters, sort: { property_key: sortPreference, direction: sortDirection } },
          { offset, limit: apiLimit, signal: abortable.current?.signal },
        );

        if (!abortable.current?.signal.aborted) setAllStoresLoaded(response.all_stores_loaded);
        return {
          data: response.data,
          hasMore: response.pagination.has_more,
        };
      },
    [getCacheNamespace(), query, types, shouldExecute, config?.filters],
    {
      keepPreviousData: true,
      abortable,
    },
  );

  // filter empty data to prevent flickering at the bottom
  const filteredData = useMemo(() => data?.filter((object) => object) || [], [data]);

  return {
    allStoresLoaded,
    objects: filteredData,
    objectsError: error,
    isLoadingObjects: isLoading,
    mutateObjects: mutate,
    objectsPagination: pagination,
  };
}
