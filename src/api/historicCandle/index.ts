import { CANDLE_INTERVALS, formatDate } from "../scheduler";
import { listLastDownloads } from "../data";

export type LastDownload = {
  uid: string;
  figi: string;
  ticker: string;
  name: string;
  interval: number | null;
  last_start: string;
  last_end: string;
  has_download: number | boolean;
};

export async function fetchLastDownloads(
  q = "",
  limit = 500,
): Promise<LastDownload[]> {
  return listLastDownloads(q, limit);
}

export function intervalLabel(value: number | null | undefined): string {
  if (value == null || value <= 0) {
    return "—";
  }
  return CANDLE_INTERVALS.find((iv) => iv.value === value)?.label ?? String(value);
}

export function formatDateTime(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1971) return "—";
  return d.toLocaleString("ru-RU");
}

export { formatDate };
