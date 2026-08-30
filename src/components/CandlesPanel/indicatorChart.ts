import type {
  HistogramData,
  ISeriesApi,
  LineData,
  UTCTimestamp,
} from "lightweight-charts";
import type { IndicatorConfig, IndicatorPoint } from "../../api/indicators";

export const INDICATOR_PAGE_SIZE = 4000;

export function yieldFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function pointsToValueMap(points: IndicatorPoint[]): Map<number, Record<string, number>> {
  const map = new Map<number, Record<string, number>>();
  for (const pt of points) {
    map.set(pt.timeSec, pt.values);
  }
  return map;
}

export function applyIndicatorPointsToSeries(
  ind: IndicatorConfig,
  seriesList: ISeriesApi<"Line" | "Histogram">[],
  points: IndicatorPoint[],
): void {
  if (seriesList.length === 0 || points.length === 0) return;

  if (ind.type === 5) {
    const upperData: LineData<UTCTimestamp>[] = [];
    const middleData: LineData<UTCTimestamp>[] = [];
    const lowerData: LineData<UTCTimestamp>[] = [];

    for (const pt of points) {
      const t = pt.timeSec as UTCTimestamp;
      if (pt.values.upper !== undefined) upperData.push({ time: t, value: pt.values.upper });
      if (pt.values.middle !== undefined) middleData.push({ time: t, value: pt.values.middle });
      if (pt.values.lower !== undefined) lowerData.push({ time: t, value: pt.values.lower });
    }

    if (seriesList[0]) seriesList[0].setData(upperData);
    if (seriesList[1]) seriesList[1].setData(middleData);
    if (seriesList[2]) seriesList[2].setData(lowerData);
    return;
  }

  if (ind.type === 4) {
    const macdData: LineData<UTCTimestamp>[] = [];
    const signalData: LineData<UTCTimestamp>[] = [];
    const histData: HistogramData<UTCTimestamp>[] = [];

    for (const pt of points) {
      const t = pt.timeSec as UTCTimestamp;
      if (pt.values.value !== undefined) macdData.push({ time: t, value: pt.values.value });
      if (pt.values.signal !== undefined) signalData.push({ time: t, value: pt.values.signal });
      if (pt.values.hist !== undefined) {
        const val = pt.values.hist;
        histData.push({
          time: t,
          value: val,
          color: val >= 0 ? "rgba(61, 186, 122, 0.6)" : "rgba(224, 112, 112, 0.6)",
        });
      }
    }

    if (seriesList[0]) seriesList[0].setData(macdData);
    if (seriesList[1]) seriesList[1].setData(signalData);
    if (seriesList[2]) seriesList[2].setData(histData);
    return;
  }

  const lineData: LineData<UTCTimestamp>[] = [];
  for (const pt of points) {
    const val = pt.values.value;
    if (val !== undefined) {
      lineData.push({ time: pt.timeSec as UTCTimestamp, value: val });
    }
  }
  if (seriesList[0]) seriesList[0].setData(lineData);
}
