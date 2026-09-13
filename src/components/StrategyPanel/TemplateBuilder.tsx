// Конструктор StrategyTemplate — структурный поиск Optuna: вместо (точнее —
// в дополнение к) тюнинга скаляров фиксированного baseSpec, движок сам
// собирает indicators/entry_long/exit_long на каждом трайле из палитры
// индикаторов (см. engine/search/compose.py). UI намеренно копирует
// SearchStructureBuilder (генетический поиск, SearchBuilders.tsx) — палитра
// индикаторов там устроена так же (StructureSpace.indicatorPalette), разница
// только в наборе числовых ограничений (Optuna не умеет "мутировать дерево",
// поэтому здесь maxIndicators/maxConditionsEntry/maxConditionsExit вместо
// maxDepth/mutateStructure) и в диапазонах гиперпараметров по типу индикатора.

import { useMemo, useState } from "react";
import type * as api from "../../api/strategysearch";
import { FieldLabel, InfoTip } from "./InfoTip";
import { INDICATORS, INDICATOR_BY_KEY } from "./specSchema.generated";
import { categoryName, indDesc, indName, paramDesc, paramName } from "./specI18n";
import { OP_LABELS, roundTo } from "./SearchBuilders";

export type TemplateFieldRange = { name: string; kind: "int" | "float"; min: number; max: number; step?: number };

export type TemplateForm = {
  enabled: boolean;
  indicatorPalette: string[];
  maxIndicators: number;
  maxConditionsEntry: number;
  maxConditionsExit: number; // 0 => exit строится автоматически (обратное условие входа)
  allowedOps: string[];
  // индикаторный тип -> диапазоны его числовых параметров (enum-параметры
  // структурный поиск не варьирует — как maType и т.п., это отдельная задача)
  typeRanges: Record<string, TemplateFieldRange[]>;
};

export const DEFAULT_TEMPLATE_FORM: TemplateForm = {
  enabled: false,
  indicatorPalette: [],
  maxIndicators: 3,
  maxConditionsEntry: 2,
  maxConditionsExit: 0,
  allowedOps: ["COMPARE_OP_GT", "COMPARE_OP_LT", "COMPARE_OP_CROSSES_ABOVE", "COMPARE_OP_CROSSES_BELOW"],
  typeRanges: {},
};

const TPL_DESC = {
  maxIndicators: "Верхняя граница числа индикаторов в одной собранной стратегии.",
  maxConditionsEntry: "Верхняя граница числа условий (через И), из которых движок соберёт правило входа.",
  maxConditionsExit: "То же для выхода. 0 — выход строится автоматически (то же условие в обратную сторону).",
  allowedOps: "Какие операции сравнения движок может использовать между индикатором и ценой/другим индикатором.",
  palette: "Из каких типов индикаторов движок вправе собирать стратегию — комбинации, число и параметры выбирает сам Optuna.",
};

function defaultFieldRanges(key: string): TemplateFieldRange[] {
  const def = INDICATOR_BY_KEY[key];
  if (!def) return [];
  return def.params
    .filter((p) => p.type !== "enum")
    .map((p): TemplateFieldRange => {
      const isInt = p.type === "int";
      const d = p.default || 14;
      const min = isInt ? Math.max(2, Math.floor(d / 3)) : roundTo(d * 0.3, 4);
      const max = isInt ? Math.max(min + 1, Math.ceil(d * 3)) : roundTo(Math.max(d * 3, 0.01), 4);
      return { name: p.name, kind: isInt ? "int" : "float", min, max, step: isInt ? 1 : undefined };
    });
}

// Обратное преобразование — восстановление формы из сохранённого пресета.
export function templateFromApi(t: api.StrategyTemplate | undefined): TemplateForm {
  if (!t || !t.indicatorPalette?.length) return DEFAULT_TEMPLATE_FORM;
  const typeRanges: Record<string, TemplateFieldRange[]> = {};
  for (const tr of t.typeRanges ?? []) {
    typeRanges[tr.indicatorType] = tr.fieldRanges.map((f): TemplateFieldRange => {
      if (f.ints) {
        return {
          name: f.path,
          kind: "int",
          min: Number(f.ints.min),
          max: Number(f.ints.max),
          step: f.ints.step != null ? Number(f.ints.step) : undefined,
        };
      }
      return { name: f.path, kind: "float", min: f.floats?.min ?? 0, max: f.floats?.max ?? 1, step: f.floats?.step };
    });
  }
  return {
    enabled: true,
    indicatorPalette: t.indicatorPalette,
    maxIndicators: t.maxIndicators || DEFAULT_TEMPLATE_FORM.maxIndicators,
    maxConditionsEntry: t.maxConditionsEntry || DEFAULT_TEMPLATE_FORM.maxConditionsEntry,
    maxConditionsExit: t.maxConditionsExit ?? 0,
    allowedOps: t.allowedOps?.length ? t.allowedOps : DEFAULT_TEMPLATE_FORM.allowedOps,
    typeRanges,
  };
}

export function templateToJson(form: TemplateForm): api.StrategyTemplate | undefined {
  if (!form.enabled) return undefined;
  const typeRanges: api.IndicatorTypeRanges[] = form.indicatorPalette
    .map((type) => ({
      indicatorType: type,
      fieldRanges: (form.typeRanges[type] ?? []).map(
        (f): api.ParamRange =>
          f.kind === "int"
            ? { path: f.name, ints: { min: f.min, max: f.max, ...(f.step && f.step > 0 ? { step: f.step } : {}) } }
            : { path: f.name, floats: { min: f.min, max: f.max } },
      ),
    }))
    .filter((t) => t.fieldRanges.length > 0);
  return {
    indicatorPalette: form.indicatorPalette,
    maxIndicators: form.maxIndicators,
    maxConditionsEntry: form.maxConditionsEntry,
    maxConditionsExit: form.maxConditionsExit || undefined,
    allowedOps: form.allowedOps,
    typeRanges,
  };
}

const CATEGORIES = Array.from(new Set(INDICATORS.map((i) => i.category)));

export function TemplateBuilder({ value, onChange }: { value: TemplateForm; onChange: (v: TemplateForm) => void }) {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [query, setQuery] = useState("");

  const toggleOp = (op: string) => {
    const next = value.allowedOps.includes(op)
      ? value.allowedOps.filter((x) => x !== op)
      : [...value.allowedOps, op];
    onChange({ ...value, allowedOps: next });
  };

  const togglePaletteItem = (key: string) => {
    if (value.indicatorPalette.includes(key)) {
      const { [key]: _removed, ...restRanges } = value.typeRanges;
      onChange({
        ...value,
        indicatorPalette: value.indicatorPalette.filter((x) => x !== key),
        typeRanges: restRanges,
      });
    } else {
      onChange({
        ...value,
        indicatorPalette: [...value.indicatorPalette, key],
        typeRanges: { ...value.typeRanges, [key]: value.typeRanges[key] ?? defaultFieldRanges(key) },
      });
    }
  };

  const updateFieldRange = (type: string, idx: number, patch: Partial<TemplateFieldRange>) => {
    const rows = value.typeRanges[type] ?? [];
    onChange({
      ...value,
      typeRanges: { ...value.typeRanges, [type]: rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) },
    });
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
        <label className="strategy-inline-check">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          />
          Поиск по палитре индикаторов
        </label>
        <InfoTip text="Помимо подбора гиперпараметров фиксированной стратегии выше, движок сам скомпонует индикаторы/условия входа-выхода из палитры ниже. Sizing/risk/warmup по-прежнему берутся из стратегии слева — переопределяются только индикаторы и entry_long/exit_long." />
      </div>

      {!value.enabled ? null : (
        <>
          <div className="search-struct-grid">
            <label className="filter-field">
              <FieldLabel desc={TPL_DESC.maxIndicators}>Макс. индикаторов</FieldLabel>
              <input
                type="number"
                min={1}
                value={value.maxIndicators}
                onChange={(e) => onChange({ ...value, maxIndicators: Number(e.target.value) })}
              />
            </label>
            <label className="filter-field">
              <FieldLabel desc={TPL_DESC.maxConditionsEntry}>Макс. условий входа</FieldLabel>
              <input
                type="number"
                min={1}
                value={value.maxConditionsEntry}
                onChange={(e) => onChange({ ...value, maxConditionsEntry: Number(e.target.value) })}
              />
            </label>
            <label className="filter-field">
              <FieldLabel desc={TPL_DESC.maxConditionsExit}>Макс. условий выхода</FieldLabel>
              <input
                type="number"
                min={0}
                placeholder="0 = авто"
                value={value.maxConditionsExit}
                onChange={(e) => onChange({ ...value, maxConditionsExit: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="search-chip-group">
            <span className="search-chip-label">
              Операции сравнения
              <InfoTip text={TPL_DESC.allowedOps} />
            </span>
            <div className="search-chips">
              {Object.entries(OP_LABELS).map(([op, label]) => (
                <label key={op} className={`search-chip ${value.allowedOps.includes(op) ? "is-on" : ""}`}>
                  <input type="checkbox" checked={value.allowedOps.includes(op)} onChange={() => toggleOp(op)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="search-chip-group">
            <span className="search-chip-label">
              Палитра индикаторов ({value.indicatorPalette.length})
              <InfoTip text={TPL_DESC.palette} />
            </span>

            {value.indicatorPalette.length > 0 ? (
              <div className="search-chips">
                {value.indicatorPalette.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="search-chip is-on"
                    onClick={() => togglePaletteItem(k)}
                    title="Убрать из палитры"
                  >
                    {indName(k)} ×
                  </button>
                ))}
              </div>
            ) : (
              <p className="hint">Не выбрано ни одного индикатора — добавьте хотя бы один, иначе поиск не запустится.</p>
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
                  <label key={ind.key} className={`search-ind-item ${value.indicatorPalette.includes(ind.key) ? "is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={value.indicatorPalette.includes(ind.key)}
                      onChange={() => togglePaletteItem(ind.key)}
                    />
                    <span className="search-ind-name">{indName(ind.key)}</span>
                    <InfoTip text={indDesc(ind.key) || ind.labelEn || ind.key} below />
                  </label>
                ))}
                {filtered.length === 0 ? <p className="hint">Ничего не найдено.</p> : null}
              </div>
            </details>
          </div>

          {value.indicatorPalette.some((k) => (value.typeRanges[k] ?? []).length > 0) ? (
            <div className="search-space-rows">
              <div className="search-space-row search-space-row--head">
                <span>Параметр</span>
                <span>Тип</span>
                <span>Мин</span>
                <span>Макс</span>
                <span>Шаг</span>
                <span />
              </div>
              {value.indicatorPalette.flatMap((type) =>
                (value.typeRanges[type] ?? []).map((row, idx) => (
                  <div key={`${type}.${row.name}`} className="search-space-row">
                    <span className="search-space-param">
                      {indName(type)} · {paramName(row.name)}
                      <InfoTip text={paramDesc(row.name) || `Параметр ${row.name} индикатора ${indName(type)}.`} />
                    </span>
                    <span className="mono">{row.kind === "int" ? "целый" : "дробный"}</span>
                    <input
                      type="number"
                      className="search-space-num"
                      value={row.min}
                      onChange={(e) => updateFieldRange(type, idx, { min: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      className="search-space-num"
                      value={row.max}
                      onChange={(e) => updateFieldRange(type, idx, { max: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      className="search-space-num"
                      placeholder="—"
                      disabled={row.kind !== "int"}
                      value={row.step ?? ""}
                      onChange={(e) => updateFieldRange(type, idx, { step: e.target.value ? Number(e.target.value) : undefined })}
                    />
                    <span />
                  </div>
                )),
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
