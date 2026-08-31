import {
  computeForInstrument,
  type IndicatorConfig,
  type IndicatorPoint,
} from "../../api/indicators";
import {
  intervalMeta,
  PAGE_CANDLES,
  type CandleBar,
} from "../../api/tinvest/candles";
import { HISTORY_FROM_SEC } from "./viewportStore";
import { applyIndicatorPointsToSeries, pointsToValueMap } from "./indicatorChart";
import type { ISeriesApi } from "lightweight-charts";

export type IndicatorTimeRange = {
  fromSec: number;
  toSec: number;
};

export function rangeFromBarsSec(bars: CandleBar[]): IndicatorTimeRange | null {
  if (bars.length === 0) return null;
  return {
    fromSec: bars[0].time as number,
    toSec: bars[bars.length - 1].time as number,
  };
}

/** Точки индикатора только для свечей, уже загруженных на график. */
export function pointsForBars(
  valueMap: Map<number, Record<string, number>>,
  bars: CandleBar[],
): IndicatorPoint[] {
  if (valueMap.size === 0 || bars.length === 0) return [];
  const points: IndicatorPoint[] = [];
  for (const bar of bars) {
    const timeSec = bar.time as number;
    const values = valueMap.get(timeSec);
    if (values) points.push({ timeSec, time: "", values });
  }
  return points;
}

export function indicatorComputeSig(ind: IndicatorConfig): string {
  return `${ind.type}:${ind.persist}:${JSON.stringify(ind.params)}`;
}

/** Куски [want], которых ещё нет в уже загруженном диапазоне. */
export function missingIndicatorRanges(
  loaded: IndicatorTimeRange | undefined,
  want: IndicatorTimeRange,
): IndicatorTimeRange[] {
  if (!loaded) return [want];
  if (want.toSec < loaded.fromSec || want.fromSec > loaded.toSec) {
    return [want];
  }
  const gaps: IndicatorTimeRange[] = [];
  if (want.fromSec < loaded.fromSec) {
    gaps.push({ fromSec: want.fromSec, toSec: loaded.fromSec - 1 });
  }
  if (want.toSec > loaded.toSec) {
    gaps.push({ fromSec: loaded.toSec + 1, toSec: want.toSec });
  }
  return gaps.filter((gap) => gap.toSec >= gap.fromSec);
}

export function unionIndicatorRanges(
  a: IndicatorTimeRange,
  b: IndicatorTimeRange,
): IndicatorTimeRange {
  return {
    fromSec: Math.min(a.fromSec, b.fromSec),
    toSec: Math.max(a.toSec, b.toSec),
  };
}

export function rangeToDates(range: IndicatorTimeRange): { from: Date; to: Date } {
  return {
    from: new Date(range.fromSec * 1000),
    to: new Date(range.toSec * 1000),
  };
}

function maxResponsePointsForRange(from: Date, to: Date, interval: number): number {
  const step = Math.max(intervalMeta(interval).seconds, 1);
  const spanSec = Math.max(0, Math.floor(to.getTime() / 1000) - Math.floor(from.getTime() / 1000));
  const n = Math.ceil(spanSec / step) + 64;
  return Math.min(50_000, Math.max(PAGE_CANDLES, n));
}

/** Сколько баров TA-Lib съедает на прогреве (NaN в начале ряда). */
export function indicatorWarmupBars(ind: IndicatorConfig): number {
  const period = Number(ind.params.period);
  const slow = Number(ind.params.slowperiod);
  const signal = Number(ind.params.signalperiod);
  const fromParams = [period, slow, Number.isFinite(slow) && Number.isFinite(signal) ? slow + signal : 0].filter(
    (n) => Number.isFinite(n) && n > 0,
  );
  const byType = ind.type === 1 ? 14 : ind.type === 4 ? 26 : 20;
  return Math.max(byType, ...fromParams, 1);
}

/**
 * Расширяет from назад: иначе бэкенд режет ответ по видимому окну,
 * а первые period баров BB/SMA/EMA — NaN.
 */
export function padRangeForIndicator(
  range: { from: Date; to: Date },
  interval: number,
  ind: IndicatorConfig,
): { from: Date; to: Date } {
  const barSec = intervalMeta(interval).seconds;
  const warmup = indicatorWarmupBars(ind) * 8;
  const sessionGapSec = barSec <= 60 ? 3 * 86400 : barSec <= 3600 ? 7 * 86400 : 0;
  const padMs = (warmup * barSec + sessionGapSec) * 1000;
  const minFrom = HISTORY_FROM_SEC * 1000;
  return {
    from: new Date(Math.max(minFrom, range.from.getTime() - padMs)),
    to: range.to,
  };
}

/**
 * Один RPC: сервер отдаёт значения, если они уже есть, иначе досчитывает
 * недостающее и только потом отвечает.
 */
export async function computeIndicatorForDisplay(params: {
  uid: string;
  interval: number;
  ind: IndicatorConfig;
  from: Date;
  to: Date;
  /** Прогрев только на первый запрос: у стыка с уже загруженным рядом lookback делает бэкенд. */
  padWarmup?: boolean;
}): Promise<IndicatorPoint[]> {
  const needPad = params.padWarmup !== false && !params.ind.persist;
  const range = needPad
    ? padRangeForIndicator({ from: params.from, to: params.to }, params.interval, params.ind)
    : { from: params.from, to: params.to };
  const res = await computeForInstrument({
    uid: params.uid,
    interval: params.interval,
    from: range.from,
    to: range.to,
    type: params.ind.type,
    indicatorParams: params.ind.params,
    persist: params.ind.persist,
    maxResponsePoints: maxResponsePointsForRange(range.from, range.to, params.interval),
  });
  return res.points;
}

export function applyIndicatorToSeries(
  ind: IndicatorConfig,
  seriesList: ISeriesApi<"Line" | "Histogram">[],
  points: IndicatorPoint[],
): Map<number, Record<string, number>> {
  const valueMap = pointsToValueMap(points);
  applyIndicatorPointsToSeries(ind, seriesList, points);
  return valueMap;
}
