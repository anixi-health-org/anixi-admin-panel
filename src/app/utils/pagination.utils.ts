export function paginateItems<T>(items: T[], pageIndex: number, pageSize: number): T[] {
  const safePage = Math.max(1, pageIndex);
  const safeSize = Math.max(1, pageSize);
  const start = (safePage - 1) * safeSize;
  return items.slice(start, start + safeSize);
}

export function getTotalPages(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / Math.max(1, pageSize));
}

export function clampPageIndex(pageIndex: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, pageIndex), getTotalPages(total, pageSize));
}

export function getPageRangeStart(pageIndex: number, pageSize: number, total: number): number {
  if (total === 0) return 0;
  return (Math.max(1, pageIndex) - 1) * Math.max(1, pageSize) + 1;
}

export function getPageRangeEnd(pageIndex: number, pageSize: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(total, Math.max(1, pageIndex) * Math.max(1, pageSize));
}
