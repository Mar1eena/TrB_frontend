import { formatDateTime, type LastDownload } from "../../api/historicCandle";
import { intervalMeta } from "../../api/tinvest/candles";

export type DownloadCoverage = {
  startSec: number;
  endSec: number;
};

export function downloadCoverageFrom(row: LastDownload | null): DownloadCoverage | null {
  if (!row?.has_download) return null;
  const startSec = Date.parse(row.last_start) / 1000;
  const endSec = Date.parse(row.last_end) / 1000;
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec < startSec) return null;
  return { startSec, endSec };
}

function sessionBreakSec(stepSec: number): number {
  if (stepSec <= 60) return 6 * 3600;
  if (stepSec <= 3600) return 36 * 3600;
  return 5 * 86400;
}

export function coverageIncomplete(
  times: number[],
  interval: number,
  download: DownloadCoverage | null,
): boolean {
  if (!download) return true;
  if (times.length === 0) return true;
  const now = Date.now() / 1000;
  const step = intervalMeta(interval).seconds;
  if (download.endSec < now - Math.max(15 * 60, step * 3)) return true;
  const breakSec = sessionBreakSec(step);
  for (let i = 0; i < times.length - 1; i++) {
    const dt = (times[i + 1] as number) - (times[i] as number);
    if (dt > step * 1.5 && dt < breakSec) return true;
  }
  const first = times[0] as number;
  const last = times[times.length - 1] as number;
  if (first > download.startSec + step * 2) return true;
  if (last < download.endSec - step * 2 && last < now - step * 2) return true;
  return false;
}

export function coverageStatus(
  row: LastDownload | null,
  times: number[],
  interval: number,
  download: DownloadCoverage | null,
): { text: string; incomplete: boolean } {
  if (!row) {
    return { text: "Нет записи в истории загрузок", incomplete: true };
  }
  const span = `${formatDateTime(row.last_start)} — ${formatDateTime(row.last_end)}`;
  const incomplete = coverageIncomplete(times, interval, download);
  return {
    text: incomplete ? `Покрытие неполное: ${span}` : `Покрытие: ${span}`,
    incomplete,
  };
}
