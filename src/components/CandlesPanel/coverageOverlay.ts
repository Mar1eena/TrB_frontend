import { intervalMeta } from "../../api/tinvest/candles";

function formatSec(sec: number): string {
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1971) return "—";
  return d.toLocaleString("ru-RU");
}

function sessionBreakSec(stepSec: number): number {
  if (stepSec <= 60) return 6 * 3600;
  if (stepSec <= 3600) return 36 * 3600;
  return 5 * 86400;
}

export function coverageIncomplete(times: number[], interval: number): boolean {
  if (times.length === 0) return true;
  const now = Date.now() / 1000;
  const step = intervalMeta(interval).seconds;
  const last = times[times.length - 1] as number;
  if (last < now - Math.max(15 * 60, step * 3)) return true;
  const breakSec = sessionBreakSec(step);
  for (let i = 0; i < times.length - 1; i++) {
    const dt = (times[i + 1] as number) - (times[i] as number);
    if (dt > step * 1.5 && dt < breakSec) return true;
  }
  return false;
}

export function coverageStatus(
  times: number[],
  interval: number,
): { text: string; incomplete: boolean } {
  if (times.length === 0) {
    return { text: "Нет загруженных свечей", incomplete: true };
  }
  const span = `${formatSec(times[0])} — ${formatSec(times[times.length - 1])}`;
  const incomplete = coverageIncomplete(times, interval);
  return {
    text: incomplete ? `Покрытие неполное: ${span}` : `Покрытие: ${span}`,
    incomplete,
  };
}
