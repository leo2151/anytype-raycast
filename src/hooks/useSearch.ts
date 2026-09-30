import { getPreferenceValues } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useRef } from "react";
import { search } from "../api";
import { SortDirection } from "../models";
import { apiLimit } from "../utils";
import { getCacheNamespace } from "../utils/cacheScope";

export function useSearch(spaceId: string, query: string, types: string[], config?: { execute?: boolean }) {
  const abortable = useRef<AbortController | null>(null);
  const { data, error, isLoading, mutate, pagination } = useCachedPromise(
    (_cacheScope: string, spaceId: string, query: string, types: string[]) => async (options: { page: number }) => {
      const offset = options.page * apiLimit;
      const sortPreference = getPreferenceValues().sort;
      const sortDirection = sortPreference === "name" ? SortDirection.Ascending : SortDirection.Descending;

      const response = await search(
        spaceId,
        { query, types, sort: { property_key: sortPreference, direction: sortDirection } },
        { offset, limit: apiLimit, signal: abortable.current?.signal },
      );

      return {
        data: response.data,
        hasMore: response.pagination.has_more,
      };
    },
    [getCacheNamespace(), spaceId, query, types],
    {
      keepPreviousData: true,
      abortable,
      execute: !!spaceId && config?.execute !== false,
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
