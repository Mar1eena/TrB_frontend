import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CrosshairMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { CANDLE_INTERVALS, INTERVAL_1DAY, INTERVAL_1MIN } from "../../api/scheduler";
import { type CandleBar } from "../../api/tinvest/candles";
import InstrumentSelect, { type PickedInstrument } from "./InstrumentSelect";
import { CandleViewportStore } from "./viewportStore";
import {
  createCandleChart,
  createCandleSeriesPair,
  initialVisibleCount,
  wireCandleViewport,
} from "./candleChartCore";
import { coverageStatus } from "./coverageOverlay";
import "../SchedulerPanel/SchedulerPanel.css";
import "./CandlesPanel.css";

const LS_KEY = "trb.candles.panel.v2";

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

function saveState(instrument: PickedInstrument | null, interval: number) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ instrument, interval }));
  } catch {
    /* ignore */
  }
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

export default function CandlesPanel() {
  const saved = useRef(loadSaved()).current;
  const [instrument, setInstrument] = useState<PickedInstrument | null>(saved.instrument);
  const [interval, setInterval] = useState(saved.interval);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hud, setHud] = useState<CandleBar | null>(null);
  const [coverInfo, setCoverInfo] = useState<{ text: string; incomplete: boolean } | null>(null);
  const hoverRef = useRef(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const storeRef = useRef<CandleViewportStore | null>(null);
  const timesRef = useRef<number[]>([]);
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

  useEffect(() => {
    saveState(instrument, interval);
  }, [instrument, interval]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createCandleChart(el, {
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        locale: "ru-RU",
        timeFormatter: formatChartTime,
      },
    });

    const { candles, volume } = createCandleSeriesPair(chart);

    const paintCoverage = () => {
      setCoverInfo(coverageStatus(timesRef.current, intervalRef.current));
    };

    const { store, dispose: disposeViewport } = wireCandleViewport({
      chart,
      candles,
      volume,
      onBars: (bars) => {
        timesRef.current = bars.map((bar) => bar.time as number);
        const last = bars[bars.length - 1];
        if (last) {
          candles.applyOptions({ priceFormat: priceFormat(last.close) });
          if (!hoverRef.current) setHud(last);
        }
        setError("");
        paintCoverage();
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

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.point) {
        hoverRef.current = false;
        const last = store.lastBar();
        if (last) setHud(last);
        return;
      }
      const data = param.seriesData.get(candles) as CandlestickData<UTCTimestamp> | undefined;
      const vol = param.seriesData.get(volume) as HistogramData<UTCTimestamp> | undefined;
      if (!data) return;
      hoverRef.current = true;
      setHud({
        time: data.time as UTCTimestamp,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: vol?.value ?? 0,
      });
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      disposeViewport();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      storeRef.current = null;
      timesRef.current = [];
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
    setError("");
    setCoverInfo(null);
    candles.setData([]);
    volume.setData([]);
    timesRef.current = [];

    if (!instrument) {
      store.reset("", interval);
      setLoading(false);
      setCoverInfo(null);
      return;
    }

    store.reset(instrument.uid, interval);
    void store.loadInitial(initialVisibleCount(wrap?.clientWidth || 800));
  }, [instrument, interval]);

  const up = hud ? hud.close >= hud.open : true;

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
    </section>
  );
}
