import { globalSearchRaw as globalSearch } from "../api";
import { SortDirection, SortOptions, SortProperty } from "../models";
import { pageOptions } from "../utils/pagination";

type Input = {
  /** Starting offset, default 0. Use next_offset to continue. */
  offset?: number;
  /** Page size between 1 and 1000, default 50. */
  limit?: number;
  /**
   * The plain-text search query. Global search may also match indexed content.
   * Note: Only plain text is supported; operators are not allowed.
   */
  query: string;

  /**
   * The types of objects to search for, identified by their type_key or id.
   * This value can be obtained from the `getTypes` tool.
   * When user asks for 'list' objects, search for 'set' and 'collection' types.
   * If no types are specified, the search will include all types of objects.
   */
  types?: string[];

  /**
   * Optional sorting options for the search results
   * (e.g., sorting direction and field).
   */
  sort?: {
    /**
     * The sorting direction for the search results.
     * This value can be either "asc" (ascending) or "desc" (descending).
     * Default value is "desc".
     */
    direction?: SortDirection;

    /**
     * The sorting field for the search results.
     * This value can be "last_modified_date", "last_opened_date", "created_date" or "name".
     * Default value is "last_modified_date".
     */
    propertyKey?: SortProperty;
  };
};

/**
 * Perform a global search for objects across all spaces.
 * This function queries all available spaces and returns a list of objects
 * that match the search criteria.
 * For empty search query and sort criterion, most recently modified objects are returned.
 */
export default async function tool({ query, types, sort, offset, limit }: Input) {
  types = types ?? [];
  const sortOptions: SortOptions = {
    property_key: sort?.propertyKey ?? SortProperty.LastModifiedDate,
    direction: sort?.direction ?? SortDirection.Descending,
  };

  const { data, pagination, all_stores_loaded } = await globalSearch(
    { query, types, sort: sortOptions },
    pageOptions(offset, limit),
  );
  const results = data.map(({ object, name, id, type, space_id, snippet }) => ({
    object,
    name,
    id,
    type: {
      name: type?.name,
      id: type?.id,
      type_key: type?.key,
    },
    space_id,
    snippet,
  }));

  return {
    results,
    pagination,
    next_offset: pagination.has_more ? pagination.offset + data.length : null,
    all_stores_loaded,
    complete: !pagination.has_more && all_stores_loaded !== false,
  };
}
