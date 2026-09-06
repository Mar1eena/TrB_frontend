// Визуальный конструктор StrategySpec. Редактирует объект spec напрямую
// (той же формы, что уходит на сервер). JSON собирается автоматически.

import { useMemo } from "react";
import type { StrategySpec, ValidationIssue } from "../../api/strategy";
import { FieldLabel, InfoTip } from "./InfoTip";
import { RuleTree } from "./RuleTree";
import { ENUMS, INDICATORS, INDICATOR_BY_KEY } from "./specSchema.generated";
import {
  categoryName,
  enumLabel,
  fieldDesc,
  fieldName,
  indDesc,
  indName,
  paramDesc,
  paramName,
} from "./specI18n";
import { normalizeBoolExpr, type Json } from "./specModel";

const PRICE = ENUMS.PriceField;
const MA = ENUMS.MAType;

const CATEGORIES = Array.from(new Set(INDICATORS.map((i) => i.category)));

type Props = {
  value: StrategySpec;
  onChange: (next: StrategySpec) => void;
  issues?: ValidationIssue[] | null;
};

export default function SpecBuilder({ value, onChange, issues }: Props) {
  const spec = value as unknown as Json;
  const patch = (p: Json) => onChange({ ...(spec as object), ...p } as StrategySpec);

  const indicators = (spec.indicators as Json[]) ?? [];
  const indicatorIds = indicators.map((i) => String(i.id ?? "")).filter(Boolean);
  const hasShort = spec.entryShort != null;

  const issueFor = (prefix: string) =>
    (issues ?? []).filter((x) => x.path === prefix || x.path.startsWith(prefix + "."));

  return (
    <div className="spec-builder">
      {/* ---------------- Индикаторы ---------------- */}
      <section className="spec-section">
        <h3>
          Индикаторы <span className="spec-count">{indicators.length}/16</span>
        </h3>
        {indicators.map((ind, i) => (
          <IndicatorRow
            key={i}
            value={ind}
            duplicateId={
              !!ind.id && indicatorIds.filter((x) => x === ind.id).length > 1
            }
            onChange={(next) =>
              patch({ indicators: indicators.map((x, j) => (j === i ? next : x)) })
            }
            onRemove={() => patch({ indicators: indicators.filter((_, j) => j !== i) })}
          />
        ))}
        {indicators.length < 16 ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              patch({
                indicators: [
                  ...indicators,
                  { id: nextId(indicatorIds), settings: defaultSettings("rsi") },
                ],
              })
            }
          >
            + индикатор
          </button>
        ) : null}
        {issueFor("indicators").map((x, k) => (
          <p className="spec-issue" key={k}>
            <code>{x.path}</code> {x.message}
          </p>
        ))}
      </section>

      {/* ---------------- Правила ---------------- */}
      <section className="spec-section">
        <h3>
          Вход в long
          <InfoTip text="Условие, при котором открывается длинная позиция." />
        </h3>
        <RuleTree
          value={(spec.entryLong as Json) ?? normalizeBoolExpr(null)}
          onChange={(v) => patch({ entryLong: v })}
          indicatorIds={indicatorIds}
        />
        {issueFor("entry_long").map((x, k) => (
          <p className="spec-issue" key={k}>
            <code>{x.path}</code> {x.message}
          </p>
        ))}
      </section>

      <section className="spec-section">
        <h3>
          Выход из long
          <InfoTip text="Условие закрытия длинной позиции. Помимо него работают стоп-лосс / тейк-профит из блока «Риск»." />
        </h3>
        <RuleTree
          value={(spec.exitLong as Json) ?? normalizeBoolExpr(null)}
          onChange={(v) => patch({ exitLong: v })}
          indicatorIds={indicatorIds}
        />
      </section>

      <label className="strategy-inline-check spec-short-toggle">
        <input
          type="checkbox"
          checked={hasShort}
          onChange={(e) => {
            if (e.target.checked) {
              patch({ entryShort: normalizeBoolExpr(null), exitShort: normalizeBoolExpr(null) });
            } else {
              const next = { ...spec };
              delete next.entryShort;
              delete next.exitShort;
              onChange(next as StrategySpec);
            }
          }}
        />
        Разрешить короткие позиции (short)
      </label>

      {hasShort ? (
        <>
          <section className="spec-section">
            <h3>Вход в short</h3>
            <RuleTree
              value={spec.entryShort as Json}
              onChange={(v) => patch({ entryShort: v })}
              indicatorIds={indicatorIds}
            />
          </section>
          <section className="spec-section">
            <h3>Выход из short</h3>
            <RuleTree
              value={spec.exitShort as Json}
              onChange={(v) => patch({ exitShort: v })}
              indicatorIds={indicatorIds}
            />
          </section>
        </>
      ) : null}

      {/* ---------------- Размер позиции ---------------- */}
      <SizingSection value={(spec.sizing as Json) ?? {}} onChange={(v) => patch({ sizing: v })} issues={issueFor("sizing")} />

      {/* ---------------- Риск ---------------- */}
      <RiskSection value={(spec.risk as Json) ?? {}} onChange={(v) => patch({ risk: v })} issues={issueFor("risk")} />

      {/* ---------------- Прочее ---------------- */}
      <section className="spec-section spec-section-inline">
        <label className="filter-field">
          <FieldLabel desc={fieldDesc("warmupBars")}>{fieldName("warmupBars")}</FieldLabel>
          <span className="spec-inline-controls">
            <input
              type="number"
              min={0}
              value={Number(spec.warmupBars ?? 0)}
              onChange={(e) =>
                patch({ warmupBars: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
              }
            />
            <button
              type="button"
              className="btn ghost"
              onClick={() => patch({ warmupBars: suggestWarmup(indicators) })}
            >
              авто
            </button>
          </span>
        </label>
      </section>
    </div>
  );
}

/* ---------------- Индикатор ---------------- */

function IndicatorRow({
  value,
  duplicateId,
  onChange,
  onRemove,
}: {
  value: Json;
  duplicateId: boolean;
  onChange: (v: Json) => void;
  onRemove: () => void;
}) {
  const settings = (value.settings as Json) ?? {};
  const key = Object.keys(settings)[0] ?? "";
  const def = INDICATOR_BY_KEY[key];
  const params = (settings[key] as Json) ?? {};
  const category = def?.category ?? CATEGORIES[0];

  const inCategory = useMemo(
    () => INDICATORS.filter((i) => i.category === category),
    [category],
  );

  const setParam = (jsonName: string, v: number | string) =>
    onChange({ ...value, settings: { [key]: { ...params, [jsonName]: v } } });

  return (
    <div className="spec-indicator">
      <div className="spec-indicator-head">
        <label className="filter-field spec-id-field">
          <span>Идентификатор</span>
          <input
            value={String(value.id ?? "")}
            onChange={(e) => onChange({ ...value, id: e.target.value.trim() })}
            className={duplicateId || !value.id ? "spec-input-err" : ""}
            placeholder="rsi"
          />
        </label>

        <label className="filter-field">
          <span>Категория</span>
          <select
            value={category}
            onChange={(e) => {
              const first = INDICATORS.find((i) => i.category === e.target.value);
              if (first) onChange({ ...value, settings: defaultSettings(first.key), outputKey: undefined });
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryName(c)}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field spec-ind-select">
          <span>
            Индикатор
            {def ? <InfoTip text={indDesc(key)} /> : null}
          </span>
          <select
            value={key}
            onChange={(e) => onChange({ ...value, settings: defaultSettings(e.target.value), outputKey: undefined })}
          >
            {inCategory.map((i) => (
              <option key={i.key} value={i.key}>
                {indName(i.key)}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="btn danger spec-ind-del" onClick={onRemove}>
          удалить
        </button>
      </div>

      <div className="spec-indicator-params">
        {(def?.params ?? []).map((p) => (
          <label className="filter-field" key={p.jsonName}>
            <FieldLabel desc={paramDesc(p.jsonName)} below>
              {paramName(p.jsonName)}
            </FieldLabel>
            {p.type === "enum" ? (
              <select
                value={String(params[p.jsonName] ?? p.default)}
                onChange={(e) => setParam(p.jsonName, e.target.value)}
              >
                {(ENUMS[p.enumName ?? "MAType"] ?? MA).map((v) => (
                  <option key={v.value} value={v.value}>
                    {enumLabel(p.enumName ?? "MAType", v.value)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                step={p.type === "int" ? 1 : "any"}
                value={Number(params[p.jsonName] ?? p.default)}
                onChange={(e) =>
                  setParam(
                    p.jsonName,
                    p.type === "int"
                      ? Math.round(Number(e.target.value) || 0)
                      : Number(e.target.value) || 0,
                  )
                }
              />
            )}
          </label>
        ))}

        {def?.outputs ? (
          <label className="filter-field">
            <FieldLabel desc={fieldDesc("outputKey")} below>
              {fieldName("outputKey")}
            </FieldLabel>
            <select
              value={String(value.outputKey ?? def.outputs[0])}
              onChange={(e) => onChange({ ...value, outputKey: e.target.value })}
            >
              {def.outputs.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="filter-field">
          <FieldLabel desc={fieldDesc("appliedTo")} below>
            {fieldName("appliedTo")}
          </FieldLabel>
          <select
            value={String(value.appliedTo ?? "PRICE_CLOSE")}
            onChange={(e) =>
              onChange({
                ...value,
                appliedTo: e.target.value === "PRICE_CLOSE" ? undefined : e.target.value,
              })
            }
          >
            {PRICE.map((p) => (
              <option key={p.value} value={p.value}>
                {enumLabel("PriceField", p.value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {duplicateId ? <p className="spec-issue">Дублирующийся идентификатор индикатора.</p> : null}
    </div>
  );
}

/* ---------------- Размер позиции ---------------- */

const SIZING_METHODS = ["percentEquity", "fixedCash", "fixedUnits", "riskPerTrade"] as const;
type SizingMethod = (typeof SIZING_METHODS)[number];

function sizingMethod(s: Json): SizingMethod {
  return (SIZING_METHODS.find((m) => s[m] != null) ?? "percentEquity") as SizingMethod;
}

function SizingSection({
  value,
  onChange,
  issues,
}: {
  value: Json;
  onChange: (v: Json) => void;
  issues: ValidationIssue[];
}) {
  const method = sizingMethod(value);
  const isPct = method === "percentEquity" || method === "riskPerTrade";
  const raw = Number(value[method] ?? 0);

  const setMethod = (m: SizingMethod) => {
    const keep: Json = {};
    if (value.maxOpenPositions != null) keep.maxOpenPositions = value.maxOpenPositions;
    if (value.allowPyramiding) keep.allowPyramiding = true;
    const dflt = m === "percentEquity" ? 0.95 : m === "riskPerTrade" ? 0.02 : m === "fixedUnits" ? 10 : 10000;
    onChange({ ...keep, [m]: dflt });
  };

  return (
    <section className="spec-section">
      <h3>
        Размер позиции
        <InfoTip text={fieldDesc("method")} />
      </h3>
      <div className="spec-section-inline">
        <label className="filter-field">
          <span>Метод</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as SizingMethod)}>
            {SIZING_METHODS.map((m) => (
              <option key={m} value={m}>
                {fieldName(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <FieldLabel desc={fieldDesc(method)}>{isPct ? "Значение, %" : "Значение"}</FieldLabel>
          <input
            type="number"
            step="any"
            value={isPct ? +(raw * 100).toFixed(6) : raw}
            onChange={(e) => {
              const n = Number(e.target.value) || 0;
              onChange({ ...value, [method]: isPct ? n / 100 : n });
            }}
          />
        </label>
        <label className="filter-field">
          <FieldLabel desc={fieldDesc("maxOpenPositions")}>{fieldName("maxOpenPositions")}</FieldLabel>
          <input
            type="number"
            min={1}
            value={Number(value.maxOpenPositions ?? 1)}
            onChange={(e) =>
              onChange({ ...value, maxOpenPositions: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
            }
          />
        </label>
        <label className="strategy-inline-check">
          <input
            type="checkbox"
            checked={!!value.allowPyramiding}
            onChange={(e) => onChange({ ...value, allowPyramiding: e.target.checked || undefined })}
          />
          {fieldName("allowPyramiding")}
          <InfoTip text={fieldDesc("allowPyramiding")} />
        </label>
      </div>
      {issues.map((x, k) => (
        <p className="spec-issue" key={k}>
          <code>{x.path}</code> {x.message}
        </p>
      ))}
    </section>
  );
}

/* ---------------- Риск ---------------- */

function RiskSection({
  value,
  onChange,
  issues,
}: {
  value: Json;
  onChange: (v: Json) => void;
  issues: ValidationIssue[];
}) {
  const pctField = (key: string) => (
    <label className="filter-field" key={key}>
      <FieldLabel desc={fieldDesc(key)}>{fieldName(key)}</FieldLabel>
      <input
        type="number"
        step="any"
        min={0}
        value={+(Number(value[key] ?? 0) * 100).toFixed(6)}
        onChange={(e) => onChange({ ...value, [key]: (Number(e.target.value) || 0) / 100 })}
      />
    </label>
  );

  return (
    <section className="spec-section">
      <h3>Риск</h3>
      <div className="spec-section-inline">
        {pctField("stopLossPct")}
        {pctField("takeProfitPct")}
        <label className="strategy-inline-check">
          <input
            type="checkbox"
            checked={!!value.trailingStop}
            onChange={(e) => onChange({ ...value, trailingStop: e.target.checked || undefined })}
          />
          {fieldName("trailingStop")}
          <InfoTip text={fieldDesc("trailingStop")} />
        </label>
        {value.trailingStop ? pctField("trailingPct") : null}
        <label className="filter-field">
          <FieldLabel desc={fieldDesc("timeStopBars")}>{fieldName("timeStopBars")}</FieldLabel>
          <input
            type="number"
            min={0}
            value={Number(value.timeStopBars ?? 0)}
            onChange={(e) =>
              onChange({ ...value, timeStopBars: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
            }
          />
        </label>
      </div>
      {issues.map((x, k) => (
        <p className="spec-issue" key={k}>
          <code>{x.path}</code> {x.message}
        </p>
      ))}
    </section>
  );
}

/* ---------------- helpers ---------------- */

function defaultSettings(key: string): Json {
  const def = INDICATOR_BY_KEY[key];
  const params: Json = {};
  for (const p of def?.params ?? []) {
    params[p.jsonName] = p.type === "enum" ? (ENUMS[p.enumName ?? "MAType"]?.[0]?.value ?? p.default) : p.default;
  }
  return { [key]: params };
}

function nextId(existing: string[]): string {
  for (let n = 1; ; n++) {
    const id = `ind${n}`;
    if (!existing.includes(id)) return id;
  }
}

function suggestWarmup(indicators: Json[]): number {
  let max = 0;
  for (const ind of indicators) {
    const settings = (ind.settings as Json) ?? {};
    const params = (Object.values(settings)[0] as Json) ?? {};
    for (const [k, v] of Object.entries(params)) {
      if (/period/i.test(k) && typeof v === "number") max = Math.max(max, v);
    }
  }
  return max > 0 ? Math.ceil(max * 3) : 50;
}
