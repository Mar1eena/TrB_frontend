import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createSeriesMarkers,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CandleBar } from "../../api/tinvest/candles";
import type { BacktestConfig, TradeRecord } from "../../api/strategy";
import {
  createCandleChart,
  createCandleSeriesPair,
  initialVisibleCount,
  wireCandleViewport,
} from "../CandlesPanel/candleChartCore";
import { CandleViewportStore } from "../CandlesPanel/viewportStore";

function toSec(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

/** Ближайшая по времени свеча (индекс) для проставления маркера сделки. */
function nearestBarTime(times: number[], target: number): number | null {
  if (times.length === 0) return null;
  let lo = 0;
  let hi = times.length - 1;
  if (target <= times[0]) return times[0];
  if (target >= times[hi]) return times[hi];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const after = times[lo];
  const before = times[lo - 1] ?? after;
  return target - before <= after - target ? before : after;
}

type MarkerSeed = {
  timeSec: number;
  time: Time;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  full: string;
  short: string;
};

/** Максимум маркеров, одновременно отданных в lightweight-charts. */
const MAX_MARKERS = 600;

/** Индекс первого seed со временем >= t (seeds отсортированы по timeSec). */
function lowerBoundByTime(seeds: MarkerSeed[], t: number): number {
  let lo = 0;
  let hi = seeds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (seeds[mid].timeSec < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Равномерное прореживание до не более `max` элементов. */
function decimate<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr[Math.floor(i)]);
  return out;
}

/** Маркеры сделок, привязанные к ближайшим по времени загруженным свечам. */
function buildMarkerSeeds(trades: TradeRecord[], times: number[]): MarkerSeed[] {
  const seeds: MarkerSeed[] = [];
  if (times.length === 0) return seeds;
  const firstT = times[0];
  const lastT = times[times.length - 1];
  for (const tr of trades) {
    const eSec = toSec(tr.entryTime);
    const xSec = toSec(tr.exitTime);
    // Только сделки в пределах загруженного/отрисованного окна свечей —
    // остальные снапнулись бы в кучу на краю и тормозили бы график.
    const entry = eSec >= firstT && eSec <= lastT ? nearestBarTime(times, eSec) : null;
    const exit = xSec >= firstT && xSec <= lastT ? nearestBarTime(times, xSec) : null;
    if (entry != null) {
      seeds.push({
        timeSec: entry,
        time: entry as UTCTimestamp as Time,
        position: "belowBar",
        color: tr.isLong ? "#3dba7a" : "#e0a13d",
        shape: "arrowUp",
        full: tr.isLong ? "BUY" : "SHORT",
        short: tr.isLong ? "B" : "S",
      });
    }
    if (exit != null) {
      seeds.push({
        timeSec: exit,
        time: exit as UTCTimestamp as Time,
        position: "aboveBar",
        color: tr.pnl >= 0 ? "#7fd6a3" : "#e0637d",
        shape: "arrowDown",
        full: `SELL ${tr.pnl >= 0 ? "+" : ""}${tr.pnl.toFixed(0)}`,
        short: "S",
      });
    }
  }
  seeds.sort((a, b) => a.timeSec - b.timeSec);
  return seeds;
}

export default function PriceChart({
  config,
  trades,
}: {
  config: BacktestConfig;
  trades: TradeRecord[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const storeRef = useRef<CandleViewportStore | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const seedsRef = useRef<MarkerSeed[]>([]);
  const tradesRef = useRef(trades);
  tradesRef.current = trades;

  const [barsCount, setBarsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfgKey = `${config.uid}:${config.interval}:${config.start}:${config.end}`;

  const markerStats = useMemo(() => {
    const wins = trades.filter((t) => t.pnl >= 0).length;
    return { wins, losses: trades.length - wins };
  }, [trades]);

  // Создаём график один раз: та же логика отображения (постепенная подгрузка +
  // масштабирование), что и на панели "Свечи".
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createCandleChart(el, {
      timeScale: { borderColor: "rgba(200, 180, 230, 0.18)", timeVisible: true, secondsVisible: false },
    });
    const { candles, volume } = createCandleSeriesPair(chart, {
      volumeScaleId: "vol",
      volumeMargins: { top: 0.82, bottom: 0 },
    });

    const applyMarkerScale = () => {
      const markersApi = markersApiRef.current;
      if (!markersApi) return;
      const seeds = seedsRef.current;
      const px = chart.timeScale().options().barSpacing ?? 6;
      const size = px >= 14 ? 2 : px >= 9 ? 1.5 : px >= 5 ? 1 : px >= 2.5 ? 0.6 : 0.35;
      const label: "full" | "short" | "none" = px >= 12 ? "full" : px >= 7 ? "short" : "none";

      // В график отдаём только маркеры видимого диапазона (+ запас в один экран),
      // с прореживанием — иначе тысячи сделок кладут прокрутку графика.
      let slice = seeds;
      if (seeds.length > MAX_MARKERS) {
        const vr = chart.timeScale().getVisibleRange();
        if (vr) {
          const from = vr.from as number;
          const to = vr.to as number;
          const pad = Math.max(1, to - from);
          slice = seeds.slice(
            lowerBoundByTime(seeds, from - pad),
            lowerBoundByTime(seeds, to + pad),
          );
        }
        slice = decimate(slice, MAX_MARKERS);
      }

      markersApi.setMarkers(
        slice.map(
          (s) =>
            ({
              time: s.time,
              position: s.position,
              color: s.color,
              shape: s.shape,
              size,
              text: label === "full" ? s.full : label === "short" ? s.short : undefined,
            }) as SeriesMarker<Time>,
        ),
      );
    };

    let markerRaf = 0;
    const scheduleMarkerScale = () => {
      if (markerRaf) return;
      markerRaf = requestAnimationFrame(() => {
        markerRaf = 0;
        applyMarkerScale();
      });
    };

    const applyMarkers = (bars: CandleBar[]) => {
      const times = bars.map((b) => b.time as number);
      seedsRef.current = buildMarkerSeeds(tradesRef.current, times);
      if (seedsRef.current.length === 0) {
        markersApiRef.current?.setMarkers([]);
        return;
      }
      if (!markersApiRef.current) {
        markersApiRef.current = createSeriesMarkers(candles, []);
      }
      scheduleMarkerScale();
    };

    const { store, dispose: disposeViewport } = wireCandleViewport({
      chart,
      candles,
      volume,
      onBars: (bars) => {
        setBarsCount(bars.length);
        setError(null);
        applyMarkers(bars);
      },
      onLoading: setLoading,
      onError: (err) => setError(err.message),
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleMarkerScale);
    chart.timeScale().fitContent();

    candleRef.current = candles;
    volumeRef.current = volume;
    storeRef.current = store;

    return () => {
      if (markerRaf) cancelAnimationFrame(markerRaf);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleMarkerScale);
      disposeViewport();
      chart.remove();
      candleRef.current = null;
      volumeRef.current = null;
      storeRef.current = null;
      markersApiRef.current = null;
      seedsRef.current = [];
    };
  }, []);

  // Смена бэктеста (инструмент/интервал/период) — перезапускаем подгрузку,
  // не пересоздавая график (как при смене инструмента на панели "Свечи").
  useEffect(() => {
    const store = storeRef.current;
    const candles = candleRef.current;
    const volume = volumeRef.current;
    const wrap = wrapRef.current;
    if (!store || !candles || !volume) return;

    setBarsCount(0);
    setError(null);
    candles.setData([]);
    volume.setData([]);
    markersApiRef.current?.setMarkers([]);
    seedsRef.current = [];

    const nowSec = Math.floor(Date.now() / 1000);
    store.reset(config.uid, config.interval, {
      fromSec: toSec(config.start),
      toSec: Math.min(nowSec, toSec(config.end)),
    });
    void store.loadInitial(initialVisibleCount(wrap?.clientWidth || 800));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  return (
    <>
      <div className="strategy-chart-legend">
        <span className="strategy-chart-legend-item">
          <i className="dot buy" /> вход {markerStats.wins + markerStats.losses}
        </span>
        <span className="strategy-chart-legend-item">
          <i className="dot win" /> выход в плюс {markerStats.wins}
        </span>
        <span className="strategy-chart-legend-item">
          <i className="dot loss" /> выход в минус {markerStats.losses}
        </span>
        <span className="strategy-chart-legend-item muted">
          {loading ? "подгрузка…" : `${barsCount.toLocaleString("ru-RU")} свечей`}
        </span>
        {error ? <span className="strategy-chart-legend-item error">{error}</span> : null}
      </div>
      <div className="strategy-chart-wrap">
        <div ref={wrapRef} className="strategy-equity-chart" />
        {barsCount === 0 && !error ? (
          <div className="strategy-price-status strategy-price-status-overlay">
            <span className="strategy-spinner" /> Загрузка свечей…
          </div>
        ) : null}
      </div>
    </>
  );
}
