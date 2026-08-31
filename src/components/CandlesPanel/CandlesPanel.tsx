import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { CANDLE_INTERVALS, INTERVAL_1DAY, INTERVAL_1MIN } from "../../api/scheduler";
import {
  fetchInstrumentLastDownload,
  type LastDownload,
} from "../../api/historicCandle";
import {
  type IndicatorConfig,
} from "../../api/indicators";
import { type CandleBar } from "../../api/tinvest/candles";
import InstrumentSelect, { type PickedInstrument } from "./InstrumentSelect";
import IndicatorsModal, { isOscillator } from "./IndicatorsModal";
import {
  applyIndicatorToSeries,
  computeIndicatorForDisplay,
  indicatorComputeSig,
  indicatorPersistKey,
  loadIndicatorPagesFromClickHouse,
  missingIndicatorRanges,
  persistIndicatorFullSeries,
  pointsForBars,
  rangeFromBars,
  rangeFromBarsSec,
  rangeFromDates,
  unionIndicatorRanges,
} from "./indicatorLoad";
import { CandleViewportStore, HISTORY_FROM_SEC } from "./viewportStore";
import {
  coverageStatus,
  downloadCoverageFrom,
  type DownloadCoverage,
} from "./coverageOverlay";
import "../SchedulerPanel/SchedulerPanel.css";
import "./CandlesPanel.css";

const LS_KEY = "trb.candles.panel.v2";
const LS_INDICATORS_KEY = "trb.candles.indicators.v1";
const UP = "#3dba7a";
const DOWN = "#e07070";
const VOL_UP = "rgba(61, 186, 122, 0.4)";
const VOL_DOWN = "rgba(224, 112, 112, 0.4)";

type SavedState = {
  instrument?: PickedInstrument | null;
  interval?: number;
};

function loadSaved(): { instrument: PickedInstrument | null; interval: number } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { instrument: null, interval: 1 };
    const parsed = JSON.parse(raw) as SavedState;
    const interval = CANDLE_INTERVALS.some((iv) => iv.value === parsed.interval)
      ? (parsed.interval as number)
      : 1;
    const item = parsed.instrument;
    if (!item?.uid || !item.ticker) return { instrument: null, interval };
    return {
      instrument: {
        uid: item.uid,
        ticker: item.ticker,
        name: item.name || item.ticker,
        figi: item.figi || "",
        classCode: item.classCode || "",
      },
      interval,
    };
  } catch {
    return { instrument: null, interval: 1 };
  }
}

function loadSavedIndicators(): IndicatorConfig[] {
  try {
    const raw = localStorage.getItem(LS_INDICATORS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as IndicatorConfig[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveState(instrument: PickedInstrument | null, interval: number) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ instrument, interval }));
  } catch {
    /* ignore */
  }
}

function saveIndicatorsState(indicators: IndicatorConfig[]) {
  try {
    localStorage.setItem(LS_INDICATORS_KEY, JSON.stringify(indicators));
  } catch {
    /* ignore */
  }
}

function toCandle(bar: CandleBar): CandlestickData<UTCTimestamp> {
  return {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

function toVolume(bar: CandleBar): HistogramData<UTCTimestamp> {
  return {
    time: bar.time,
    value: bar.volume,
    color: bar.close >= bar.open ? VOL_UP : VOL_DOWN,
  };
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatVolume(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("ru-RU");
}

function formatChartTime(time: Time): string {
  const sec = typeof time === "number" ? time : 0;
  return new Date(sec * 1000).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priceFormat(price: number): { type: "price"; precision: number; minMove: number } {
  if (!Number.isFinite(price) || price === 0) {
    return { type: "price", precision: 2, minMove: 0.01 };
  }
  if (price >= 100) return { type: "price", precision: 2, minMove: 0.01 };
  if (price >= 1) return { type: "price", precision: 4, minMove: 0.0001 };
  return { type: "price", precision: 6, minMove: 0.000001 };
}

function oscillatorScaleId(indicatorId: string): string {
  return `osc_${indicatorId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function applyOscillatorScale(chart: IChartApi, scaleId: string): void {
  // Custom price scale exists only after at least one series uses priceScaleId.
  chart.priceScale(scaleId).applyOptions({
    scaleMargins: { top: 0.76, bottom: 0.02 },
    borderVisible: true,
    borderColor: "rgba(200, 180, 230, 0.18)",
  });
}

function createIndicatorSeries(
  chart: IChartApi,
  ind: IndicatorConfig,
  scaleId: string,
): ISeriesApi<"Line" | "Histogram">[] {
  if (ind.type === 5) {
    const upper = chart.addSeries(LineSeries, {
      color: ind.color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceScaleId: scaleId,
    });
    const middle = chart.addSeries(LineSeries, {
      color: ind.color,
      lineWidth: (ind.lineWidth ?? 2) as 1 | 2 | 3 | 4,
      priceScaleId: scaleId,
    });
    const lower = chart.addSeries(LineSeries, {
      color: ind.color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceScaleId: scaleId,
    });
    return [upper, middle, lower];
  }

  if (ind.type === 4) {
    const macd = chart.addSeries(LineSeries, {
      color: ind.color,
      lineWidth: (ind.lineWidth ?? 2) as 1 | 2 | 3 | 4,
      priceScaleId: scaleId,
    });
    const signal = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceScaleId: scaleId,
    });
    const hist = chart.addSeries(HistogramSeries, {
      priceScaleId: scaleId,
    });
    return [macd, signal, hist];
  }

  const line = chart.addSeries(LineSeries, {
    color: ind.color,
    lineWidth: (ind.lineWidth ?? 2) as 1 | 2 | 3 | 4,
    priceScaleId: scaleId,
  });
  return [line];
}

function applyIndicatorAppearance(
  seriesList: ISeriesApi<"Line" | "Histogram">[],
  ind: IndicatorConfig,
  visible: boolean,
): void {
  const width = (ind.lineWidth ?? 2) as 1 | 2 | 3 | 4;
  if (ind.type === 5) {
    seriesList[0]?.applyOptions({ color: ind.color, lineWidth: 1, visible });
    seriesList[1]?.applyOptions({ color: ind.color, lineWidth: width, visible });
    seriesList[2]?.applyOptions({ color: ind.color, lineWidth: 1, visible });
    return;
  }
  if (ind.type === 4) {
    seriesList[0]?.applyOptions({ color: ind.color, lineWidth: width, visible });
    seriesList[1]?.applyOptions({ color: "#f59e0b", lineWidth: 1, visible });
    seriesList[2]?.applyOptions({ visible });
    return;
  }
  seriesList[0]?.applyOptions({ color: ind.color, lineWidth: width, visible });
}

function detachSeries(
  chart: IChartApi,
  seriesList: ISeriesApi<"Line" | "Histogram">[],
): void {
  for (const series of seriesList) {
    try {
      chart.removeSeries(series);
    } catch {
      /* already detached */
    }
  }
}

export default function CandlesPanel() {
  const saved = useRef(loadSaved()).current;
  const [instrument, setInstrument] = useState<PickedInstrument | null>(saved.instrument);
  const [interval, setInterval] = useState(saved.interval);
  const [indicators, setIndicators] = useState<IndicatorConfig[]>(loadSavedIndicators);
  const indicatorsRef = useRef(indicators);
  indicatorsRef.current = indicators;
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndicatorId, setEditIndicatorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hud, setHud] = useState<CandleBar | null>(null);
  const [indicatorHud, setIndicatorHud] = useState<Map<string, Record<string, number>>>(new Map());
  const [loadingIndicators, setLoadingIndicators] = useState<Set<string>>(() => new Set());
  const [coverInfo, setCoverInfo] = useState<{ text: string; incomplete: boolean } | null>(null);
  const hoverRef = useRef(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const storeRef = useRef<CandleViewportStore | null>(null);
  const timesRef = useRef<number[]>([]);
  const downloadRef = useRef<DownloadCoverage | null>(null);
  const downloadRowRef = useRef<LastDownload | null>(null);
  const intervalRef = useRef(interval);
  const paintCoverageRef = useRef<() => void>(() => {});
  intervalRef.current = interval;

  // Track lightweight-chart series for indicators
  const indSeriesMapRef = useRef<Map<string, ISeriesApi<any>[]>>(new Map());
  // Store point values for fast lookup by timestamp in crosshair move
  const indValuesMapRef = useRef<Map<string, Map<number, Record<string, number>>>>(new Map());
  const indicatorLoadGenRef = useRef<Map<string, number>>(new Map());
  const persistedKeysRef = useRef<Set<string>>(new Set());
  const persistInFlightRef = useRef<Set<string>>(new Set());
  const latestBarsRef = useRef<CandleBar[]>([]);
  const prevIndicatorsRef = useRef<IndicatorConfig[]>([]);
  const syncedComputeSigRef = useRef<Map<string, string>>(new Map());
  const indLoadedRangeRef = useRef<Map<string, { fromSec: number; toSec: number; sig: string }>>(
    new Map(),
  );
  const historyIndSyncTimerRef = useRef<number | null>(null);

  const bumpIndicatorLoadGen = (id: string): number => {
    const next = (indicatorLoadGenRef.current.get(id) ?? 0) + 1;
    indicatorLoadGenRef.current.set(id, next);
    return next;
  };

  const isIndicatorLoadStale = (id: string, gen: number): boolean =>
    indicatorLoadGenRef.current.get(id) !== gen;

  useEffect(() => {
    saveState(instrument, interval);
  }, [instrument, interval]);

  useEffect(() => {
    saveIndicatorsState(indicators);
  }, [indicators]);

  const resolveFullSeriesRange = useCallback(async (): Promise<{ from: Date; to: Date }> => {
    let fromSec = downloadRef.current?.startSec ?? HISTORY_FROM_SEC;
    const cov = downloadRef.current;
    if (cov) {
      return { from: new Date(fromSec * 1000), to: new Date(Math.max(cov.endSec * 1000, Date.now())) };
    }

    let row = downloadRowRef.current;
    if (!row && instrument) {
      row = await fetchInstrumentLastDownload(instrument.uid, interval);
      if (row) {
        downloadRowRef.current = row;
        downloadRef.current = downloadCoverageFrom(row);
      }
    }

    const coverage = downloadRef.current;
    if (coverage) {
      fromSec = coverage.startSec;
    }

    const from = new Date(fromSec * 1000);

    if (row?.last_end) {
      const to = new Date(row.last_end);
      if (!Number.isNaN(to.getTime())) {
        return { from, to: new Date(Math.max(to.getTime(), Date.now())) };
      }
    }

    const bars = latestBarsRef.current;
    if (bars.length > 0) {
      const last = (bars[bars.length - 1].time as number) * 1000;
      return { from, to: new Date(Math.max(last, Date.now())) };
    }

    return { from, to: new Date() };
  }, [instrument, interval]);

  const loadIndicatorFromClickHouse = useCallback(
    async (
      ind: IndicatorConfig,
      bars: CandleBar[],
      options?: { showLoading?: boolean; forceGap?: boolean; fullSeries?: boolean },
    ): Promise<void> => {
      if (!instrument || bars.length === 0) return;

      const barsRange = rangeFromBarsSec(bars);
      if (!barsRange) return;

      let queryRange = barsRange;
      if (options?.fullSeries) {
        const full = await resolveFullSeriesRange();
        queryRange = rangeFromDates(full.from, full.to);
      }

      const seriesList = indSeriesMapRef.current.get(ind.id) ?? [];
      if (seriesList.length === 0) return;

      const sig = indicatorComputeSig(ind);
      const loaded = indLoadedRangeRef.current.get(ind.id);
      const cacheValid = loaded?.sig === sig;
      const gaps =
        cacheValid && !options?.forceGap
          ? missingIndicatorRanges(loaded, queryRange)
          : [queryRange];

      const applyCached = () => {
        const map = indValuesMapRef.current.get(ind.id);
        if (map && map.size > 0) {
          applyIndicatorToSeries(ind, seriesList, pointsForBars(map, bars));
        }
      };

      if (gaps.length === 0) {
        applyCached();
        return;
      }

      const gen = bumpIndicatorLoadGen(ind.id);
      if (options?.showLoading !== false) {
        setLoadingIndicators((prev) => new Set(prev).add(ind.id));
      }

      const merged = new Map(
        cacheValid ? (indValuesMapRef.current.get(ind.id) ?? new Map()) : [],
      );

      try {
        for (const gap of gaps) {
          if (isIndicatorLoadStale(ind.id, gen)) return;
          const { valueMap } = await loadIndicatorPagesFromClickHouse({
            uid: instrument.uid,
            interval,
            ind,
            from: new Date(gap.fromSec * 1000),
            to: new Date(gap.toSec * 1000),
            seriesList,
            applyEachPage: false,
            isStale: () => isIndicatorLoadStale(ind.id, gen),
            onPage: (_points, pageMap) => {
              for (const [timeSec, values] of pageMap) {
                merged.set(timeSec, values);
              }
              indValuesMapRef.current.set(ind.id, merged);
              applyIndicatorToSeries(ind, seriesList, pointsForBars(merged, bars));
            },
          });
          if (isIndicatorLoadStale(ind.id, gen)) return;
          for (const [timeSec, values] of valueMap) {
            merged.set(timeSec, values);
          }
        }

        if (isIndicatorLoadStale(ind.id, gen)) return;

        indValuesMapRef.current.set(ind.id, merged);
        if (merged.size > 0) {
          applyIndicatorToSeries(ind, seriesList, pointsForBars(merged, bars));
        }

        if (merged.size === 0 && !ind.persist) {
          const displayRange = rangeFromBars(bars);
          if (!displayRange) return;
          const fallback = await computeIndicatorForDisplay({
            uid: instrument.uid,
            interval,
            ind,
            from: displayRange.from,
            to: displayRange.to,
          });
          if (isIndicatorLoadStale(ind.id, gen)) return;
          indValuesMapRef.current.set(
            ind.id,
            applyIndicatorToSeries(ind, seriesList, fallback),
          );
        }

        let nextRange = cacheValid && loaded ? loaded : queryRange;
        for (const gap of gaps) {
          nextRange = unionIndicatorRanges(nextRange, gap);
        }
        nextRange = unionIndicatorRanges(nextRange, queryRange);
        indLoadedRangeRef.current.set(ind.id, { ...nextRange, sig });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Indicator display load error:", ind.name, msg);
        setError(`Индикатор ${ind.name}: ${msg}`);
      } finally {
        if (!isIndicatorLoadStale(ind.id, gen)) {
          setLoadingIndicators((prev) => {
            const next = new Set(prev);
            next.delete(ind.id);
            return next;
          });
        }
      }
    },
    [instrument, interval, resolveFullSeriesRange],
  );

  const ensureIndicatorPersisted = useCallback(
    async (ind: IndicatorConfig, targetSec?: number): Promise<void> => {
      if (!instrument || !ind.persist) return;

      const key = `${instrument.uid}:${interval}:${ind.id}:${targetSec ?? "all"}:${JSON.stringify(ind.params)}`;
      if (persistedKeysRef.current.has(key) || persistInFlightRef.current.has(key)) return;

      persistInFlightRef.current.add(key);
      try {
        const fullRange = await resolveFullSeriesRange();
        await persistIndicatorFullSeries({
          uid: instrument.uid,
          interval,
          ind,
          from: fullRange.from,
          to: fullRange.to,
        });
        persistedKeysRef.current.add(key);
      } finally {
        persistInFlightRef.current.delete(key);
      }
    },
    [instrument, interval, resolveFullSeriesRange],
  );

  const syncIndicators = useCallback(
    async (
      bars: CandleBar[],
      onlyIds?: string[],
      options?: { persist?: boolean; showLoading?: boolean },
    ) => {
      if (!instrument || bars.length === 0) return;

      let activeList = indicators.filter((i) => i.visible);
      if (onlyIds?.length) {
        const idSet = new Set(onlyIds);
        activeList = activeList.filter((i) => idSet.has(i.id));
      }
      if (activeList.length === 0) {
        indValuesMapRef.current.clear();
        setIndicatorHud(new Map());
        setLoadingIndicators(new Set());
        return;
      }

      if (options?.showLoading !== false) {
        setLoadingIndicators(new Set(activeList.map((i) => i.id)));
      }

      const updateHudFromLastBar = () => {
        if (hoverRef.current || bars.length === 0) return;
        const lastSec = bars[bars.length - 1].time as number;
        const nextHud = new Map<string, Record<string, number>>();
        for (const ind of activeList) {
          const map = indValuesMapRef.current.get(ind.id);
          const vals = map?.get(lastSec);
          if (vals) nextHud.set(ind.id, vals);
        }
        setIndicatorHud(nextHud);
      };

      for (const ind of activeList) {
        const seriesList = indSeriesMapRef.current.get(ind.id) ?? [];
        if (seriesList.length === 0) {
          setLoadingIndicators((prev) => {
            const next = new Set(prev);
            next.delete(ind.id);
            return next;
          });
          continue;
        }

        try {
          if (ind.persist) {
            const persistKey = `${instrument.uid}:${interval}:${ind.id}:all:${JSON.stringify(ind.params)}`;
            const needsFullPersist =
              options?.persist !== false && !persistedKeysRef.current.has(persistKey);

            const sig = indicatorComputeSig(ind);
            const loadedMeta = indLoadedRangeRef.current.get(ind.id);
            const fullSeriesDates = await resolveFullSeriesRange();
            const fullRange = rangeFromDates(fullSeriesDates.from, fullSeriesDates.to);
            const fullSeriesLoaded =
              loadedMeta?.sig === sig &&
              loadedMeta.fromSec <= fullRange.fromSec + 3600 &&
              loadedMeta.toSec >= fullRange.toSec - 3600;

            await loadIndicatorFromClickHouse(ind, bars, {
              showLoading: options?.showLoading,
              fullSeries: !fullSeriesLoaded,
            });

            const map = indValuesMapRef.current.get(ind.id);
            const lastBar = bars[bars.length - 1];
            const lastBarSec = lastBar ? (lastBar.time as number) : 0;
            let maxLoadedSec = 0;
            if (map && map.size > 0) {
              for (const t of map.keys()) {
                if (t > maxLoadedSec) maxLoadedSec = t;
              }
            }

            const hasTailGap = lastBarSec > 0 && maxLoadedSec < lastBarSec;

            // Быстрый preview по видимому окну, пока идёт persist/полная загрузка.
            if ((!map || map.size === 0) && bars.length > 0) {
              const displayRange = rangeFromBars(bars);
              if (displayRange) {
                const gen = bumpIndicatorLoadGen(ind.id);
                try {
                  const fallback = await computeIndicatorForDisplay({
                    uid: instrument.uid,
                    interval,
                    ind,
                    from: displayRange.from,
                    to: displayRange.to,
                  });
                  if (!isIndicatorLoadStale(ind.id, gen)) {
                    indValuesMapRef.current.set(
                      ind.id,
                      applyIndicatorToSeries(ind, seriesList, fallback),
                    );
                  }
                } catch (displayErr) {
                  console.warn("Indicator display fallback error:", ind.name, displayErr);
                }
              }
            }

            setLoadingIndicators((prev) => {
              const next = new Set(prev);
              next.delete(ind.id);
              return next;
            });

            if (needsFullPersist || hasTailGap) {
              void ensureIndicatorPersisted(ind, lastBarSec)
                .then(() =>
                  loadIndicatorFromClickHouse(ind, bars, {
                    showLoading: false,
                    forceGap: true,
                    fullSeries: true,
                  }),
                )
                .catch((persistErr) => {
                  console.warn("Indicator persist/complement error:", ind.name, persistErr);
                });
            }
          } else {
            const want = rangeFromBarsSec(bars);
            const sig = indicatorComputeSig(ind);
            const loaded = indLoadedRangeRef.current.get(ind.id);
            if (
              want &&
              loaded?.sig === sig &&
              want.fromSec >= loaded.fromSec &&
              want.toSec <= loaded.toSec
            ) {
              const map = indValuesMapRef.current.get(ind.id);
              if (map && map.size > 0) {
                applyIndicatorToSeries(ind, seriesList, pointsForBars(map, bars));
              }
              continue;
            }

            const gen = bumpIndicatorLoadGen(ind.id);
            const displayRange = rangeFromBars(bars);
            if (!displayRange) continue;

            const res = await computeIndicatorForDisplay({
              uid: instrument.uid,
              interval,
              ind,
              from: displayRange.from,
              to: displayRange.to,
            });

            if (isIndicatorLoadStale(ind.id, gen)) continue;

            indValuesMapRef.current.set(
              ind.id,
              applyIndicatorToSeries(ind, seriesList, res),
            );
            if (want) {
              indLoadedRangeRef.current.set(ind.id, { ...want, sig });
            }

            setLoadingIndicators((prev) => {
              const next = new Set(prev);
              next.delete(ind.id);
              return next;
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Indicator sync error:", ind.name, msg);
          setError(`Индикатор ${ind.name}: ${msg}`);
          setLoadingIndicators((prev) => {
            const next = new Set(prev);
            next.delete(ind.id);
            return next;
          });
        }
      }

      updateHudFromLastBar();
    },
    [indicators, instrument, interval, ensureIndicatorPersisted, loadIndicatorFromClickHouse, resolveFullSeriesRange],
  );

  const syncIndicatorsRef = useRef(syncIndicators);
  syncIndicatorsRef.current = syncIndicators;

  // Sync lightweight-charts series instances whenever indicators configuration changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const existingMap = indSeriesMapRef.current;
    const nextMap = new Map<string, ISeriesApi<any>[]>();

    const hasOscillators = indicators.some((i) => i.visible && isOscillator(i.type, i.name));

    // Adjust candle margin if oscillators are present
    if (candleRef.current) {
      candleRef.current.priceScale().applyOptions({
        scaleMargins: { top: 0.08, bottom: hasOscillators ? 0.32 : 0.22 },
      });
    }

    const prev = prevIndicatorsRef.current;

    for (const ind of indicators) {
      const existing = existingMap.get(ind.id);
      const isOsc = isOscillator(ind.type, ind.name);
      const old = prev.find((item) => item.id === ind.id);
      const typeChanged = Boolean(old && old.type !== ind.type);

      if (!ind.visible) {
        // Оверлеи оставляем на шкале свечей и только прячем.
        // Осцилляторы убираем, чтобы не оставалась пустая нижняя шкала.
        if (existing && existing.length > 0 && !isOsc && !typeChanged) {
          applyIndicatorAppearance(existing, ind, false);
          nextMap.set(ind.id, existing);
        }
        continue;
      }

      const scaleId = isOsc ? oscillatorScaleId(ind.id) : "right";
      let seriesList: ISeriesApi<"Line" | "Histogram">[];

      if (existing && existing.length > 0 && !typeChanged) {
        seriesList = existing;
        applyIndicatorAppearance(seriesList, ind, true);
      } else {
        if (existing && existing.length > 0) {
          detachSeries(chart, existing);
        }
        seriesList = createIndicatorSeries(chart, ind, scaleId);
      }

      if (isOsc && seriesList.length > 0) {
        applyOscillatorScale(chart, scaleId);
      }

      nextMap.set(ind.id, seriesList);
    }

    for (const [id, seriesList] of existingMap.entries()) {
      if (!nextMap.has(id)) {
        detachSeries(chart, seriesList);
        syncedComputeSigRef.current.delete(id);
        if (!indicators.some((item) => item.id === id)) {
          indLoadedRangeRef.current.delete(id);
          indValuesMapRef.current.delete(id);
        }
      }
    }

    indSeriesMapRef.current = nextMap;

    const changedIds: string[] = [];
    for (const ind of indicators) {
      if (!ind.visible) continue;
      const old = prev.find((item) => item.id === ind.id);
      const isOsc = isOscillator(ind.type, ind.name);
      const sig = `${ind.type}:${ind.persist}:${JSON.stringify(ind.params)}`;
      const synced = syncedComputeSigRef.current.get(ind.id);
      if (!old || synced !== sig || (isOsc && !old.visible)) {
        changedIds.push(ind.id);
        syncedComputeSigRef.current.set(ind.id, sig);
      }
    }
    prevIndicatorsRef.current = indicators;

    // Пересчитываем только добавленные/изменённые индикаторы (не весь график).
    if (latestBarsRef.current.length > 0 && changedIds.length > 0) {
      void syncIndicatorsRef.current(latestBarsRef.current, changedIds, {
        persist: true,
        showLoading: true,
      });
    }
  }, [indicators]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#efe8f8",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(200, 180, 230, 0.08)" },
        horzLines: { color: "rgba(200, 180, 230, 0.08)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(200, 180, 230, 0.18)",
      },
      timeScale: {
        borderColor: "rgba(200, 180, 230, 0.18)",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        locale: "ru-RU",
        timeFormatter: formatChartTime,
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    candles.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.22 },
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
    });

    const paintCoverage = () => {
      setCoverInfo(
        coverageStatus(
          downloadRowRef.current,
          timesRef.current,
          intervalRef.current,
          downloadRef.current,
        ),
      );
    };
    paintCoverageRef.current = paintCoverage;

    const store = new CandleViewportStore({
      onHistory: (bars, meta) => {
        latestBarsRef.current = bars;
        const logical = chart.timeScale().getVisibleLogicalRange();
        candles.setData(bars.map(toCandle));
        volume.setData(bars.map(toVolume));
        timesRef.current = bars.map((bar) => bar.time as number);
        const last = bars[bars.length - 1];
        if (last) {
          candles.applyOptions({ priceFormat: priceFormat(last.close) });
          if (!hoverRef.current) setHud(last);
        }
        if (meta.firstLoad) {
          const n = bars.length;
          const visible = Math.min(n, Math.max(20, meta.visibleCount));
          chart.timeScale().setVisibleLogicalRange({
            from: Math.max(-0.5, n - visible - 0.5),
            to: n + 2,
          });
        } else if (meta.prepended > 0 && logical) {
          chart.timeScale().setVisibleLogicalRange({
            from: logical.from + meta.prepended,
            to: logical.to + meta.prepended,
          });
        }
        setError("");
        paintCoverage();

        // Подгрузка индикаторов только по недостающему диапазону.
        // Полный persist — при первом появлении свечей; скролл его не повторяет.
        if (indicatorsRef.current.some((i) => i.visible)) {
          const run = () => {
            void syncIndicatorsRef.current(latestBarsRef.current, undefined, {
              persist: meta.firstLoad,
              showLoading: false,
            });
          };
          if (historyIndSyncTimerRef.current != null) {
            window.clearTimeout(historyIndSyncTimerRef.current);
            historyIndSyncTimerRef.current = null;
          }
          if (meta.firstLoad) {
            run();
          } else {
            historyIndSyncTimerRef.current = window.setTimeout(() => {
              historyIndSyncTimerRef.current = null;
              run();
            }, 180);
          }
        }
      },
      onLoading: setLoading,
      onError: (err) => {
        setError(err.message);
      },
    });

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    storeRef.current = store;

    const onRange = (range: LogicalRange | null) => {
      store.requestVisible(range);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.point) {
        hoverRef.current = false;
        const last = store.lastBar();
        if (last) {
          setHud(last);
          const tSec = last.time as number;
          const nextHud = new Map<string, Record<string, number>>();
          for (const [indId, map] of indValuesMapRef.current.entries()) {
            const vals = map.get(tSec);
            if (vals) nextHud.set(indId, vals);
          }
          setIndicatorHud(nextHud);
        }
        return;
      }
      const data = param.seriesData.get(candles) as CandlestickData<UTCTimestamp> | undefined;
      const vol = param.seriesData.get(volume) as HistogramData<UTCTimestamp> | undefined;
      if (!data) return;
      hoverRef.current = true;
      const tSec = data.time as number;
      setHud({
        time: data.time as UTCTimestamp,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: vol?.value ?? 0,
      });

      // Update indicator HUD values under crosshair
      const nextHud = new Map<string, Record<string, number>>();
      for (const [indId, map] of indValuesMapRef.current.entries()) {
        const vals = map.get(tSec);
        if (vals) nextHud.set(indId, vals);
      }
      setIndicatorHud(nextHud);
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      if (historyIndSyncTimerRef.current != null) {
        window.clearTimeout(historyIndSyncTimerRef.current);
        historyIndSyncTimerRef.current = null;
      }
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onMove);
      store.destroy();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      storeRef.current = null;
      timesRef.current = [];
      indSeriesMapRef.current.clear();
      indValuesMapRef.current.clear();
      indLoadedRangeRef.current.clear();
      latestBarsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const store = storeRef.current;
    const candles = candleRef.current;
    const volume = volumeRef.current;
    const wrap = wrapRef.current;
    if (!store || !candles || !volume) return;

    hoverRef.current = false;
    setHud(null);
    setIndicatorHud(new Map());
    setLoadingIndicators(new Set());
    indicatorLoadGenRef.current.clear();
    persistedKeysRef.current.clear();
    persistInFlightRef.current.clear();
    indLoadedRangeRef.current.clear();
    setError("");
    candles.setData([]);
    volume.setData([]);
    timesRef.current = [];
    latestBarsRef.current = [];

    // Clear indicator series
    for (const seriesList of indSeriesMapRef.current.values()) {
      for (const s of seriesList) s.setData([]);
    }
    indValuesMapRef.current.clear();

    if (!instrument) {
      store.reset("", interval);
      setLoading(false);
      return;
    }

    store.reset(instrument.uid, interval);
    const visible = Math.max(30, Math.floor((wrap?.clientWidth || 800) / 8));
    void store.loadInitial(visible);
  }, [instrument, interval]);

  useEffect(() => {
    if (!instrument) {
      downloadRef.current = null;
      downloadRowRef.current = null;
      setCoverInfo(null);
      return;
    }
    let cancelled = false;
    void fetchInstrumentLastDownload(instrument.uid, interval)
      .then((row) => {
        if (cancelled) return;
        downloadRowRef.current = row;
        downloadRef.current = downloadCoverageFrom(row);
        paintCoverageRef.current();
      })
      .catch(() => {
        if (cancelled) return;
        downloadRowRef.current = null;
        downloadRef.current = null;
        paintCoverageRef.current();
      });
    return () => {
      cancelled = true;
    };
  }, [instrument, interval]);

  const handleAddIndicator = useCallback((config: IndicatorConfig) => {
    setIndicators((prev) => [...prev, config]);
  }, []);

  const handleUpdateIndicator = useCallback((config: IndicatorConfig) => {
    setIndicators((prev) => prev.map((i) => (i.id === config.id ? config : i)));
  }, []);

  const handleRemoveIndicator = (id: string) => {
    setIndicators((prev) => prev.filter((i) => i.id !== id));
  };

  const handleToggleVisibility = (id: string) => {
    setIndicators((prev) =>
      prev.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)),
    );
  };

  const up = hud ? hud.close >= hud.open : true;
  const activeCount = indicators.filter((i) => i.visible).length;

  return (
    <section className="panel-page candles-panel">
      <header className="scheduler-header candles-header">
        <p className="eyebrow">Сервисы</p>
        <div className="candles-title-row">
          <h1>Свечи</h1>
          {loading ? <span className="candles-loading">подгрузка</span> : null}
          {instrument && coverInfo ? (
            <span
              className={`candles-coverage-label${
                coverInfo.incomplete ? " is-incomplete" : ""
              }`}
            >
              {coverInfo.text}
            </span>
          ) : null}
        </div>
      </header>

      <div className="filters-bar candles-toolbar">
        <div className="candles-picker-row">
          <InstrumentSelect value={instrument} onChange={setInstrument} />
          <div
            className="candles-interval-rail"
            role="group"
            aria-label="Интервал свечей"
          >
            {(["m", "h", "d"] as const).map((kind, gi) => {
              const group = CANDLE_INTERVALS.filter((iv) => {
                if (kind === "m") return iv.short.endsWith("м");
                if (kind === "h") return iv.short.endsWith("ч");
                return !iv.short.endsWith("м") && !iv.short.endsWith("ч");
              });
              return (
                <Fragment key={kind}>
                  {gi > 0 ? (
                    <span className="interval-sep" aria-hidden="true" />
                  ) : null}
                  {group.map((iv) => (
                    <button
                      key={iv.value}
                      type="button"
                      title={iv.label}
                      className={`interval-btn${
                        interval === iv.value ? " is-active" : ""
                      }`}
                      onClick={() => setInterval(iv.value)}
                    >
                      {iv.short}
                    </button>
                  ))}
                </Fragment>
              );
            })}
          </div>

          <button
            type="button"
            className={`indicators-btn-trigger ${activeCount > 0 ? "has-active" : ""}`}
            onClick={() => {
              setEditIndicatorId(null);
              setModalOpen(true);
            }}
            title="Выбор и настройка индикаторов (RSI, SMA, EMA, MACD, BB)"
          >
            <span>+ Индикаторы</span>
            {activeCount > 0 ? (
              <span className="indicators-badge-count">{activeCount}</span>
            ) : null}
          </button>
        </div>

        {interval !== INTERVAL_1MIN && interval !== INTERVAL_1DAY ? (
          <p className="hint candles-hint">
            В ClickHouse сейчас лежат только 1м и 1д. Остальные интервалы будут
            пустыми, пока их не загрузит планировщик.
          </p>
        ) : null}

        {hud ? (
          <div className="candles-ohlc">
            <span className="candles-ohlc-ticker">{instrument?.ticker ?? ""}</span>
            <strong className={up ? "is-up" : "is-down"}>
              {formatPrice(hud.close)}
            </strong>
            <span>O {formatPrice(hud.open)}</span>
            <span>H {formatPrice(hud.high)}</span>
            <span>L {formatPrice(hud.low)}</span>
            <span className={up ? "is-up" : "is-down"}>
              C {formatPrice(hud.close)}
            </span>
            <span>V {formatVolume(hud.volume)}</span>
          </div>
        ) : (
          <p className="hint candles-hint">
            Выберите инструмент. История из ClickHouse: порция растёт с
            масштабом (от 500 свечей), следующая — когда до края остаётся около
            одного экрана.
          </p>
        )}

        {/* Indicators HUD Values row */}
        {indicatorHud.size > 0 ? (
          <div className="candles-indicators-hud">
            {indicators
              .filter((ind) => ind.visible && indicatorHud.has(ind.id))
              .map((ind) => {
                const vals = indicatorHud.get(ind.id)!;
                return (
                  <div key={ind.id} className="ind-hud-tag">
                    <span
                      className="ind-hud-dot"
                      style={{ backgroundColor: ind.color }}
                    />
                    <span className="ind-hud-name">{ind.name}:</span>
                    <span className="ind-hud-val">
                      {Object.entries(vals)
                        .map(([k, v]) => (k === "value" ? v.toFixed(2) : `${k}:${v.toFixed(2)}`))
                        .join(" ")}
                    </span>
                  </div>
                );
              })}
          </div>
        ) : null}

        {/* Indicators Active Legend Chips */}
        {indicators.length > 0 ? (
          <div className="candles-indicators-chips-bar">
            {indicators.map((ind) => (
              <div
                key={ind.id}
                className={`ind-chip ${!ind.visible ? "is-hidden" : ""} ${
                  loadingIndicators.has(ind.id) ? "is-loading" : ""
                }`}
              >
                <span
                  className="ind-chip-dot"
                  style={{ backgroundColor: ind.color }}
                />
                <span className="ind-chip-title">
                  {ind.name}
                  {loadingIndicators.has(ind.id) ? (
                    <span className="ind-chip-loading"> загрузка…</span>
                  ) : null}
                  <span className="ind-chip-params">
                    (
                    {Object.entries(ind.params)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(",")}
                    )
                  </span>
                </span>
                <button
                  type="button"
                  className="ind-chip-btn"
                  title="Настройки"
                  onClick={() => {
                    setEditIndicatorId(ind.id);
                    setModalOpen(true);
                  }}
                >
                  ⚙
                </button>
                <button
                  type="button"
                  className="ind-chip-btn"
                  title={ind.visible ? "Скрыть" : "Показать"}
                  onClick={() => handleToggleVisibility(ind.id)}
                >
                  {ind.visible ? "👁" : "🚫"}
                </button>
                <button
                  type="button"
                  className="ind-chip-btn danger"
                  title="Удалить"
                  onClick={() => handleRemoveIndicator(ind.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="error candles-error">{error}</p> : null}
      </div>

      <div className="candles-chart-wrap">
        <div ref={wrapRef} className="candles-chart" />
        {!instrument ? (
          <div className="candles-empty">
            Выберите инструмент, чтобы показать свечи
          </div>
        ) : null}
      </div>

      <IndicatorsModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditIndicatorId(null);
        }}
        indicators={indicators}
        initialEditId={editIndicatorId}
        onAddIndicator={handleAddIndicator}
        onUpdateIndicator={handleUpdateIndicator}
        onRemoveIndicator={handleRemoveIndicator}
        onToggleVisibility={handleToggleVisibility}
      />
    </section>
  );
}
