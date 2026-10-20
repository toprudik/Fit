/**
 * PostgREST returns at most 1000 rows per request (max_rows) and cuts the rest off silently, and a long
 * `.in()` list makes a URL the gateway refuses. These read a whole result page by page and split id lists.
 */
export const PAGE_SIZE = 1000;
export const ID_CHUNK = 100;

type Result<T> = PromiseLike<{ data: T[] | null; error: { code?: string } | null }>;
type Read<T> = { data: T[]; error: null } | { data: null; error: { code?: string } };

/** Every row of a query: `page(from, to)` must apply `.range(from, to)` to a query with a stable order. */
export async function readAllPages<T>(page: (from: number, to: number) => Result<T>): Promise<Read<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return { data: rows, error: null };
  }
}

/** Rows for every id, `ID_CHUNK` ids per request; duplicates are asked once. */
export async function readByIds<T>(ids: readonly string[], read: (chunk: string[]) => Result<T>): Promise<Read<T>> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let index = 0; index < unique.length; index += ID_CHUNK) {
    const { data, error } = await read(unique.slice(index, index + ID_CHUNK));
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
  }
  return { data: rows, error: null };
}
