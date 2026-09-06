// Визуальные конструкторы для генетического поиска — замена ручного JSON.
// Пространство параметров: список диапазонов по path в spec.
// Структура: палитра индикаторов (все 158 из proto), глубина дерева и операции.

import { useMemo, useState } from "react";
import type { StrategySpec } from "../../api/strategy";
import { FieldLabel, InfoTip } from "./InfoTip";
import { INDICATORS } from "./specSchema.generated";
import { categoryName, indDesc, indName } from "./specI18n";

export type SpaceRow = {
  path: string;
  kind: "int" | "float";
  min: number;
  max: number;
  step?: number;
};

export type SearchStructure = {
  indicatorPalette: string[];
  maxConditions: number;
  maxDepth: number;
  allowedOps: string[];
  mutateStructure: boolean;
};

export const DEFAULT_SPACE_ROWS: SpaceRow[] = [
  { path: "indicators.rsi.settings.rsi.period", kind: "int", min: 5, max: 30, step: 1 },
  { path: "entryLong.compare.right.constant", kind: "float", min: 15, max: 40 },
  { path: "risk.stopLossPct", kind: "float", min: 0.02, max: 0.12 },
];

export const DEFAULT_STRUCTURE_FORM: SearchStructure = {
  indicatorPalette: ["rsi", "sma", "ema", "atr"],
  maxConditions: 4,
  maxDepth: 3,
  allowedOps: ["COMPARE_OP_GT", "COMPARE_OP_LT", "COMPARE_OP_GE", "COMPARE_OP_LE"],
  mutateStructure: true,
};

const OP_LABELS: Record<string, string> = {
  COMPARE_OP_GT: "больше >",
  COMPARE_OP_GE: "больше или равно ≥",
  COMPARE_OP_LT: "меньше <",
  COMPARE_OP_LE: "меньше или равно ≤",
  COMPARE_OP_CROSSES_ABOVE: "пересекает вверх ↗",
  COMPARE_OP_CROSSES_BELOW: "пересекает вниз ↘",
};

const STRUCT_DESC = {
  maxConditions: "Максимум сравнений (листьев) в дереве входа/выхода, которое собирает поиск.",
  maxDepth: "Максимальная вложенность логических блоков И/ИЛИ в дереве правил.",
  mutateStructure:
    "Разрешить поиску менять саму форму дерева (добавлять/убирать условия), а не только числа в параметрах.",
  palette: "Из каких индикаторов поиску разрешено строить условия. Отметьте те, что имеют смысл для инструмента.",
  allowedOps: "Какие операции сравнения поиск может ставить между операндами.",
};

const CATEGORIES = Array.from(new Set(INDICATORS.map((i) => i.category)));

// --- сериализация в формат бэкенда ---

export function spaceRowsToJson(rows: SpaceRow[]): unknown[] {
  return rows
    .filter((r) => r.path.trim())
    .map((r) =>
      r.kind === "int"
        ? {
            path: r.path.trim(),
            ints: { min: r.min, max: r.max, ...(r.step && r.step > 0 ? { step: r.step } : {}) },
          }
        : { path: r.path.trim(), floats: { min: r.min, max: r.max } },
    );
}

export function structureToJson(s: SearchStructure): Record<string, unknown> {
  return {
    indicatorPalette: s.indicatorPalette,
    maxConditions: s.maxConditions,
    maxDepth: s.maxDepth,
    allowedOps: s.allowedOps,
    mutateStructure: s.mutateStructure,
  };
}

/** Кандидаты путей из выбранной базовой стратегии — подсказки в datalist. */
export function suggestedPaths(spec: StrategySpec | undefined): string[] {
  const out = new Set<string>([
    "risk.stopLossPct",
    "risk.takeProfitPct",
    "risk.trailingPct",
    "sizing.percentEquity",
    "entryLong.compare.right.constant",
    "exitLong.compare.right.constant",
  ]);
  const inds = Array.isArray(spec?.indicators)
    ? (spec.indicators as { settings?: Record<string, Record<string, number>> }[])
    : [];
  for (const ref of inds) {
    const key = Object.keys(ref.settings ?? {})[0];
    if (!key) continue;
    for (const p of Object.keys(ref.settings?.[key] ?? {})) {
      out.add(`indicators.${key}.settings.${key}.${p}`);
    }
  }
  return [...out];
}

export function SearchSpaceBuilder({
  rows,
  onChange,
  spec,
}: {
  rows: SpaceRow[];
  onChange: (rows: SpaceRow[]) => void;
  spec: StrategySpec | undefined;
}) {
  const paths = useMemo(() => suggestedPaths(spec), [spec]);
  const listId = "search-space-paths";

  const update = (i: number, patch: Partial<SpaceRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { path: "", kind: "float", min: 0, max: 1 }]);

  return (
    <div className="search-builder">
      <div className="search-builder-head">
        <span>
          Параметры для оптимизации
          <InfoTip text="Числа в стратегии, которые поиск будет перебирать в заданном диапазоне. Путь — адрес значения в spec." />
        </span>
        <button type="button" className="btn ghost sm" onClick={add}>
          + параметр
        </button>
      </div>
      <datalist id={listId}>
        {paths.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {rows.length === 0 ? (
        <p className="hint">Добавьте хотя бы один параметр — иначе поиску нечего перебирать.</p>
      ) : (
        <div className="search-space-rows">
          <div className="search-space-row search-space-row--head">
            <span>Путь в spec</span>
            <span>Тип</span>
            <span>Мин</span>
            <span>Макс</span>
            <span>Шаг</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="search-space-row">
              <input
                className="search-space-path"
                list={listId}
                placeholder="risk.stopLossPct"
                value={r.path}
                onChange={(e) => update(i, { path: e.target.value })}
              />
              <select
                value={r.kind}
                onChange={(e) => update(i, { kind: e.target.value as "int" | "float" })}
              >
                <option value="float">дробный</option>
                <option value="int">целый</option>
              </select>
              <input
                type="number"
                className="search-space-num"
                value={r.min}
                onChange={(e) => update(i, { min: Number(e.target.value) })}
              />
              <input
                type="number"
                className="search-space-num"
                value={r.max}
                onChange={(e) => update(i, { max: Number(e.target.value) })}
              />
              <input
                type="number"
                className="search-space-num"
                placeholder="—"
                disabled={r.kind !== "int"}
                value={r.step ?? ""}
                onChange={(e) =>
                  update(i, { step: e.target.value ? Number(e.target.value) : undefined })
                }
              />
              <button
                type="button"
                className="search-space-del"
                title="Удалить"
                onClick={() => remove(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchStructureBuilder({
  value,
  onChange,
}: {
  value: SearchStructure;
  onChange: (s: SearchStructure) => void;
}) {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [query, setQuery] = useState("");

  const toggle = (field: "indicatorPalette" | "allowedOps", item: string) => {
    const cur = value[field];
    const next = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
    onChange({ ...value, [field]: next });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INDICATORS.filter((ind) => {
      if (!q && ind.category !== category) return false;
      if (q) {
        return (
          ind.key.toLowerCase().includes(q) ||
          indName(ind.key).toLowerCase().includes(q) ||
          (ind.labelEn ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [category, query]);

  return (
    <div className="search-builder">
      <div className="search-builder-head">
        <span>
          Структура дерева правил
          <InfoTip text="Ограничения на деревья входа/выхода, которые собирает генетический поиск." />
        </span>
      </div>

      <div className="search-struct-grid">
        <label className="filter-field">
          <FieldLabel desc={STRUCT_DESC.maxConditions}>Макс. условий</FieldLabel>
          <input
            type="number"
            min={1}
            value={value.maxConditions}
            onChange={(e) => onChange({ ...value, maxConditions: Number(e.target.value) })}
          />
        </label>
        <label className="filter-field">
          <FieldLabel desc={STRUCT_DESC.maxDepth}>Макс. глубина</FieldLabel>
          <input
            type="number"
            min={1}
            value={value.maxDepth}
            onChange={(e) => onChange({ ...value, maxDepth: Number(e.target.value) })}
          />
        </label>
        <label className="strategy-inline-check">
          <input
            type="checkbox"
            checked={value.mutateStructure}
            onChange={(e) => onChange({ ...value, mutateStructure: e.target.checked })}
          />
          менять структуру дерева
          <InfoTip text={STRUCT_DESC.mutateStructure} />
        </label>
      </div>

      <div className="search-chip-group">
        <span className="search-chip-label">
          Операции сравнения
          <InfoTip text={STRUCT_DESC.allowedOps} />
        </span>
        <div className="search-chips">
          {Object.entries(OP_LABELS).map(([op, label]) => (
            <label
              key={op}
              className={`search-chip ${value.allowedOps.includes(op) ? "is-on" : ""}`}
            >
              <input
                type="checkbox"
                checked={value.allowedOps.includes(op)}
                onChange={() => toggle("allowedOps", op)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="search-chip-group">
        <span className="search-chip-label">
          Палитра индикаторов ({value.indicatorPalette.length})
          <InfoTip text={STRUCT_DESC.palette} />
        </span>

        {value.indicatorPalette.length > 0 ? (
          <div className="search-chips">
            {value.indicatorPalette.map((k) => (
              <button
                key={k}
                type="button"
                className="search-chip is-on"
                onClick={() => toggle("indicatorPalette", k)}
                title="Убрать из палитры"
              >
                {indName(k)} ×
              </button>
            ))}
          </div>
        ) : (
          <p className="hint">Не выбрано ни одного индикатора — поиск будет работать только с ценой.</p>
        )}

        <details className="search-palette">
          <summary>Добавить индикаторы ({INDICATORS.length} доступно)</summary>

          <div className="search-ind-filter">
            <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!!query.trim()}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryName(c)}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="поиск по всем индикаторам…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="search-ind-list">
            {filtered.map((ind) => (
              <label
                key={ind.key}
                className={`search-ind-item ${value.indicatorPalette.includes(ind.key) ? "is-on" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={value.indicatorPalette.includes(ind.key)}
                  onChange={() => toggle("indicatorPalette", ind.key)}
                />
                <span className="search-ind-name">{indName(ind.key)}</span>
                <InfoTip text={indDesc(ind.key) || ind.labelEn || ind.key} below />
              </label>
            ))}
            {filtered.length === 0 ? <p className="hint">Ничего не найдено.</p> : null}
          </div>
        </details>
      </div>
    </div>
  );
}
