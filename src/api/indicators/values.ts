/**
 * Чтение уже посчитанных значений индикатора из TrB_indicators.indicator_values.
 *
 * Отдельного RPC для чтения нет (старый синхронный `Indicators` сервис убрали
 * из proto вместе с миграцией на асинхронный пайплайн NATS + TA-Lib воркер +
 * ClickHouse — см. internal/services/indicators/calculation в TrB_backend).
 * Единственный путь наружу — общий `ClickHouse_Admin.ExecuteQuery` (тот же,
 * что использует админка ClickHouse), которым и пользуется этот модуль.
 */
import { executeClickHouseQuery } from "../clickhouse";

const VALUES_TABLE = "TrB_indicators.indicator_values";
/** Как в internal/services/strategy/engine/specmod/ch_indicators.py: последние
 * бары окна могут быть неполными/в разогреве — это нормально. */
const COVERAGE_SLACK_SEC = 3 * 86400;
const POLL_INTERVAL_MS = 1000;
/** Реальный расчёт (TA-Lib воркер) обычно укладывается в секунды даже на
 * больших окнах. Узкое/островное окно короче периода прогрева индикатора
 * никогда не наберёт покрытие (TA-Lib не пишет ни одной валидной точки) —
 * не стоит ждать долго и тем более считать это ошибкой. */
const POLL_TIMEOUT_MS = 20_000;

function parseMetricsArray(raw: string | undefined): number[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((s) => Number.parseFloat(s.trim()));
}

async function maxIndicatorTimeSec(paramHash: number): Promise<number | null> {
  const res = await executeClickHouseQuery(
    `SELECT toUnixTimestamp(max(time)) FROM ${VALUES_TABLE} WHERE param_hash = ${paramHash}`,
    1,
  );
  const raw = res.rows[0]?.[0];
  if (!raw || raw === "NULL") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Ждёт, пока расчёт (NATS + TA-Lib воркер) дойдёт почти до конца окна.
 * Возвращает false по таймауту вместо ошибки: узкое окно (короче периода
 * прогрева индикатора, например конец истории или отдельный "остров" данных)
 * никогда не наберёт покрытие — это не сбой, а корректный пустой результат.
 */
export async function waitForIndicatorCoverage(
  paramHash: number,
  toSecTarget: number,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? POLL_TIMEOUT_MS;
  const pollMs = opts?.pollMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const maxT = await maxIndicatorTimeSec(paramHash);
    if (maxT != null && maxT >= toSecTarget - COVERAGE_SLACK_SEC) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export type IndicatorValueRow = { timeSec: number; metrics: number[] };

/** Готовый ряд по хэшу настроек за окно [fromSec, toSec]. */
export async function fetchIndicatorValueRows(
  paramHash: number,
  fromSec: number,
  toSec: number,
): Promise<IndicatorValueRow[]> {
  const query = `
    SELECT toUnixTimestamp(time) AS t, metrics
    FROM ${VALUES_TABLE}
    WHERE param_hash = ${paramHash}
      AND time >= toDateTime64(${Math.floor(fromSec)}, 3)
      AND time <= toDateTime64(${Math.floor(toSec)}, 3)
    ORDER BY time
  `;
  const res = await executeClickHouseQuery(query, 50_000);
  return res.rows.map((row) => ({
    timeSec: Math.floor(Number(row[0])),
    metrics: parseMetricsArray(row[1]),
  }));
}
