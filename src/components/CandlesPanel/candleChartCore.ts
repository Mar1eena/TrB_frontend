/**
 * Общая логика отображения свечей: создание графика (lightweight-charts),
 * серии candlestick/volume и подключение CandleViewportStore (постепенная
 * подгрузка истории + масштабирование видимого диапазона).
 *
 * Используется панелью "Свечи" (живой график) и графиком результата
 * бэктеста — единая логика для всех графиков свечей в приложении.
 */
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type ChartOptions,
  type DeepPartial,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import { type CandleBar } from "../../api/tinvest/candles";
import { CandleViewportStore, type HistoryMeta, type ViewportBounds } from "./viewportStore";

export const CANDLE_UP = "#3dba7a";
export const CANDLE_DOWN = "#e07070";
export const VOLUME_UP = "rgba(61, 186, 122, 0.4)";
export const VOLUME_DOWN = "rgba(224, 112, 112, 0.4)";

export function toCandle(bar: CandleBar): CandlestickData<UTCTimestamp> {
  return {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

export function toVolume(bar: CandleBar): HistogramData<UTCTimestamp> {
  return {
    time: bar.time,
    value: bar.volume,
    color: bar.close >= bar.open ? VOLUME_UP : VOLUME_DOWN,
  };
}

/** Базовые опции графика — единый внешний вид для всех графиков свечей. */
export function createCandleChart(
  container: HTMLElement,
  overrides?: DeepPartial<ChartOptions>,
): IChartApi {
  return createChart(container, {
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
    rightPriceScale: { borderColor: "rgba(200, 180, 230, 0.18)" },
    timeScale: {
      borderColor: "rgba(200, 180, 230, 0.18)",
      timeVisible: true,
      secondsVisible: false,
    },
    localization: { locale: "ru-RU" },
    ...overrides,
  });
}

/** Серии свечей + объёма с единым оформлением. */
export function createCandleSeriesPair(
  chart: IChartApi,
  opts?: { volumeScaleId?: string; volumeMargins?: { top: number; bottom: number } },
): { candles: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram"> } {
  const candles = chart.addSeries(CandlestickSeries, {
    upColor: CANDLE_UP,
    downColor: CANDLE_DOWN,
    borderUpColor: CANDLE_UP,
    borderDownColor: CANDLE_DOWN,
    wickUpColor: CANDLE_UP,
    wickDownColor: CANDLE_DOWN,
  });
  const scaleId = opts?.volumeScaleId ?? "volume";
  const volume = chart.addSeries(HistogramSeries, {
    priceFormat: { type: "volume" },
    priceScaleId: scaleId,
  });
  candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
  chart.priceScale(scaleId).applyOptions({
    scaleMargins: opts?.volumeMargins ?? { top: 0.82, bottom: 0 },
    borderVisible: false,
  });
  return { candles, volume };
}

/**
 * Подключает CandleViewportStore к графику: постепенная подгрузка (левый/
 * правый край) + масштабирование видимого диапазона при первой загрузке и
 * при дозагрузке истории влево (сдвиг на число добавленных баров).
 * `onBars` вызывается после каждого обновления данных графика — сюда вешают
 * специфичную для конкретного графика логику (HUD, индикаторы, маркеры сделок).
 */
export function wireCandleViewport(params: {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  onBars?: (bars: CandleBar[], meta: HistoryMeta) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (err: Error) => void;
}): { store: CandleViewportStore; dispose: () => void } {
  const { chart, candles, volume } = params;

  const store = new CandleViewportStore({
    onHistory: (bars, meta) => {
      const logical = chart.timeScale().getVisibleLogicalRange();
      candles.setData(bars.map(toCandle));
      volume.setData(bars.map(toVolume));

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

      params.onBars?.(bars, meta);
    },
    onLoading: (loading) => params.onLoading?.(loading),
    onError: (err) => params.onError?.(err),
  });

  const onRange = (range: LogicalRange | null) => store.requestVisible(range);
  chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

  return {
    store,
    dispose: () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      store.destroy();
    },
  };
}

/** Сколько баров показать на первом экране — по ширине контейнера (~8px на бар). */
export function initialVisibleCount(containerWidthPx: number): number {
  return Math.max(30, Math.floor((containerWidthPx || 800) / 8));
}

export type { ViewportBounds, HistoryMeta };
