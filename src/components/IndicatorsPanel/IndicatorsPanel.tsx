import { useEffect, useMemo, useState } from "react";
import { INTERVAL_1DAY, INTERVAL_1MIN } from "../../api/scheduler";
import {
  FALLBACK_INDICATORS,
  computeForInstrument,
  listSupportedIndicators,
  type ComputeResult,
  type IndicatorInfo,
} from "../../api/indicators";
import { useNotify } from "../../notifications";
import InstrumentSelect, { type PickedInstrument } from "../CandlesPanel/InstrumentSelect";
import "../SchedulerPanel/SchedulerPanel.css";
import "../../styles/tables.css";
import "./IndicatorsPanel.css";

const PREVIEW_LIMIT = 200;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultRange(interval: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (interval === INTERVAL_1DAY) from.setUTCDate(from.getUTCDate() - 180);
  else from.setUTCDate(from.getUTCDate() - 7);
  return { from: toLocalInput(from), to: toLocalInput(to) };
}

function formatPointTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU");
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
}

export default function IndicatorsPanel() {
  const notify = useNotify();
  const [instrument, setInstrument] = useState<PickedInstrument | null>(null);
  const [interval, setInterval] = useState(INTERVAL_1MIN);
  const [indicators, setIndicators] = useState<IndicatorInfo[]>(FALLBACK_INDICATORS);
  const [type, setType] = useState(FALLBACK_INDICATORS[0].type);
  const [params, setParams] = useState<Record<string, string>>({ period: "14" });
  const [range, setRange] = useState(() => defaultRange(INTERVAL_1MIN));
  const [persist, setPersist] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [listHint, setListHint] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ComputeResult | null>(null);

  const selected = indicators.find((item) => item.type === type) ?? indicators[0];

  useEffect(() => {
    let cancelled = false;
    void listSupportedIndicators()
      .then((items) => {
        if (cancelled || items.length === 0) return;
        setIndicators(items);
        setType(items[0].type);
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(items[0].defaultParams)) {
          next[key] = String(value);
        }
        setParams(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setListHint(
            `ListSupported недоступен (${err instanceof Error ? err.message : String(err)}). Показан локальный список.`,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setRange(defaultRange(interval));
  }, [interval]);

  const valueKeys = useMemo(() => {
    if (!result?.points.length) return [] as string[];
    const keys = new Set<string>();
    for (const point of result.points) {
      for (const key of Object.keys(point.values)) keys.add(key);
    }
    return [...keys];
  }, [result]);

  const preview = useMemo(() => {
    if (!result) return [];
    return result.points.slice(-PREVIEW_LIMIT);
  }, [result]);

  const onTypeChange = (nextType: number) => {
    setType(nextType);
    const info = indicators.find((item) => item.type === nextType);
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(info?.defaultParams ?? {})) {
      next[key] = String(value);
    }
    setParams(next);
  };

  const run = async () => {
    if (!instrument) {
      setError("Выберите инструмент");
      return;
    }
    const from = new Date(range.from);
    const to = new Date(range.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      setError("Некорректный диапазон дат");
      return;
    }
    const indicatorParams: Record<string, number> = {};
    for (const [key, raw] of Object.entries(params)) {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) {
        setError(`Параметр ${key} должен быть числом`);
        return;
      }
      indicatorParams[key] = n;
    }
    setError("");
    setRunning(true);
    try {
      const computed = await computeForInstrument({
        uid: instrument.uid,
        interval,
        from,
        to,
        type,
        indicatorParams,
        persist,
      });
      setResult(computed);
      notify.success(`${selected?.name ?? type}: ${computed.points.length} точек`, persist ? "Сохранено" : "Посчитано");
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="panel-page indicators-panel">
      <header className="scheduler-header">
        <p className="eyebrow">Сервисы</p>
        <h1>Индикаторы</h1>
        <p>
          Тестовый расчёт через <code>ComputeForInstrument</code>: один проход TA-Lib
          по всему ряду. В ответе — хвост; полный ряд пишется в{" "}
          <code>TrB.indicator_settings</code> / <code>TrB.indicator_values</code> при сохранении.
        </p>
      </header>

      <div className="filters-bar">
        <div className="filters-row filters-fields">
          <InstrumentSelect value={instrument} onChange={setInstrument} />
          <label className="filter-field">
            <span>Интервал</span>
            <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
              <option value={INTERVAL_1MIN}>1 мин</option>
              <option value={INTERVAL_1DAY}>1 день</option>
            </select>
          </label>
          <label className="filter-field">
            <span>Индикатор</span>
            <select
              value={type}
              disabled={loadingList}
              onChange={(e) => onTypeChange(Number(e.target.value))}
            >
              {indicators.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.name} (min {item.minBars})
                </option>
              ))}
            </select>
          </label>
          {Object.keys(params).map((key) => (
            <label key={key} className="filter-field">
              <span>{key}</span>
              <input
                value={params[key]}
                onChange={(e) => setParams((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="filter-field">
            <span>С</span>
            <input
              type="datetime-local"
              value={range.from}
              onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
            />
          </label>
          <label className="filter-field">
            <span>По</span>
            <input
              type="datetime-local"
              value={range.to}
              onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
            />
          </label>
        </div>
        <div className="filters-row filters-actions">
          <label className="indicators-persist">
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => setPersist(e.target.checked)}
            />
            Сохранить в ClickHouse
          </label>
          <button type="button" className="btn primary" disabled={running} onClick={() => void run()}>
            {running ? "Считаем…" : persist ? "Посчитать и сохранить" : "Посчитать"}
          </button>
        </div>
        {listHint ? <p className="hint">{listHint}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      {result ? (
        <div className="indicators-result">
          <p className="filters-meta">
            {selected?.name ?? result.type}: {result.points.length} точек
            {result.points.length > PREVIEW_LIMIT
              ? ` (показаны последние ${PREVIEW_LIMIT})`
              : ""}
            {Object.keys(result.params).length
              ? ` · ${Object.entries(result.params)
                  .map(([key, value]) => `${key}=${value}`)
                  .join(", ")}`
              : ""}
          </p>
          <div className="table-scroll table-scroll-fill">
            <table className="data-table data-table-fill">
              <thead>
                <tr>
                  <th>Время</th>
                  {valueKeys.map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((point, idx) => (
                  <tr key={`${point.time}-${idx}`}>
                    <td>{formatPointTime(point.time)}</td>
                    {valueKeys.map((key) => (
                      <td key={key}>{formatValue(point.values[key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="hint">Выберите инструмент и нажмите «Посчитать».</p>
      )}
    </section>
  );
}
