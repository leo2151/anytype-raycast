export interface Pagination {
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface PaginatedResponse<T> {
  all_stores_loaded?: boolean;
  data: T[];
  pagination: Pagination;
}
