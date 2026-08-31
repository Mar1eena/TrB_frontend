import {
  computeForInstrument,
  listIndicatorValues,
  type IndicatorConfig,
  type IndicatorPoint,
} from "../../api/indicators";
import { intervalMeta, type CandleBar } from "../../api/tinvest/candles";
import { HISTORY_FROM_SEC } from "./viewportStore";
import {
  applyIndicatorPointsToSeries,
  INDICATOR_PAGE_SIZE,
  pointsToValueMap,
  yieldFrame,
} from "./indicatorChart";
import type { ISeriesApi } from "lightweight-charts";

export function indicatorPersistKey(
  uid: string,
  interval: number,
  ind: IndicatorConfig,
): string {
  return `${uid}:${interval}:${ind.type}:${JSON.stringify(ind.params)}`;
}

export type IndicatorTimeRange = {
  fromSec: number;
  toSec: number;
};

export function rangeFromBars(bars: CandleBar[]): { from: Date; to: Date } | null {
  if (bars.length === 0) return null;
  return {
    from: new Date((bars[0].time as number) * 1000),
    to: new Date((bars[bars.length - 1].time as number) * 1000),
  };
}

export function rangeFromBarsSec(bars: CandleBar[]): IndicatorTimeRange | null {
  if (bars.length === 0) return null;
  return {
    fromSec: bars[0].time as number,
    toSec: bars[bars.length - 1].time as number,
  };
}

export function rangeFromDates(from: Date, to: Date): IndicatorTimeRange {
  return {
    fromSec: Math.floor(from.getTime() / 1000),
    toSec: Math.floor(to.getTime() / 1000),
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

export function valueMapToPoints(
  valueMap: Map<number, Record<string, number>>,
): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  const times = [...valueMap.keys()].sort((a, b) => a - b);
  for (const timeSec of times) {
    const values = valueMap.get(timeSec);
    if (values) points.push({ timeSec, time: "", values });
  }
  return points;
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

export async function persistIndicatorFullSeries(params: {
  uid: string;
  interval: number;
  ind: IndicatorConfig;
  from: Date;
  to: Date;
}): Promise<number> {
  const range = padRangeForIndicator({ from: params.from, to: params.to }, params.interval, params.ind);
  const res = await computeForInstrument({
    uid: params.uid,
    interval: params.interval,
    from: range.from,
    to: range.to,
    type: params.ind.type,
    indicatorParams: params.ind.params,
    persist: true,
    maxResponsePoints: 0,
  });
  return res.totalPoints;
}

export async function loadIndicatorPagesFromClickHouse(params: {
  uid: string;
  interval: number;
  ind: IndicatorConfig;
  from: Date;
  to: Date;
  seriesList: ISeriesApi<"Line" | "Histogram">[];
  isStale: () => boolean;
  applyEachPage?: boolean;
  onPage: (points: IndicatorPoint[], valueMap: Map<number, Record<string, number>>) => void;
}): Promise<{ points: IndicatorPoint[]; valueMap: Map<number, Record<string, number>> }> {
  const accumulated: IndicatorPoint[] = [];
  const valueMap = new Map<number, Record<string, number>>();
  let after: Date | undefined;

  while (true) {
    if (params.isStale()) {
      return { points: accumulated, valueMap };
    }

    const page = await listIndicatorValues({
      uid: params.uid,
      interval: params.interval,
      from: params.from,
      to: params.to,
      type: params.ind.type,
      indicatorParams: params.ind.params,
      limit: INDICATOR_PAGE_SIZE,
      after,
    });

    if (params.isStale()) {
      return { points: accumulated, valueMap };
    }

    for (const pt of page.points) {
      valueMap.set(pt.timeSec, pt.values);
      accumulated.push(pt);
    }

    if (params.applyEachPage !== false) {
      applyIndicatorPointsToSeries(params.ind, params.seriesList, accumulated);
    }
    params.onPage(accumulated, valueMap);

    if (!page.hasMore || page.points.length === 0) break;

    after = new Date(page.points[page.points.length - 1].timeSec * 1000);
    await yieldFrame();
  }

  return { points: accumulated, valueMap };
}

export async function computeIndicatorForDisplay(params: {
  uid: string;
  interval: number;
  ind: IndicatorConfig;
  from: Date;
  to: Date;
}): Promise<IndicatorPoint[]> {
  const range = padRangeForIndicator({ from: params.from, to: params.to }, params.interval, params.ind);
  const res = await computeForInstrument({
    uid: params.uid,
    interval: params.interval,
    from: range.from,
    to: range.to,
    type: params.ind.type,
    indicatorParams: params.ind.params,
    persist: false,
    maxResponsePoints: 50_000,
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
