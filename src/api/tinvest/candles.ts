import type { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb";
import type { UTCTimestamp } from "lightweight-charts";
import type { HistoricCandleRow } from "@marleena/trb-proto/clickhouse/clickhouse_pb";
import { num, parseTimestamp } from "../common/converters";
import { wrapRpcError } from "../common/errors";
import { clickhouseClient, newListCandlesRequest, setNewestFirst } from "../clickhouse/client";

export const PAGE_CANDLES = 500;
export const PREFETCH_CANDLES = 100;
export const MAX_PAGE_CANDLES = 8000;

/** Порог догрузки: не меньше 100 и не меньше одного видимого экрана. */
export function prefetchForVisible(visibleCount: number): number {
  const visible = Math.max(1, Math.ceil(visibleCount));
  return Math.max(PREFETCH_CANDLES, visible);
}

/** Размер порции: минимум 500, растёт с масштабом, не больше лимита ClickHouse. */
export function pageSizeForVisible(visibleCount: number): number {
  const visible = Math.max(1, Math.ceil(visibleCount));
  const prefetch = prefetchForVisible(visible);
  return Math.min(MAX_PAGE_CANDLES, Math.max(PAGE_CANDLES, visible * 2 + prefetch));
}

export type CandleBar = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type IntervalMeta = {
  seconds: number;
  maxWindowSec: number;
  maxLimit: number;
};

const CH_MAX_LIMIT = MAX_PAGE_CANDLES;

function chInterval(seconds: number): IntervalMeta {
  return { seconds, maxWindowSec: seconds * CH_MAX_LIMIT, maxLimit: CH_MAX_LIMIT };
}

/** Лимиты одного запроса ListCandles (ClickHouse TrB.hct). */
export const INTERVAL_META: Record<number, IntervalMeta> = {
  1: chInterval(60),
  6: chInterval(120),
  7: chInterval(180),
  2: chInterval(300),
  8: chInterval(600),
  3: chInterval(900),
  9: chInterval(1800),
  4: chInterval(3600),
  10: chInterval(7200),
  11: chInterval(14400),
  5: chInterval(86400),
  12: chInterval(7 * 86400),
  13: chInterval(30 * 86400),
};

export function intervalMeta(interval: number): IntervalMeta {
  return INTERVAL_META[interval] ?? INTERVAL_META[1];
}

export function alignDown(unixSec: number, step: number): number {
  if (step <= 0) return Math.floor(unixSec);
  return Math.floor(unixSec / step) * step;
}

export type TimeSpan = { from: number; to: number };

export function mergeSpans(spans: TimeSpan[], step: number): TimeSpan[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const out: TimeSpan[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.from <= last.to + step) {
      last.to = Math.max(last.to, cur.to);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export function missingSpans(loaded: TimeSpan[], need: TimeSpan, step: number): TimeSpan[] {
  if (need.to < need.from) return [];
  const gaps: TimeSpan[] = [];
  let cursor = need.from;
  for (const span of mergeSpans(loaded, step)) {
    if (span.to < cursor) continue;
    if (span.from > need.to) break;
    if (span.from > cursor) {
      gaps.push({ from: cursor, to: Math.min(span.from - step, need.to) });
    }
    cursor = Math.max(cursor, span.to + step);
    if (cursor > need.to) return gaps.filter((g) => g.to >= g.from);
  }
  if (cursor <= need.to) {
    gaps.push({ from: cursor, to: need.to });
  }
  return gaps.filter((g) => g.to >= g.from);
}

export function splitSpan(
  span: TimeSpan,
  maxWindowSec: number,
  maxLimit: number,
  step: number,
): TimeSpan[] {
  const maxSec = Math.max(step, Math.min(maxWindowSec, maxLimit * step));
  const chunks: TimeSpan[] = [];
  let start = span.from;
  while (start <= span.to) {
    const end = Math.min(span.to, start + maxSec - step);
    chunks.push({ from: start, to: end });
    start = end + step;
  }
  return chunks;
}

function asUnix(ts?: Timestamp): number {
  if (!ts) return 0;
  return num(ts.getSeconds());
}

function asVolume(value: number | string | undefined): number {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? n : 0;
}

function toBar(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): CandleBar | null {
  if (time <= 0) return null;
  return {
    time: time as UTCTimestamp,
    open,
    high,
    low,
    close,
    volume,
  };
}

export function historicCandleToBar(candle: HistoricCandleRow): CandleBar | null {
  return toBar(
    asUnix(candle.getTime()),
    candle.getOpen(),
    candle.getHigh(),
    candle.getLow(),
    candle.getClose(),
    asVolume(candle.getVolume()),
  );
}

export async function fetchHistoricCandles(params: {
  instrumentId: string;
  interval: number;
  fromSec: number;
  toSec: number;
  limit?: number;
  newestFirst?: boolean;
}): Promise<CandleBar[]> {
  const nowSec = Date.now() / 1000;
  const fromSec = Math.min(params.fromSec, nowSec);
  const toSec = Math.min(Math.max(params.toSec, fromSec + 1), nowSec + 60);
  const fromTs = parseTimestamp(new Date(fromSec * 1000));
  const toTs = parseTimestamp(new Date(toSec * 1000));
  const limit = Math.min(CH_MAX_LIMIT, Math.max(1, params.limit ?? PAGE_CANDLES));
  try {
    const req = newListCandlesRequest();
    req.setUid(params.instrumentId);
    req.setInterval(params.interval);
    if (fromTs) req.setFrom(fromTs);
    if (toTs) req.setTo(toTs);
    req.setLimit(limit);
    setNewestFirst(req, Boolean(params.newestFirst));
    const res = await clickhouseClient.listCandles(req);
    const bars: CandleBar[] = [];
    for (const candle of res.getItemsList()) {
      const bar = historicCandleToBar(candle);
      if (bar) bars.push(bar);
    }
    return bars;
  } catch (err) {
    throw wrapRpcError(err);
  }
}
