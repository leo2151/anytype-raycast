import { Pagination } from "../models/pagination";

export async function collectPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; pagination: Pagination }>,
  limit = 1000,
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  for (let page = 0; page < 1000; page++) {
    const result = await fetchPage(offset, limit);
    items.push(...result.items);
    if (!result.pagination.has_more) return items;
    if (!result.items.length) throw new Error("The API returned an empty page with has_more=true. Please retry.");
    offset += result.items.length;
  }
  throw new Error("Too many pages. Narrow the query and retry.");
}
export function pageOptions(offset = 0, limit = 50) {
  if (!Number.isInteger(offset) || offset < 0) throw new Error("offset must be a non-negative integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("limit must be between 1 and 1000");
  return { offset, limit };
}
export async function mapConcurrent<T, R>(items: T[], mapper: (item: T) => Promise<R>, concurrency = 4): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        result[i] = await mapper(items[i]);
      }
    }),
  );
  return result;
}
