// Визуальные конструкторы для генетического поиска — замена ручного JSON.
// Пространство параметров: список диапазонов по path в spec.
// Структура: палитра индикаторов (все 158 из proto), глубина дерева и операции.

import { useMemo, useState } from "react";
import type { StrategySpec } from "../../api/strategy";
import { FieldLabel, InfoTip } from "./InfoTip";
import { INDICATORS, INDICATOR_BY_KEY } from "./specSchema.generated";
import { categoryName, indDesc, indName, paramDesc, paramName } from "./specI18n";

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

// Пути в spec — в snake_case: бэкенд разбирает их через protobuf-reflection
// (поля сообщений там stop_loss_pct, entry_long, …), camelCase молча не находится.
export const DEFAULT_SPACE_ROWS: SpaceRow[] = [
  { path: "risk.stop_loss_pct", kind: "float", min: 0.02, max: 0.12 },
  { path: "risk.take_profit_pct", kind: "float", min: 0.04, max: 0.3 },
];

// --- человекопонятный выбор параметров ---

export type ParamOption = {
  path: string;
  label: string;
  group: string;
  kind: "int" | "float";
  min: number;
  max: number;
  step?: number;
  desc: string;
};

const RISK_OPTIONS: ParamOption[] = [
  {
    path: "risk.stop_loss_pct", label: "Стоп-лосс, % от входа", group: "Риск и позиция",
    kind: "float", min: 0.01, max: 0.2,
    desc: "Доля цены входа, на которой позиция закрывается с убытком. 0.05 = 5%.",
  },
  {
    path: "risk.take_profit_pct", label: "Тейк-профит, % от входа", group: "Риск и позиция",
    kind: "float", min: 0.02, max: 0.5,
    desc: "Доля цены входа, на которой фиксируется прибыль. 0.12 = 12%.",
  },
  {
    path: "risk.trailing_pct", label: "Трейлинг-стоп, %", group: "Риск и позиция",
    kind: "float", min: 0.01, max: 0.2,
    desc: "Плавающий стоп: отступ от достигнутого максимума прибыли.",
  },
  {
    path: "sizing.percent_equity", label: "Размер позиции, % капитала", group: "Риск и позиция",
    kind: "float", min: 0.1, max: 1,
    desc: "Какую долю счёта вкладывать в одну сделку. 0.95 = 95%.",
  },
];

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Числовые параметры, которые есть в выбранной базовой стратегии. */
export function optimizableParams(spec: StrategySpec | undefined): ParamOption[] {
  const out: ParamOption[] = [...RISK_OPTIONS];

  const inds = Array.isArray(spec?.indicators)
    ? (spec.indicators as { id?: string; settings?: Record<string, Record<string, number>> }[])
    : [];
  for (const ref of inds) {
    const type = Object.keys(ref.settings ?? {})[0];
    const id = ref.id || type;
    if (!type || !id) continue;
    const def = INDICATOR_BY_KEY[type];
    if (!def) continue;
    for (const p of def.params) {
      if (p.type === "enum") continue;
      const cur = Number(ref.settings?.[type]?.[p.jsonName] ?? p.default) || p.default || 14;
      const isInt = p.type === "int";
      const min = isInt ? Math.max(2, Math.floor(cur / 3)) : roundTo(cur * 0.3, 4);
      const max = isInt ? Math.max(min + 1, Math.ceil(cur * 3)) : roundTo(Math.max(cur * 3, 0.01), 4);
      out.push({
        path: `indicators.${id}.settings.${type}.${p.name}`,
        label: `${indName(type)} «${id}» · ${paramName(p.jsonName)}`,
        group: "Индикаторы стратегии",
        kind: isInt ? "int" : "float",
        min,
        max,
        step: isInt ? 1 : undefined,
        desc: paramDesc(p.jsonName) || `Параметр ${p.jsonName} индикатора ${indName(type)}.`,
      });
    }
  }

  // Пороги-константы в правилах сравнения (RSI < 30 и т.п.) — обходим дерево
  // целиком (compare/all/any/negate на любой глубине), а не только случай,
  // когда всё правило — это одно голое сравнение: иначе строку с порогом
  // невозможно добавить в пространство поиска, если условий несколько или
  // они обёрнуты в И/ИЛИ.
  const trees: [string, string][] = [
    ["entry_long", "Порог входа в long"],
    ["exit_long", "Порог выхода из long"],
    ["entry_short", "Порог входа в short"],
    ["exit_short", "Порог выхода из short"],
  ];
  const specObj = (spec ?? {}) as Record<string, unknown>;
  for (const [snake, label] of trees) {
    const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const found: { path: string; value: number }[] = [];
    collectComparisonThresholds(specObj[camel], snake, found);
    found.forEach((f, i) => {
      const c = f.value;
      out.push({
        path: f.path,
        label: found.length > 1 ? `${label} · условие ${i + 1}` : label,
        group: "Пороги правил",
        kind: "float",
        min: roundTo(Math.min(c * 0.5, c - 5), 2),
        max: roundTo(Math.max(c * 1.5, c + 5), 2),
        desc: "Константа в условии сравнения — уровень, с которым поиск будет сопоставлять индикатор.",
      });
    });
  }

  return out;
}

/** Обходит BoolExpr (compare/all/any/negate) и собирает path.compare.right.constant
 * для каждого сравнения, где правый операнд — число. path — уже в snake_case,
 * с числовыми индексами repeated-полей (indicators.all.operands.0...), которые
 * бэкенд разбирает через protobuf-reflection (см. genome.py/paramspace.py _resolve). */
function collectComparisonThresholds(
  expr: unknown,
  path: string,
  out: { path: string; value: number }[],
): void {
  const e = expr && typeof expr === "object" ? (expr as Record<string, unknown>) : {};
  if (e.compare && typeof e.compare === "object") {
    const right = (e.compare as Record<string, unknown>).right;
    if (right && typeof right === "object" && typeof (right as Record<string, unknown>).constant === "number") {
      out.push({ path: `${path}.compare.right.constant`, value: (right as Record<string, unknown>).constant as number });
    }
    return;
  }
  if (e.all && typeof e.all === "object") {
    const ops = (e.all as Record<string, unknown>).operands;
    (Array.isArray(ops) ? ops : []).forEach((op, i) => collectComparisonThresholds(op, `${path}.all.operands.${i}`, out));
    return;
  }
  if (e.any && typeof e.any === "object") {
    const ops = (e.any as Record<string, unknown>).operands;
    (Array.isArray(ops) ? ops : []).forEach((op, i) => collectComparisonThresholds(op, `${path}.any.operands.${i}`, out));
    return;
  }
  if (e.negate != null) {
    collectComparisonThresholds(e.negate, `${path}.negate`, out);
  }
}

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

const CUSTOM = "__custom__";

export function SearchSpaceBuilder({
  rows,
  onChange,
  spec,
}: {
  rows: SpaceRow[];
  onChange: (rows: SpaceRow[]) => void;
  spec: StrategySpec | undefined;
}) {
  const options = useMemo(() => optimizableParams(spec), [spec]);
  const byPath = useMemo(() => new Map(options.map((o) => [o.path, o])), [options]);
  const groups = useMemo(() => {
    const g = new Map<string, ParamOption[]>();
    for (const o of options) {
      const arr = g.get(o.group) ?? [];
      arr.push(o);
      g.set(o.group, arr);
    }
    return [...g.entries()];
  }, [options]);

  const update = (i: number, patch: Partial<SpaceRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const addOption = (o: ParamOption) =>
    onChange([...rows, { path: o.path, kind: o.kind, min: o.min, max: o.max, step: o.step }]);
  const addFirstFree = () => {
    const used = new Set(rows.map((r) => r.path));
    const free = options.find((o) => !used.has(o.path));
    if (free) addOption(free);
    else onChange([...rows, { path: "", kind: "float", min: 0, max: 1 }]);
  };
  const fillFromStrategy = () => {
    const used = new Set(rows.map((r) => r.path));
    const add = options
      .filter((o) => o.group === "Индикаторы стратегии" && !used.has(o.path))
      .map((o) => ({ path: o.path, kind: o.kind, min: o.min, max: o.max, step: o.step }));
    if (add.length) onChange([...rows, ...add]);
  };

  const pickPath = (i: number, value: string) => {
    if (value === CUSTOM) {
      update(i, { path: "" });
      return;
    }
    const o = byPath.get(value);
    if (o) update(i, { path: o.path, kind: o.kind, min: o.min, max: o.max, step: o.step });
  };

  const hasIndParams = options.some((o) => o.group === "Индикаторы стратегии");

  return (
    <div className="search-builder">
      <div className="search-builder-head">
        <span>
          Что подбирать
          <InfoTip text="Числовые настройки выбранной стратегии, которые поиск будет перебирать в заданном диапазоне, отыскивая лучшую комбинацию. Выберите параметр из списка и задайте границы." />
        </span>
        <span className="search-space-add">
          {hasIndParams ? (
            <button type="button" className="btn ghost sm" onClick={fillFromStrategy}>
              из стратегии
            </button>
          ) : null}
          <button type="button" className="btn ghost sm" onClick={addFirstFree}>
            + параметр
          </button>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="hint">
          {spec
            ? "Добавьте хотя бы один параметр — иначе поиску нечего перебирать."
            : "Выберите базовую стратегию, чтобы подставить параметры её индикаторов; настройки риска доступны сразу."}
        </p>
      ) : (
        <div className="search-space-rows">
          <div className="search-space-row search-space-row--head">
            <span>Параметр</span>
            <span>Тип</span>
            <span>Мин</span>
            <span>Макс</span>
            <span>Шаг</span>
            <span />
          </div>
          {rows.map((r, i) => {
            const known = byPath.get(r.path);
            const isCustom = !known;
            return (
              <div key={i} className="search-space-row">
                <span className="search-space-param">
                  {isCustom ? (
                    <input
                      className="search-space-path"
                      placeholder="risk.stop_loss_pct"
                      value={r.path}
                      onChange={(e) => update(i, { path: e.target.value.trim() })}
                    />
                  ) : (
                    <select value={r.path} onChange={(e) => pickPath(i, e.target.value)}>
                      {groups.map(([name, opts]) => (
                        <optgroup key={name} label={name}>
                          {opts.map((o) => (
                            <option key={o.path} value={o.path}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value={CUSTOM}>— свой путь в spec —</option>
                    </select>
                  )}
                  {known ? (
                    <InfoTip text={known.desc} />
                  ) : (
                    <button
                      type="button"
                      className="search-space-mode"
                      title="Выбрать из списка"
                      onClick={() => update(i, { path: options[0]?.path ?? "" })}
                    >
                      ↩
                    </button>
                  )}
                </span>
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
            );
          })}
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
