import { mapObjects } from "../../mappers/objects";
import { PaginatedResponse, RawSpaceObject, SearchRequest, SpaceObject } from "../../models";
import { apiEndpoints, apiFetch } from "../../utils";

export async function search(
  spaceId: string,
  request: SearchRequest,
  options: { offset: number; limit: number; signal?: AbortSignal },
): Promise<PaginatedResponse<SpaceObject>> {
  const { url, method } = apiEndpoints.search(spaceId, options);
  const response = await apiFetch<PaginatedResponse<RawSpaceObject>>(url, {
    method: method,
    body: JSON.stringify(request),
    signal: options.signal,
    retry: true,
  });

  return {
    data: response.payload.data ? await mapObjects(response.payload.data) : [],
    pagination: response.payload.pagination,
    all_stores_loaded: response.payload.all_stores_loaded,
  };
}

export async function searchRaw(
  spaceId: string,
  request: SearchRequest,
  options: { offset: number; limit: number; signal?: AbortSignal },
): Promise<PaginatedResponse<RawSpaceObject>> {
  const { url, method } = apiEndpoints.search(spaceId, options);
  const response = await apiFetch<PaginatedResponse<RawSpaceObject>>(url, {
    method: method,
    body: JSON.stringify(request),
    signal: options.signal,
    retry: true,
  });

  return response.payload;
}
