import type { StrategySpec } from "../../api/strategy";

export type SpecTemplate = { id: string; label: string; description: string; spec: StrategySpec };

// Шаблоны в camelCase + строковые enum — формат, который принимает
// grpc_json_transcoder и который отдаёт бэкенд при чтении.

export const SPEC_TEMPLATES: SpecTemplate[] = [
  {
    id: "rsi-mean-reversion",
    label: "RSI возврат к среднему",
    description: "Вход при RSI(14) < 30, выход при RSI(14) > 55. Стоп 5%.",
    spec: {
      version: 1,
      warmupBars: 50,
      indicators: [{ id: "rsi", settings: { rsi: { period: 14 } } }],
      entryLong: {
        compare: {
          left: { indicatorId: "rsi" },
          op: "COMPARE_OP_LT",
          right: { constant: 30 },
        },
      },
      exitLong: {
        compare: {
          left: { indicatorId: "rsi" },
          op: "COMPARE_OP_GT",
          right: { constant: 55 },
        },
      },
      sizing: { percentEquity: 0.95, maxOpenPositions: 1 },
      risk: { stopLossPct: 0.05, takeProfitPct: 0.12 },
    },
  },
  {
    id: "sma-crossover",
    label: "Пересечение SMA 50/200",
    description: "Golden/death cross: вход когда SMA(50) пересекает SMA(200) вверх.",
    spec: {
      version: 1,
      warmupBars: 220,
      indicators: [
        { id: "fast", settings: { sma: { period: 50 } } },
        { id: "slow", settings: { sma: { period: 200 } } },
      ],
      entryLong: {
        compare: {
          left: { indicatorId: "fast" },
          op: "COMPARE_OP_CROSSES_ABOVE",
          right: { indicatorId: "slow" },
        },
      },
      exitLong: {
        compare: {
          left: { indicatorId: "fast" },
          op: "COMPARE_OP_CROSSES_BELOW",
          right: { indicatorId: "slow" },
        },
      },
      sizing: { percentEquity: 0.98, maxOpenPositions: 1 },
      risk: { stopLossPct: 0.08 },
    },
  },
  {
    id: "macd-trend",
    label: "MACD тренд",
    description: "Вход когда линия MACD пересекает сигнальную вверх и цена выше EMA(200).",
    spec: {
      version: 1,
      warmupBars: 220,
      indicators: [
        { id: "macd", settings: { macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } }, outputKey: "macd" },
        { id: "signal", settings: { macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } }, outputKey: "signal" },
        { id: "ema200", settings: { ema: { period: 200 } } },
      ],
      entryLong: {
        all: {
          operands: [
            {
              compare: {
                left: { indicatorId: "macd" },
                op: "COMPARE_OP_CROSSES_ABOVE",
                right: { indicatorId: "signal" },
              },
            },
            {
              compare: {
                left: { price: "PRICE_CLOSE" },
                op: "COMPARE_OP_GT",
                right: { indicatorId: "ema200" },
              },
            },
          ],
        },
      },
      exitLong: {
        compare: {
          left: { indicatorId: "macd" },
          op: "COMPARE_OP_CROSSES_BELOW",
          right: { indicatorId: "signal" },
        },
      },
      sizing: { percentEquity: 0.95, maxOpenPositions: 1 },
      risk: { stopLossPct: 0.06, trailingStop: true, trailingPct: 0.08 },
    },
  },
];

export const EMPTY_SPEC: StrategySpec = SPEC_TEMPLATES[0].spec;

export const DEFAULT_SEARCH_SPACE = [
  { path: "indicators.rsi.settings.rsi.period", ints: { min: 5, max: 30, step: 1 } },
  { path: "entryLong.compare.right.constant", floats: { min: 15, max: 40 } },
  { path: "risk.stopLossPct", floats: { min: 0.02, max: 0.12 } },
];

export const DEFAULT_STRUCTURE = {
  indicatorPalette: ["rsi", "sma", "ema", "atr"],
  maxConditions: 4,
  maxDepth: 3,
  allowedOps: ["COMPARE_OP_GT", "COMPARE_OP_LT", "COMPARE_OP_GE", "COMPARE_OP_LE"],
  mutateStructure: true,
};
