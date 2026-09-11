// Конструкторы, специфичные для Optuna-поиска: пространство поиска (с log-диапазоном
// и категориальными значениями), список целевых метрик, выбор семплера/прунера.
// Каталог «известных» параметров стратегии (optimizableParams) переиспользуется
// из SearchBuilders.tsx — он строится по spec, а не по алгоритму поиска.

import { useMemo } from "react";
import type * as api from "../../api/strategysearch";
import type { StrategySpec } from "../../api/strategy";
import { optimizableParams, type ParamOption } from "./SearchBuilders";
import { FieldLabel, InfoTip } from "./InfoTip";

export type OptunaSpaceKind = "int" | "float" | "log_float" | "choice" | "categorical";

export type OptunaSpaceRow = {
  path: string;
  kind: OptunaSpaceKind;
  min: number;
  max: number;
  step?: number;
  choiceValues?: string; // как вводит пользователь: "5, 10, 20"
  categoricalValues?: string; // "signal, hist"
};

export const DEFAULT_OPTUNA_SPACE_ROWS: OptunaSpaceRow[] = [
  { path: "risk.stop_loss_pct", kind: "float", min: 0.02, max: 0.12 },
  { path: "risk.take_profit_pct", kind: "float", min: 0.04, max: 0.3 },
];

function parseNumberList(raw: string | undefined): number[] {
  return (raw ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function parseStringList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function optunaSpaceRowsToJson(rows: OptunaSpaceRow[]): api.ParamRange[] {
  return rows
    .filter((r) => r.path.trim())
    .map((r): api.ParamRange => {
      const path = r.path.trim();
      switch (r.kind) {
        case "int":
          return { path, ints: { min: r.min, max: r.max, ...(r.step && r.step > 0 ? { step: r.step } : {}) } };
        case "log_float":
          return { path, logFloats: { min: r.min, max: r.max } };
        case "choice":
          return { path, choice: { values: parseNumberList(r.choiceValues) } };
        case "categorical":
          return { path, categorical: { values: parseStringList(r.categoricalValues) } };
        case "float":
        default:
          return { path, floats: { min: r.min, max: r.max, ...(r.step && r.step > 0 ? { step: r.step } : {}) } };
      }
    });
}

// Обратное преобразование — для восстановления билдера из сохранённого пресета.
// ints.{min,max,step} — int64 в проте: сервер отдаёт их строками (JSON-маппинг
// protobuf для 64-битных целых), поэтому явно приводим через Number(...).
export function paramRangesToOptunaSpaceRows(ranges: api.ParamRange[]): OptunaSpaceRow[] {
  return ranges.map((r): OptunaSpaceRow => {
    if (r.ints) {
      return {
        path: r.path,
        kind: "int",
        min: Number(r.ints.min),
        max: Number(r.ints.max),
        step: r.ints.step != null ? Number(r.ints.step) : undefined,
      };
    }
    if (r.logFloats) {
      return { path: r.path, kind: "log_float", min: r.logFloats.min, max: r.logFloats.max };
    }
    if (r.choice) {
      return { path: r.path, kind: "choice", min: 0, max: 0, choiceValues: r.choice.values.join(", ") };
    }
    if (r.categorical) {
      return { path: r.path, kind: "categorical", min: 0, max: 0, categoricalValues: r.categorical.values.join(", ") };
    }
    return { path: r.path, kind: "float", min: r.floats?.min ?? 0, max: r.floats?.max ?? 1, step: r.floats?.step };
  });
}

const CUSTOM = "__custom__";

export function OptunaSpaceBuilder({
  rows,
  onChange,
  spec,
}: {
  rows: OptunaSpaceRow[];
  onChange: (rows: OptunaSpaceRow[]) => void;
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

  const update = (i: number, patch: Partial<OptunaSpaceRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const addFirstFree = () => {
    const used = new Set(rows.map((r) => r.path));
    const free = options.find((o) => !used.has(o.path));
    if (free) onChange([...rows, { path: free.path, kind: free.kind, min: free.min, max: free.max, step: free.step }]);
    else onChange([...rows, { path: "", kind: "float", min: 0, max: 1 }]);
  };

  const pickPath = (i: number, value: string) => {
    if (value === CUSTOM) {
      update(i, { path: "" });
      return;
    }
    const o = byPath.get(value);
    if (o) update(i, { path: o.path, kind: o.kind, min: o.min, max: o.max, step: o.step });
  };

  return (
    <div className="search-builder">
      <div className="search-builder-head">
        <span>
          Пространство поиска
          <InfoTip text="Параметры стратегии, которые Optuna будет подбирать в заданных границах. log — логарифмический шаг (для параметров с большим разбросом, напр. периодов от 2 до 500). Числа/Строки — фиксированный набор значений на выбор." />
        </span>
        <button type="button" className="btn ghost sm" onClick={addFirstFree}>
          + параметр
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="hint">
          {spec
            ? "Добавьте хотя бы один параметр — иначе Optuna нечего подбирать."
            : "Выберите/постройте базовую стратегию, чтобы подставить параметры её индикаторов."}
        </p>
      ) : (
        <div className="search-space-rows">
          <div className="search-space-row search-space-row--head">
            <span>Параметр</span>
            <span>Тип</span>
            <span>Мин / значения</span>
            <span>Макс</span>
            <span>Шаг</span>
            <span />
          </div>
          {rows.map((r, i) => {
            const known = byPath.get(r.path);
            const isCustom = !known;
            const isListKind = r.kind === "choice" || r.kind === "categorical";
            return (
              <div key={i} className="search-space-row">
                <span className="search-space-param">
                  {isCustom ? (
                    <input
                      className="search-space-path"
                      placeholder="indicators.rsi.output_key"
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
                <select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as OptunaSpaceKind })}>
                  <option value="float">дробный</option>
                  <option value="log_float">дробный (log)</option>
                  <option value="int">целый</option>
                  <option value="choice">числа на выбор</option>
                  <option value="categorical">строки на выбор</option>
                </select>
                {isListKind ? (
                  <input
                    style={{ gridColumn: "3 / 6" }}
                    className="search-space-num"
                    placeholder={r.kind === "choice" ? "5, 10, 20" : "signal, hist"}
                    value={(r.kind === "choice" ? r.choiceValues : r.categoricalValues) ?? ""}
                    onChange={(e) =>
                      update(i, r.kind === "choice" ? { choiceValues: e.target.value } : { categoricalValues: e.target.value })
                    }
                  />
                ) : (
                  <>
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
                      onChange={(e) => update(i, { step: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </>
                )}
                <button type="button" className="search-space-del" title="Удалить" onClick={() => remove(i)}>
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

// --- целевые метрики ---

export const OBJECTIVE_METRIC_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: "Доходность и риск",
    options: [
      { value: "sharpe", label: "Sharpe" },
      { value: "sortino", label: "Sortino" },
      { value: "calmar", label: "Calmar" },
      { value: "omega", label: "Omega" },
      { value: "cagr", label: "CAGR" },
      { value: "total_return", label: "Доходность" },
    ],
  },
  {
    label: "Просадка и риск потерь",
    options: [
      { value: "max_drawdown", label: "Макс. просадка" },
      { value: "ulcer_index", label: "Ulcer Index" },
      { value: "serenity_index", label: "Serenity Index" },
      { value: "value_at_risk", label: "VaR" },
      { value: "conditional_value_at_risk", label: "CVaR" },
      { value: "risk_of_ruin", label: "Risk of Ruin" },
      { value: "tail_ratio", label: "Tail Ratio" },
    ],
  },
  {
    label: "Качество сделок",
    options: [
      { value: "win_rate", label: "Win rate" },
      { value: "profit_factor", label: "Profit factor" },
      { value: "sqn", label: "SQN" },
      { value: "payoff_ratio", label: "Payoff ratio" },
      { value: "gain_to_pain_ratio", label: "Gain / Pain" },
      { value: "kelly_criterion", label: "Kelly criterion" },
      { value: "recovery_factor", label: "Recovery factor" },
      { value: "common_sense_ratio", label: "Common Sense Ratio" },
      { value: "outlier_win_ratio", label: "Outlier win ratio" },
      { value: "outlier_loss_ratio", label: "Outlier loss ratio" },
      { value: "expectancy", label: "Ожидание" },
      { value: "avg_trade_pct", label: "Ср. сделка" },
      { value: "exposure", label: "В рынке" },
    ],
  },
  {
    label: "Относительно бенчмарка",
    options: [
      { value: "alpha", label: "Alpha" },
      { value: "beta", label: "Beta" },
      { value: "information_ratio", label: "Information ratio" },
      { value: "r_squared", label: "R²" },
    ],
  },
];

export function ObjectiveBuilder({
  metrics,
  onChange,
}: {
  metrics: api.ObjectiveMetric[];
  onChange: (m: api.ObjectiveMetric[]) => void;
}) {
  const update = (i: number, patch: Partial<api.ObjectiveMetric>) =>
    onChange(metrics.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => onChange(metrics.filter((_, idx) => idx !== i));
  const add = () => onChange([...metrics, { metric: "sharpe", maximize: true }]);

  return (
    <div className="search-builder">
      <div className="search-builder-head">
        <span>
          Целевые метрики
          <InfoTip text="Одна строка — обычный одноцелевой поиск (максимизирует/минимизирует одну метрику). Несколько строк — многоцелевая оптимизация: результат — фронт Парето (несколько несравнимых лучших вариантов)." />
        </span>
        <button type="button" className="btn ghost sm" onClick={add}>
          + метрика
        </button>
      </div>
      <div className="search-space-rows">
        {metrics.map((m, i) => (
          <div key={i} className="search-space-row objective-row">
            <select value={m.metric} onChange={(e) => update(i, { metric: e.target.value })}>
              {OBJECTIVE_METRIC_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={m.maximize ? "max" : "min"}
              onChange={(e) => update(i, { maximize: e.target.value === "max" })}
            >
              <option value="max">максимизировать</option>
              <option value="min">минимизировать</option>
            </select>
            <button
              type="button"
              className="search-space-del"
              title="Удалить"
              disabled={metrics.length <= 1}
              onClick={() => remove(i)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- семплер ---

const SAMPLER_LABELS: Record<api.SamplerKind, string> = {
  tpe: "TPE (по умолчанию)",
  cmaes: "CMA-ES",
  random: "Random",
  grid: "Grid (полный перебор)",
  nsga2: "NSGA-II (для нескольких целей)",
  qmc: "QMC",
  gp: "GP (байесовский, медленный)",
};

export function SamplerBuilder({
  value,
  onChange,
}: {
  value: api.SamplerConfig;
  onChange: (v: api.SamplerConfig) => void;
}) {
  const kind: api.SamplerKind = (Object.keys(value)[0] as api.SamplerKind) ?? "tpe";

  const setKind = (k: api.SamplerKind) => onChange({ [k]: {} } as api.SamplerConfig);
  const setParams = (patch: Record<string, unknown>) =>
    onChange({ [kind]: { ...(value[kind] as Record<string, unknown>), ...patch } } as api.SamplerConfig);

  const params = (value[kind] ?? {}) as Record<string, unknown>;
  const numField = (
    key: string,
    label: string,
    desc: string,
  ) => (
    <label className="filter-field">
      <FieldLabel desc={desc}>{label}</FieldLabel>
      <input
        type="number"
        value={(params[key] as number | undefined) ?? ""}
        placeholder="авто"
        onChange={(e) => setParams({ [key]: e.target.value ? Number(e.target.value) : undefined })}
      />
    </label>
  );

  return (
    <div className="search-builder">
      <div className="search-builder-head">
        <span>
          Алгоритм подбора (sampler)
          <InfoTip text="Как Optuna выбирает следующий набор параметров для проверки. TPE подходит почти всегда; Grid — если пространство небольшое и нужен полный перебор; NSGA-II — для многоцелевого поиска." />
        </span>
      </div>
      <label className="filter-field">
        <span>Тип</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as api.SamplerKind)}>
          {(Object.keys(SAMPLER_LABELS) as api.SamplerKind[]).map((k) => (
            <option key={k} value={k}>
              {SAMPLER_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="search-struct-grid">
        {kind === "grid" ? (
          <p className="hint">Перебирает все точки заданного пространства поиска — доп. параметров нет.</p>
        ) : (
          <>
            {kind === "tpe"
              ? numField("nStartupTrials", "Случайных стартов", "Сколько первых трайлов выбираются случайно, до включения модели TPE.")
              : null}
            {kind === "cmaes"
              ? numField("nStartupTrials", "Случайных стартов", "Сколько первых трайлов выбираются случайно, до включения CMA-ES.")
              : null}
            {kind === "gp"
              ? numField("nStartupTrials", "Случайных стартов", "Сколько первых трайлов выбираются случайно, до включения гауссовского процесса.")
              : null}
            {kind === "nsga2"
              ? numField("populationSize", "Размер популяции", "Сколько кандидатов живёт в одном поколении NSGA-II.")
              : null}
            {numField("seed", "Seed", "Случайное зерно для воспроизводимости; пусто — движок выберет сам.")}
          </>
        )}
      </div>
    </div>
  );
}

// --- прунер ---

const PRUNER_LABELS: Record<api.PrunerKind, string> = {
  none: "Нет (по умолчанию)",
  median: "Median",
  percentile: "Percentile",
  successiveHalving: "Successive Halving",
  hyperband: "Hyperband",
  patient: "Patient",
  threshold: "Threshold",
};

export function PrunerBuilder({
  value,
  onChange,
}: {
  value: api.PrunerConfig;
  onChange: (v: api.PrunerConfig) => void;
}) {
  const kind: api.PrunerKind = (Object.keys(value)[0] as api.PrunerKind) ?? "none";
  const setKind = (k: api.PrunerKind) => onChange({ [k]: {} } as api.PrunerConfig);
  const setParams = (patch: Record<string, unknown>) =>
    onChange({ [kind]: { ...(value[kind] as Record<string, unknown>), ...patch } } as api.PrunerConfig);
  const params = (value[kind] ?? {}) as Record<string, unknown>;

  const numField = (key: string, label: string, desc: string) => (
    <label className="filter-field">
      <FieldLabel desc={desc}>{label}</FieldLabel>
      <input
        type="number"
        value={(params[key] as number | undefined) ?? ""}
        placeholder="авто"
        onChange={(e) => setParams({ [key]: e.target.value ? Number(e.target.value) : undefined })}
      />
    </label>
  );

  return (
    <div className="search-builder">
      <div className="search-builder-head">
        <span>
          Прунинг трайлов (pruner)
          <InfoTip text="Отсекает бесперспективные трайлы по промежуточным чекпойнтам капитала (см. «интервал чекпойнтов» в бюджете). Не сокращает время расчёта самого трайла, но помогает семплеру не повторять неудачные области пространства." />
        </span>
      </div>
      <label className="filter-field">
        <span>Тип</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as api.PrunerKind)}>
          {(Object.keys(PRUNER_LABELS) as api.PrunerKind[]).map((k) => (
            <option key={k} value={k}>
              {PRUNER_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="search-struct-grid">
        {kind === "none" ? null : null}
        {kind === "median" || kind === "percentile" ? (
          <>
            {kind === "percentile"
              ? numField("percentile", "Перцентиль", "Порог отсечения, 0–100. 25 — отсекать худшую четверть трайлов на этом шаге.")
              : null}
            {numField("nWarmupSteps", "Прогрев, чекпойнтов", "Сколько первых чекпойнтов трайла не подвергаются прунингу.")}
            {numField("nStartupTrials", "Случайных стартов", "Сколько первых трайлов исследования не подвергаются прунингу.")}
          </>
        ) : null}
        {kind === "successiveHalving"
          ? numField("reductionFactor", "Коэффициент отсева", "Во сколько раз сокращается число трайлов на каждом раунде халвинга.")
          : null}
        {kind === "hyperband"
          ? numField("maxResource", "Макс. ресурс", "Верхняя граница «ресурса» (числа чекпойнтов) для Hyperband; 0 — определить автоматически.")
          : null}
        {kind === "patient"
          ? numField("patience", "Терпение, чекпойнтов", "Сколько чекпойнтов без улучшения допускается перед отсечением.")
          : null}
        {kind === "threshold" ? (
          <>
            {numField("lower", "Нижняя граница", "Отсечь трайл, если промежуточное значение опустилось ниже этой границы.")}
            {numField("upper", "Верхняя граница", "Отсечь трайл, если промежуточное значение поднялось выше этой границы.")}
          </>
        ) : null}
      </div>
    </div>
  );
}
