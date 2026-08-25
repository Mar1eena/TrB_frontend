import {
  listInstruments,
  listSchedulerTargets,
  syncSchedulerTargets,
} from "../data";

type Instrument = {
  uid: string;
  figi: string;
  ticker: string;
  name: string;
  class_code?: string;
  isin?: string;
  lot?: number;
  currency?: string;
  exchange?: string;
  sector?: string;
  trading_status?: number;
  liquidity_flag?: boolean;
  short_enabled_flag?: boolean;
  api_trade_available_flag?: boolean;
  buy_available_flag?: boolean;
  sell_available_flag?: boolean;
  first_1min_candle_date?: string;
  first_1day_candle_date?: string;
};

export type SchedulerTarget = {
  uid: string;
  interval: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
  ticker?: string;
  name?: string;
  figi?: string;
};

export type SelectedInstrument = {
  uid: string;
  figi: string;
  ticker: string;
  name: string;
  intervals: Record<number, boolean>;
};

export const INTERVAL_1MIN = 1;
export const INTERVAL_1DAY = 5;

export const CANDLE_INTERVALS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "1 мин", short: "1м" },
  { value: 6, label: "2 мин", short: "2м" },
  { value: 7, label: "3 мин", short: "3м" },
  { value: 2, label: "5 мин", short: "5м" },
  { value: 8, label: "10 мин", short: "10м" },
  { value: 3, label: "15 мин", short: "15м" },
  { value: 9, label: "30 мин", short: "30м" },
  { value: 4, label: "1 час", short: "1ч" },
  { value: 10, label: "2 часа", short: "2ч" },
  { value: 11, label: "4 часа", short: "4ч" },
  { value: 5, label: "1 день", short: "1д" },
  { value: 12, label: "неделя", short: "нед" },
  { value: 13, label: "месяц", short: "мес" },
];

/** Интервалы, которыми управляет планировщик: минутные и дневные свечи. */
export const SCHEDULER_INTERVALS = CANDLE_INTERVALS.filter(
  (iv) => iv.value === INTERVAL_1MIN || iv.value === INTERVAL_1DAY,
);

export function groupTargets(targets: SchedulerTarget[]): SelectedInstrument[] {
  const map = new Map<string, SelectedInstrument>();
  for (const t of targets) {
    let row = map.get(t.uid);
    if (!row) {
      row = {
        uid: t.uid,
        figi: t.figi || "",
        ticker: t.ticker || "",
        name: t.name || t.uid,
        intervals: {},
      };
      map.set(t.uid, row);
    }
    if (t.figi) row.figi = t.figi;
    if (t.ticker) row.ticker = t.ticker;
    if (t.name) row.name = t.name;
    row.intervals[t.interval] = t.enabled;
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.ticker || a.name).localeCompare(b.ticker || b.name, "ru"),
  );
}

export async function fetchInstruments(
  q = "",
  limit = 2000,
  opts?: { lite?: boolean },
): Promise<Instrument[]> {
  return listInstruments(q, limit, opts);
}

export async function fetchTargets(): Promise<SchedulerTarget[]> {
  return listSchedulerTargets();
}

export async function syncTargets(
  instruments: { uid: string; intervals: number[] }[],
  opts?: { allowEmpty?: boolean },
): Promise<void> {
  await syncSchedulerTargets(instruments, opts);
}

export function hasCandleDate(value?: string): boolean {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.getFullYear() >= 1971;
}

export function formatDate(value?: string): string {
  if (!hasCandleDate(value)) return "—";
  return new Date(value as string).toLocaleDateString("ru-RU");
}

/** Локальная дата-время с миллисекундами: DD.MM.YYYY HH:mm:ss.SSS */
export function formatDateTimeMs(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1971) return "—";
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}
