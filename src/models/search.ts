export enum SortDirection {
  Ascending = "asc",
  Descending = "desc",
}

export enum SortProperty {
  CreatedDate = "created_date",
  LastModifiedDate = "last_modified_date",
  LastOpenedDate = "last_opened_date",
  Name = "name",
}

export interface SearchRequest {
  query: string;
  types: string[];
  sort?: SortOptions;
  filters?: SearchFilters;
}

export interface SortOptions {
  property_key: SortProperty;
  direction: SortDirection;
}

export interface SearchFilters {
  operator: "and" | "or";
  conditions?: (
    | { property_key: string; condition: "eq"; checkbox: boolean }
    | { property_key: string; condition: "gte"; date: string }
  )[];
  filters?: SearchFilters[];
}
