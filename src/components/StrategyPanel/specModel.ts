// Нормализация / очистка StrategySpec для визуального конструктора.
//
// Конструктор редактирует объект StrategySpec напрямую (той же формы, что
// принимает бэкенд: camelCase + строковые enum). Эти функции приводят
// произвольный вход (шаблон, ответ сервера, вставленный JSON) к предсказуемой
// форме и убирают пустые ветки перед сохранением.

import type { StrategySpec } from "../../api/strategy";
import { ENUMS } from "./specSchema.generated";

export type Json = Record<string, unknown>;

const COMPARE_OPS = ENUMS.CompareOp.map((e) => e.value);
const ARITH_OPS = ENUMS.ArithOp.map((e) => e.value);
const PRICE_FIELDS = ENUMS.PriceField.map((e) => e.value);
const MA_TYPES = ENUMS.MAType.map((e) => e.value);

function enumToString(v: unknown, values: string[], fallback: string): string {
  if (typeof v === "string") return values.includes(v) ? v : fallback;
  if (typeof v === "number" && v >= 0 && v < values.length) return values[v];
  return fallback;
}

function asObj(v: unknown): Json {
  return v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Json) } : {};
}

// ---------------------------------------------------------------------------
// Operand
// ---------------------------------------------------------------------------
export function normalizeOperand(raw: unknown): Json {
  const o = asObj(raw);
  const out: Json = {};
  if (typeof o.shift === "number" && o.shift > 0) out.shift = Math.floor(o.shift);

  if (o.arith != null) {
    const a = asObj(o.arith);
    out.arith = {
      left: normalizeOperand(a.left),
      op: enumToString(a.op, ARITH_OPS, "ARITH_OP_ADD"),
      right: normalizeOperand(a.right),
    };
    return out;
  }
  if (o.indicatorId != null || o.indicator_id != null) {
    out.indicatorId = String(o.indicatorId ?? o.indicator_id ?? "");
    return out;
  }
  if (o.price != null) {
    out.price = enumToString(o.price, PRICE_FIELDS, "PRICE_CLOSE");
    return out;
  }
  if (o.constant != null) {
    out.constant = Number(o.constant) || 0;
    return out;
  }
  // пустой операнд по умолчанию — константа 0
  out.constant = 0;
  return out;
}

// ---------------------------------------------------------------------------
// BoolExpr
// ---------------------------------------------------------------------------
export function normalizeBoolExpr(raw: unknown): Json {
  const e = asObj(raw);

  if (e.compare != null) {
    const c = asObj(e.compare);
    return {
      compare: {
        left: normalizeOperand(c.left),
        op: enumToString(c.op, COMPARE_OPS, "COMPARE_OP_GT"),
        right: normalizeOperand(c.right),
      },
    };
  }
  if (e.all != null) {
    const list = asObj(e.all).operands;
    return { all: { operands: (Array.isArray(list) ? list : []).map(normalizeBoolExpr) } };
  }
  if (e.any != null) {
    const list = asObj(e.any).operands;
    return { any: { operands: (Array.isArray(list) ? list : []).map(normalizeBoolExpr) } };
  }
  if (e.negate != null) {
    return { negate: normalizeBoolExpr(e.negate) };
  }
  if (e.literal != null) {
    return { literal: Boolean(e.literal) };
  }
  // пустое дерево — сравнение-заготовка
  return { compare: { left: { constant: 0 }, op: "COMPARE_OP_GT", right: { constant: 0 } } };
}

function isEmptyBoolExpr(e: unknown): boolean {
  const o = asObj(e);
  if (o.compare != null) {
    const c = asObj(o.compare);
    const emptyOp = (x: unknown) => {
      const p = asObj(x);
      return p.constant === 0 && Object.keys(p).length === 1;
    };
    return emptyOp(c.left) && emptyOp(c.right);
  }
  if (o.all != null) return ((asObj(o.all).operands as unknown[]) ?? []).length === 0;
  if (o.any != null) return ((asObj(o.any).operands as unknown[]) ?? []).length === 0;
  return false;
}

// ---------------------------------------------------------------------------
// IndicatorRef
// ---------------------------------------------------------------------------
function normalizeIndicator(raw: unknown): Json {
  const r = asObj(raw);
  const settings = asObj(r.settings);
  const funcKey = Object.keys(settings)[0];
  const params = funcKey ? asObj(settings[funcKey]) : {};
  // enum-параметры (*_type / maType) приводим к строке
  for (const k of Object.keys(params)) {
    if (/type$/i.test(k)) params[k] = enumToString(params[k], MA_TYPES, MA_TYPES[0]);
  }
  const out: Json = {
    id: String(r.id ?? ""),
    settings: funcKey ? { [funcKey]: params } : {},
  };
  if (r.outputKey || r.output_key) out.outputKey = String(r.outputKey ?? r.output_key);
  const applied = r.appliedTo ?? r.applied_to;
  if (applied != null) {
    const s = enumToString(applied, PRICE_FIELDS, "PRICE_CLOSE");
    if (s !== "PRICE_CLOSE") out.appliedTo = s;
  }
  return out;
}

// ---------------------------------------------------------------------------
// StrategySpec
// ---------------------------------------------------------------------------
export function normalizeSpec(raw: unknown): StrategySpec {
  const s = asObj(raw);
  const out: Json = {
    version: typeof s.version === "number" && s.version > 0 ? s.version : 1,
    warmupBars: Math.max(0, Math.floor(Number(s.warmupBars ?? s.warmup_bars ?? 0)) || 0),
    indicators: (Array.isArray(s.indicators) ? s.indicators : []).map(normalizeIndicator),
    entryLong: normalizeBoolExpr(s.entryLong ?? s.entry_long),
    exitLong: normalizeBoolExpr(s.exitLong ?? s.exit_long),
    sizing: normalizeSizing(s.sizing),
    risk: normalizeRisk(s.risk),
  };
  const es = s.entryShort ?? s.entry_short;
  const xs = s.exitShort ?? s.exit_short;
  if (es != null) out.entryShort = normalizeBoolExpr(es);
  if (xs != null) out.exitShort = normalizeBoolExpr(xs);
  return out as StrategySpec;
}

function normalizeSizing(raw: unknown): Json {
  const s = asObj(raw);
  const out: Json = {};
  const methods = ["fixedCash", "percentEquity", "fixedUnits", "riskPerTrade"];
  const snake: Record<string, string> = {
    fixed_cash: "fixedCash",
    percent_equity: "percentEquity",
    fixed_units: "fixedUnits",
    risk_per_trade: "riskPerTrade",
  };
  let picked = "percentEquity";
  let val = 0.95;
  for (const key of Object.keys(s)) {
    const camel = snake[key] ?? key;
    if (methods.includes(camel) && s[key] != null) {
      picked = camel;
      val = Number(s[key]) || 0;
    }
  }
  out[picked] = val;
  const maxOpen = Number(s.maxOpenPositions ?? s.max_open_positions ?? 0);
  if (maxOpen > 0) out.maxOpenPositions = Math.floor(maxOpen);
  if (s.allowPyramiding ?? s.allow_pyramiding) out.allowPyramiding = true;
  return out;
}

function normalizeRisk(raw: unknown): Json {
  const s = asObj(raw);
  const num = (a: unknown, b: unknown) => Number(a ?? b ?? 0) || 0;
  const out: Json = {
    stopLossPct: num(s.stopLossPct, s.stop_loss_pct),
    takeProfitPct: num(s.takeProfitPct, s.take_profit_pct),
  };
  if (s.trailingStop ?? s.trailing_stop) out.trailingStop = true;
  const tp = num(s.trailingPct, s.trailing_pct);
  if (tp > 0) out.trailingPct = tp;
  const ts = Math.floor(num(s.timeStopBars, s.time_stop_bars));
  if (ts > 0) out.timeStopBars = ts;
  return out;
}

// ---------------------------------------------------------------------------
// Очистка перед сохранением / показом JSON
// ---------------------------------------------------------------------------
export function pruneSpec(spec: StrategySpec): StrategySpec {
  const s = spec as unknown as Json;
  const out: Json = {
    version: 1,
    indicators: ((s.indicators as unknown[]) ?? []).map((i) => {
      const r = { ...(i as Json) };
      if (!r.outputKey) delete r.outputKey;
      if (!r.appliedTo || r.appliedTo === "PRICE_CLOSE") delete r.appliedTo;
      return r;
    }),
    entryLong: pruneBoolExpr(s.entryLong),
    exitLong: pruneBoolExpr(s.exitLong),
    sizing: s.sizing,
    risk: pruneRisk(s.risk as Json),
  };
  if (typeof s.warmupBars === "number" && s.warmupBars > 0) out.warmupBars = s.warmupBars;
  if (s.entryShort != null && !isEmptyBoolExpr(s.entryShort)) out.entryShort = pruneBoolExpr(s.entryShort);
  if (s.exitShort != null && !isEmptyBoolExpr(s.exitShort)) out.exitShort = pruneBoolExpr(s.exitShort);
  if (isEmptyBoolExpr(out.exitLong)) delete out.exitLong;
  return out as unknown as StrategySpec;
}

function pruneBoolExpr(raw: unknown): Json {
  const e = asObj(raw);
  if (e.compare != null) {
    const c = asObj(e.compare);
    return { compare: { left: pruneOperand(c.left), op: c.op, right: pruneOperand(c.right) } };
  }
  if (e.all != null) {
    return { all: { operands: (((asObj(e.all).operands as unknown[]) ?? []).map(pruneBoolExpr)) } };
  }
  if (e.any != null) {
    return { any: { operands: (((asObj(e.any).operands as unknown[]) ?? []).map(pruneBoolExpr)) } };
  }
  if (e.negate != null) return { negate: pruneBoolExpr(e.negate) };
  if (e.literal != null) return { literal: Boolean(e.literal) };
  return e;
}

function pruneOperand(raw: unknown): Json {
  const o = asObj(raw);
  const out: Json = {};
  if (typeof o.shift === "number" && o.shift > 0) out.shift = o.shift;
  if (o.arith != null) {
    const a = asObj(o.arith);
    out.arith = { left: pruneOperand(a.left), op: a.op, right: pruneOperand(a.right) };
  } else if (o.indicatorId) out.indicatorId = o.indicatorId;
  else if (o.price != null) out.price = o.price;
  else out.constant = Number(o.constant) || 0;
  return out;
}

function pruneRisk(r: Json): Json {
  const out: Json = {};
  if (Number(r?.stopLossPct) > 0) out.stopLossPct = r.stopLossPct;
  if (Number(r?.takeProfitPct) > 0) out.takeProfitPct = r.takeProfitPct;
  if (r?.trailingStop) {
    out.trailingStop = true;
    if (Number(r?.trailingPct) > 0) out.trailingPct = r.trailingPct;
  }
  if (Number(r?.timeStopBars) > 0) out.timeStopBars = r.timeStopBars;
  return out;
}
