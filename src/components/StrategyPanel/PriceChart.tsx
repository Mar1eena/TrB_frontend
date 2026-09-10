import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CandleBar } from "../../api/tinvest/candles";
import type { BacktestConfig, BacktestIndicatorSeries, TradeRecord } from "../../api/strategy";
import {
  createCandleChart,
  createCandleSeriesPair,
  initialVisibleCount,
  wireCandleViewport,
} from "../CandlesPanel/candleChartCore";
import { CandleViewportStore } from "../CandlesPanel/viewportStore";

const OSCILLATORS = new Set([
  "rsi", "macd", "macdext", "macdfix", "stoch", "stochf", "stochrsi", "cci", "cmo",
  "mfi", "willr", "adx", "adxr", "aroon", "aroonosc", "roc", "rocp", "mom", "trix",
  "ultosc", "atr", "natr", "dx", "ppo", "apo", "bop",
]);

const PALETTE = ["#8b5cf6", "#3b82f6", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#e11d48"];

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

function indicatorLabel(s: BacktestIndicatorSeries): string {
  return s.indicator ? s.indicator.toUpperCase() : s.indicatorId;
}

/** Рисует один индикатор из результата бэктеста (уже посчитанные значения). */
function drawIndicator(
  chart: IChartApi,
  s: BacktestIndicatorSeries,
  color: string,
  paneIndex: number,
): ISeriesApi<"Line"> | null {
  const data = s.points
    .map((p) => ({
      time: Math.floor(Date.parse(p.time) / 1000) as UTCTimestamp,
      value: p.values.value ?? Object.values(p.values)[0],
    }))
    .filter((d) => Number.isFinite(d.time) && Number.isFinite(d.value as number))
    .sort((a, b) => (a.time as number) - (b.time as number));
  if (data.length === 0) return null;

  const line = chart.addSeries(
    LineSeries,
    {
      color,
      lineWidth: 2,
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex,
  );
  line.setData(data.map((d) => ({ time: d.time as Time, value: d.value as number })));
  return line;
}

type MarkerSeed = {
  time: Time;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  full: string;
  short: string;
};

/** Маркеры сделок, привязанные к ближайшим по времени загруженным свечам. */
function buildMarkerSeeds(trades: TradeRecord[], times: number[]): MarkerSeed[] {
  const seeds: MarkerSeed[] = [];
  for (const tr of trades) {
    const entry = nearestBarTime(times, toSec(tr.entryTime));
    const exit = nearestBarTime(times, toSec(tr.exitTime));
    if (entry != null) {
      seeds.push({
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
        time: exit as UTCTimestamp as Time,
        position: "aboveBar",
        color: tr.pnl >= 0 ? "#7fd6a3" : "#e0637d",
        shape: "arrowDown",
        full: `SELL ${tr.pnl >= 0 ? "+" : ""}${tr.pnl.toFixed(0)}`,
        short: "S",
      });
    }
  }
  seeds.sort((a, b) => (a.time as number) - (b.time as number));
  return seeds;
}

export default function PriceChart({
  config,
  indicators = [],
  trades,
}: {
  config: BacktestConfig;
  indicators?: BacktestIndicatorSeries[];
  trades: TradeRecord[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const storeRef = useRef<CandleViewportStore | null>(null);
  const indicatorSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
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

  const indicatorsKey = useMemo(
    () => indicators.map((s) => `${s.indicatorId}:${s.points.length}`).join("|"),
    [indicators],
  );

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
      const px = chart.timeScale().options().barSpacing ?? 6;
      const size = px >= 14 ? 2 : px >= 9 ? 1.5 : px >= 5 ? 1 : px >= 2.5 ? 0.6 : 0.35;
      const label: "full" | "short" | "none" = px >= 12 ? "full" : px >= 7 ? "short" : "none";
      markersApi.setMarkers(
        seedsRef.current.map(
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
      applyMarkerScale();
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

    chart.timeScale().subscribeVisibleLogicalRangeChange(applyMarkerScale);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    storeRef.current = store;

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(applyMarkerScale);
      disposeViewport();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      storeRef.current = null;
      indicatorSeriesRef.current = [];
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

  // Индикаторы результата бэктеста — готовые значения, перерисовываем при
  // изменении набора (не зависят от прогрузки истории).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const series of indicatorSeriesRef.current) {
      try {
        chart.removeSeries(series);
      } catch {
        /* уже удалена */
      }
    }
    indicatorSeriesRef.current = [];

    let oscPane = 0;
    indicators.forEach((s, i) => {
      const key = (s.indicator || "").toLowerCase();
      const overlay = s.overlay && !OSCILLATORS.has(key);
      const paneIndex = overlay ? 0 : ++oscPane;
      try {
        const line = drawIndicator(chart, s, PALETTE[i % PALETTE.length], paneIndex);
        if (line) indicatorSeriesRef.current.push(line);
        if (!overlay) chart.panes()[paneIndex]?.setHeight(110);
      } catch {
        /* индикатор не критичен для графика */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorsKey]);

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
        {indicators.map((s, i) => (
          <span key={s.indicatorId + i} className="strategy-chart-legend-item">
            <i className="dot" style={{ background: PALETTE[i % PALETTE.length] }} /> {indicatorLabel(s)}
          </span>
        ))}
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
