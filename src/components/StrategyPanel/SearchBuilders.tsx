// Человекопонятный подбор оптимизируемых параметров по spec стратегии —
// используется конструкторами пространства поиска (Optuna, OptunaBuilders.tsx)
// и палитрой шаблонов (TemplateBuilder.tsx).

import type { StrategySpec } from "../../api/strategysearch";
import { INDICATOR_BY_KEY } from "./specSchema.generated";
import { indName, paramDesc, paramName } from "./specI18n";

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

export function roundTo(v: number, digits: number): number {
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

export const OP_LABELS: Record<string, string> = {
  COMPARE_OP_GT: "больше >",
  COMPARE_OP_GE: "больше или равно ≥",
  COMPARE_OP_LT: "меньше <",
  COMPARE_OP_LE: "меньше или равно ≤",
  COMPARE_OP_CROSSES_ABOVE: "пересекает вверх ↗",
  COMPARE_OP_CROSSES_BELOW: "пересекает вниз ↘",
};
