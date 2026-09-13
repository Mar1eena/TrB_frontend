// Конструктор MarketSpace — рыночный поиск Optuna: вместо одного фиксированного
// инструмента/интервала/периода на весь SearchRun, движок сам выбирает их на
// каждом трайле из уже резолвленного manage (HistoricCandle.ListLastDownloads)
// списка market_candidates (см. engine/search/market.py). Здесь только режим
// (палитра/случайно), фильтры инструмента-интервала и длина окна бэктеста —
// сам список кандидатов резолвится на сервере при отправке поиска, фронт его
// не видит заранее.

import { useMemo, useState } from "react";
import type * as api from "../../api/strategysearch";
import { CANDLE_INTERVALS } from "../../api/scheduler";
import { FieldLabel, InfoTip } from "./InfoTip";

type Instrument = { uid: string; ticker: string; name: string };

export type MarketSpaceForm = {
  enabled: boolean;
  mode: api.MarketMode;
  uidFilter: string[];
  intervalFilter: number[];
  periodLengthDays: number;
  minHistoryDays: number;
};

export const DEFAULT_MARKET_FORM: MarketSpaceForm = {
  enabled: false,
  mode: "MARKET_MODE_RANDOM",
  uidFilter: [],
  intervalFilter: [],
  periodLengthDays: 90,
  minHistoryDays: 0,
};

const MKT_DESC = {
  mode: "Случайно — движок перебирает весь каталог инструментов (см. фильтр ниже — необязательное сужение). Из выбранных — строго список ниже.",
  periodLengthDays: "Длина окна истории для одного бэктеста. На каждом трайле окно сдвигается случайно внутри доступной истории инструмента.",
  minHistoryDays: "Инструменты короче этого — не рассматриваются при резолве кандидатов. 0 — не ограничено (кроме длины окна выше).",
  intervalFilter: "Пусто — любой интервал, для которого есть скачанная история.",
};

// Обратное преобразование — восстановление формы из сохранённого пресета.
export function marketSpaceFromApi(m: api.MarketSpace | undefined): MarketSpaceForm {
  if (!m) return DEFAULT_MARKET_FORM;
  return {
    enabled: true,
    mode: m.mode,
    uidFilter: m.uidFilter ?? [],
    intervalFilter: m.intervalFilter ?? [],
    periodLengthDays: m.periodLengthDays || DEFAULT_MARKET_FORM.periodLengthDays,
    minHistoryDays: m.minHistoryDays ?? 0,
  };
}

export function marketSpaceToJson(form: MarketSpaceForm): api.MarketSpace | undefined {
  if (!form.enabled) return undefined;
  return {
    mode: form.mode,
    uidFilter: form.uidFilter,
    intervalFilter: form.intervalFilter,
    periodLengthDays: form.periodLengthDays,
    minHistoryDays: form.minHistoryDays || undefined,
  };
}

export function MarketSpaceBuilder({
  value,
  onChange,
  instruments,
}: {
  value: MarketSpaceForm;
  onChange: (v: MarketSpaceForm) => void;
  instruments: Instrument[];
}) {
  const [query, setQuery] = useState("");

  const toggleUid = (uid: string) => {
    const next = value.uidFilter.includes(uid) ? value.uidFilter.filter((x) => x !== uid) : [...value.uidFilter, uid];
    onChange({ ...value, uidFilter: next });
  };
  const toggleInterval = (iv: number) => {
    const next = value.intervalFilter.includes(iv)
      ? value.intervalFilter.filter((x) => x !== iv)
      : [...value.intervalFilter, iv];
    onChange({ ...value, intervalFilter: next });
  };

  const byUid = useMemo(() => new Map(instruments.map((i) => [i.uid, i])), [instruments]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instruments.slice(0, 300);
    return instruments
      .filter((i) => i.uid.toLowerCase().includes(q) || i.ticker.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      .slice(0, 300);
  }, [instruments, query]);

  const uidListLabel = value.mode === "MARKET_MODE_PALETTE" ? "Инструменты для перебора" : "Ограничить каталог (необязательно)";

  return (
    <div className="search-builder">
      <div className="search-builder-head">
        <label className="strategy-inline-check">
          <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
          Рыночный поиск
        </label>
        <InfoTip text="Инструмент, интервал свечей и окно истории тоже становятся частью поиска — на каждом трайле движок сам выбирает их вместо фиксированных значений ниже." />
      </div>

      {!value.enabled ? null : (
        <>
          <div className="search-struct-grid">
            <label className="filter-field">
              <FieldLabel desc={MKT_DESC.mode}>Отбор инструментов</FieldLabel>
              <select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as api.MarketMode })}>
                <option value="MARKET_MODE_RANDOM">Случайно из каталога</option>
                <option value="MARKET_MODE_PALETTE">Из выбранных инструментов</option>
              </select>
            </label>
            <label className="filter-field">
              <FieldLabel desc={MKT_DESC.periodLengthDays}>Окно бэктеста, дней</FieldLabel>
              <input
                type="number"
                min={1}
                value={value.periodLengthDays}
                onChange={(e) => onChange({ ...value, periodLengthDays: Number(e.target.value) })}
              />
            </label>
            <label className="filter-field">
              <FieldLabel desc={MKT_DESC.minHistoryDays}>Мин. история, дней</FieldLabel>
              <input
                type="number"
                min={0}
                placeholder="не ограничено"
                value={value.minHistoryDays || ""}
                onChange={(e) => onChange({ ...value, minHistoryDays: e.target.value ? Number(e.target.value) : 0 })}
              />
            </label>
          </div>

          <div className="search-chip-group">
            <span className="search-chip-label">
              Интервалы свечей
              <InfoTip text={MKT_DESC.intervalFilter} />
            </span>
            <div className="search-chips">
              {CANDLE_INTERVALS.map((iv) => (
                <label key={iv.value} className={`search-chip ${value.intervalFilter.includes(iv.value) ? "is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={value.intervalFilter.includes(iv.value)}
                    onChange={() => toggleInterval(iv.value)}
                  />
                  {iv.short}
                </label>
              ))}
            </div>
          </div>

          <div className="search-chip-group">
            <span className="search-chip-label">{uidListLabel} ({value.uidFilter.length})</span>

            {value.uidFilter.length > 0 ? (
              <div className="search-chips">
                {value.uidFilter.map((uid) => (
                  <button key={uid} type="button" className="search-chip is-on" onClick={() => toggleUid(uid)} title="Убрать">
                    {byUid.get(uid)?.ticker ?? uid.slice(0, 10)} ×
                  </button>
                ))}
              </div>
            ) : value.mode === "MARKET_MODE_PALETTE" ? (
              <p className="hint">Выберите хотя бы один инструмент — иначе поиск не запустится.</p>
            ) : (
              <p className="hint">Не ограничено — рассматривается весь каталог с достаточной историей.</p>
            )}

            <details className="search-palette">
              <summary>Добавить инструменты ({instruments.length} доступно)</summary>
              <div className="search-ind-filter">
                <input type="search" placeholder="тикер, uid или название…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="search-ind-list">
                {filtered.map((i) => (
                  <label key={i.uid} className={`search-ind-item ${value.uidFilter.includes(i.uid) ? "is-on" : ""}`}>
                    <input type="checkbox" checked={value.uidFilter.includes(i.uid)} onChange={() => toggleUid(i.uid)} />
                    <span className="search-ind-name">
                      {i.ticker} — {i.name}
                    </span>
                  </label>
                ))}
                {filtered.length === 0 ? <p className="hint">Ничего не найдено.</p> : null}
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
