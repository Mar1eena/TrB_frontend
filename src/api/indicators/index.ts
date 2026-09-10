import { parseTimestamp } from "../common/converters";
import { wrapRpcError } from "../common/errors";
import {
  indicatorSettingsClient,
  newBbandsParams,
  newEmaParams,
  newIndicatorSettingsMessage,
  newMacdParams,
  newRsiParams,
  newSettingsMessage,
  newSmaParams,
} from "./client";

export type IndicatorInfo = {
  type: number;
  name: string;
  minBars: number;
  defaultParams: Record<string, number>;
};

export type IndicatorPoint = {
  timeSec: number;
  time: string;
  values: Record<string, number>;
};

export interface IndicatorConfig {
  id: string;
  type: number;
  name: string;
  params: Record<string, number>;
  persist: boolean;
  visible: boolean;
  color: string;
  lineWidth?: number;
}

/**
 * Индикаторы, которые умеет считать пайплайн (indicators-manage + calculation
 * воркер). Список статический: RPC `ListSupported` относился к старому
 * синхронному сервису `Indicators`, которого больше нет в proto — расчёт
 * теперь асинхронный, через TA-Lib воркер и ClickHouse (см. computeIndicatorForDisplay).
 */
export const FALLBACK_INDICATORS: IndicatorInfo[] = [
  { type: 1, name: "RSI", minBars: 14, defaultParams: { period: 14 } },
  { type: 2, name: "SMA", minBars: 20, defaultParams: { period: 20 } },
  { type: 3, name: "EMA", minBars: 20, defaultParams: { period: 20 } },
  {
    type: 4,
    name: "MACD",
    minBars: 26,
    defaultParams: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
  },
  {
    type: 5,
    name: "BB",
    minBars: 20,
    defaultParams: { period: 20, nbdevup: 2, nbdevdn: 2 },
  },
];

export async function listSupportedIndicators(): Promise<IndicatorInfo[]> {
  return FALLBACK_INDICATORS;
}

/** Порядок значений в `metrics` (см. TrB_indicators.indicator_values) для поддерживаемых типов. */
export const INDICATOR_METRIC_KEYS: Record<number, string[]> = {
  1: ["value"], // RSI
  2: ["value"], // SMA
  3: ["value"], // EMA
  4: ["value", "signal", "hist"], // MACD (первое поле — macd-линия, имя "value" для indicatorChart.ts)
  5: ["upper", "middle", "lower"], // Bollinger Bands
};

function applyIndicatorSettings(type: number, params: Record<string, number>) {
  const settings = newIndicatorSettingsMessage();
  switch (type) {
    case 1: {
      const p = newRsiParams();
      p.setPeriod(params.period ?? 14);
      settings.setRsi(p);
      return settings;
    }
    case 2: {
      const p = newSmaParams();
      p.setPeriod(params.period ?? 20);
      settings.setSma(p);
      return settings;
    }
    case 3: {
      const p = newEmaParams();
      p.setPeriod(params.period ?? 20);
      settings.setEma(p);
      return settings;
    }
    case 4: {
      const p = newMacdParams();
      p.setFastPeriod(params.fastperiod ?? 12);
      p.setSlowPeriod(params.slowperiod ?? 26);
      p.setSignalPeriod(params.signalperiod ?? 9);
      settings.setMacd(p);
      return settings;
    }
    case 5: {
      const p = newBbandsParams();
      p.setPeriod(params.period ?? 20);
      p.setNbDevUp(params.nbdevup ?? 2);
      p.setNbDevDn(params.nbdevdn ?? 2);
      settings.setBbands(p);
      return settings;
    }
    default:
      throw new Error(`Индикатор типа ${type} не поддерживается`);
  }
}

/**
 * Регистрирует расчёт индикатора в indicators-manage: пишет assignment
 * (TrB_indicators.indicator_assignments) и ставит задачу расчёта в NATS.
 * Возвращает param_hash — по нему считанные значения появятся в
 * TrB_indicators.indicator_values (см. computeIndicatorForDisplay).
 */
export async function updateIndicatorSettings(params: {
  uid: string;
  interval: number;
  type: number;
  indicatorParams: Record<string, number>;
  from: Date;
  to: Date;
}): Promise<number> {
  const settings = applyIndicatorSettings(params.type, params.indicatorParams);
  const msg = newSettingsMessage();
  msg.setUid(params.uid);
  msg.setInterval(params.interval);
  msg.setSettings(settings);
  const fromTs = parseTimestamp(params.from);
  const toTs = parseTimestamp(params.to);
  if (fromTs) msg.setStart(fromTs);
  if (toTs) msg.setEnd(toTs);
  try {
    const resp = await indicatorSettingsClient.updateSettings(msg);
    return resp.getHash();
  } catch (err) {
    throw wrapRpcError(err);
  }
}
