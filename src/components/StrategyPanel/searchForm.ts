// Единое состояние формы «Поиск 2.0» + единственный путь сборки/валидации JSON,
// который реально уходит на сервер (SubmitSearchRequest/CreateSearchPresetRequest).
//
// До рефакторинга форма жила в ~25 независимых useState в OptunaSearchTab.tsx,
// а submit()/savePreset() КАЖДЫЙ собирали config/study/template/marketSpace
// заново — те же поля, но в двух местах. Расхождение было лишь вопросом
// времени (см. историю правок uid/interval/start/end при включённом
// рыночном поиске). Теперь submit/savePreset — тонкие обёртки над одной
// prepareSubmission(state), applyPreset — над одной applyPresetToForm(state, preset).

import type { StrategySpec } from "../../api/strategysearch";
import type * as api from "../../api/strategysearch";
import { normalizeSpec, pruneSpec } from "./specModel";
import { BLANK_TEMPLATE } from "./templates";
import {
  DEFAULT_OPTUNA_SPACE_ROWS,
  optunaSpaceRowsToJson,
  paramRangesToOptunaSpaceRows,
  type OptunaSpaceRow,
} from "./OptunaBuilders";
import { DEFAULT_TEMPLATE_FORM, templateToJson, templateFromApi, type TemplateForm } from "./TemplateBuilder";
import { DEFAULT_MARKET_FORM, marketSpaceToJson, marketSpaceFromApi, type MarketSpaceForm } from "./MarketSpaceBuilder";
import {
  validateOptunaSettings,
  validateTemplate,
  validateMarketSpace,
  validateStructuralSamplerCompat,
} from "./searchValidation";

// --- даты: datetime-local (форма) <-> RFC3339 (провод) ---

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function toRfc3339(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --- состояние формы ---

export type SpecMode = "builder" | "json";

export type SearchFormState = {
  name: string;
  templateId: string;
  specMode: SpecMode;
  spec: StrategySpec;
  specText: string;

  uid: string;
  interval: number;
  start: string; // datetime-local
  end: string; // datetime-local
  benchmarkUid: string;

  objectiveMetrics: api.ObjectiveMetric[];
  minTrades: number;
  maxDrawdownLimit: number | undefined;

  nTrials: number;
  timeoutSeconds: number;
  nJobs: number;
  seed: string;
  disableCache: boolean;
  pruningInterval: number;

  sampler: api.SamplerConfig;
  pruner: api.PrunerConfig;
  spaceRows: OptunaSpaceRow[];

  template: TemplateForm;
  marketForm: MarketSpaceForm;
};

function blankSpecJson(): { spec: StrategySpec; specText: string } {
  const spec = normalizeSpec(BLANK_TEMPLATE.spec);
  return { spec, specText: JSON.stringify(pruneSpec(spec), null, 2) };
}

export function defaultSearchForm(): SearchFormState {
  const { spec, specText } = blankSpecJson();
  return {
    name: "",
    templateId: BLANK_TEMPLATE.id,
    specMode: "builder",
    spec,
    specText,
    uid: "",
    interval: 5,
    start: toLocalInput(isoDaysAgo(365)),
    end: toLocalInput(new Date().toISOString()),
    benchmarkUid: "",
    objectiveMetrics: [{ metric: "sharpe", maximize: true }],
    minTrades: 10,
    maxDrawdownLimit: undefined,
    nTrials: 50,
    timeoutSeconds: 900,
    nJobs: 2,
    seed: "",
    disableCache: false,
    pruningInterval: 0,
    sampler: { tpe: {} },
    pruner: { none: {} },
    spaceRows: DEFAULT_OPTUNA_SPACE_ROWS,
    template: DEFAULT_TEMPLATE_FORM,
    marketForm: DEFAULT_MARKET_FORM,
  };
}

// --- спек: builder/JSON-режим в одно каноническое значение ---

export type SpecResult = { ok: true; spec: StrategySpec } | { ok: false; error: string };

export function resolveSpec(state: SearchFormState): SpecResult {
  if (state.specMode === "json") {
    try {
      return { ok: true, spec: pruneSpec(normalizeSpec(JSON.parse(state.specText))) };
    } catch (err) {
      return { ok: false, error: `Некорректный JSON: ${err instanceof Error ? err.message : ""}` };
    }
  }
  return { ok: true, spec: pruneSpec(state.spec) };
}

// Меняет spec и specText разом — оба всегда должны отражать одно и то же
// значение, иначе переключение "Конструктор"/"JSON" покажет рассинхрон.
export function applySpecToForm(state: SearchFormState, raw: unknown): SearchFormState {
  const next = normalizeSpec(raw);
  return { ...state, spec: next, specText: JSON.stringify(pruneSpec(next), null, 2) };
}

// --- сборка JSON, который реально уходит на сервер (единственное место) ---

export type PreparedPayload = {
  baseSpec: StrategySpec;
  searchSpace: api.ParamRange[];
  study: api.StudyConfig;
  config: api.BacktestConfig;
  template?: api.StrategyTemplate;
  marketSpace?: api.MarketSpace;
};

function buildStudyConfig(state: SearchFormState): api.StudyConfig {
  return {
    sampler: state.sampler,
    pruner: state.pruner,
    objective: { metrics: state.objectiveMetrics, minTrades: state.minTrades, maxDrawdownLimit: state.maxDrawdownLimit },
    budget: {
      nTrials: state.nTrials,
      timeoutSeconds: state.timeoutSeconds,
      nJobs: state.nJobs,
      seed: state.seed.trim() || undefined,
      disableCache: state.disableCache,
      pruningReportIntervalBars: state.pruningInterval || undefined,
    },
  };
}

// uid/interval/start/end опускаются целиком (не пустыми строками!), когда
// включён рыночный поиск — иначе grpc-gateway откажется парсить
// BacktestConfig.start/end как пустую строку вместо RFC3339-таймстампа.
// Сервер в этом режиме их не читает (см. engine/search/market.py) —
// инструмент/интервал/период сэмплируются на трайле из market_candidates.
function buildBacktestConfig(state: SearchFormState, startIso: string, endIso: string): api.BacktestConfig {
  return {
    ...(state.marketForm.enabled ? {} : { uid: state.uid, interval: state.interval, start: startIso, end: endIso }),
    initialCash: 100000,
    commissionPct: 0.0005,
    longOnly: true,
    benchmarkUid: state.benchmarkUid.trim() || undefined,
  };
}

export type PrepareResult = { ok: true; payload: PreparedPayload } | { ok: false; message: string };

// Единственное место, которое решает, что именно уйдёт на сервер, и
// единственное место, которое это валидирует — submit() и savePreset()
// в компоненте вызывают только эту функцию, а дальше добавляют своё "name".
export function prepareSubmission(state: SearchFormState): PrepareResult {
  const specResult = resolveSpec(state);
  if (!specResult.ok) return { ok: false, message: specResult.error };

  if (!state.marketForm.enabled && !state.uid) {
    return { ok: false, message: "Выберите инструмент" };
  }
  // При структурном поиске (палитра индикаторов) пространство поиска может
  // быть пустым — подбирать помимо самой структуры нечего.
  if (state.spaceRows.length === 0 && !state.template.enabled) {
    return { ok: false, message: "Добавьте хотя бы один параметр для оптимизации" };
  }

  let startIso = "";
  let endIso = "";
  if (!state.marketForm.enabled) {
    startIso = toRfc3339(state.start);
    endIso = toRfc3339(state.end);
    if (!startIso || !endIso) return { ok: false, message: "Укажите период" };
  }

  const issues = [
    ...validateOptunaSettings({
      spaceRows: state.spaceRows,
      sampler: state.sampler,
      pruner: state.pruner,
      objectiveMetrics: state.objectiveMetrics,
      minTrades: state.minTrades,
      maxDrawdownLimit: state.maxDrawdownLimit,
      nTrials: state.nTrials,
      timeoutSeconds: state.timeoutSeconds,
      nJobs: state.nJobs,
    }),
    ...validateTemplate(state.template),
    ...validateMarketSpace(state.marketForm),
    ...validateStructuralSamplerCompat(state.sampler, state.template.enabled || state.marketForm.enabled),
  ];
  if (issues.length > 0) return { ok: false, message: issues[0].message };

  return {
    ok: true,
    payload: {
      baseSpec: specResult.spec,
      searchSpace: optunaSpaceRowsToJson(state.spaceRows),
      study: buildStudyConfig(state),
      config: buildBacktestConfig(state, startIso, endIso),
      template: templateToJson(state.template),
      marketSpace: marketSpaceToJson(state.marketForm),
    },
  };
}

// --- восстановление формы из сохранённого пресета (один путь, не 20 сеттеров) ---

export function applyPresetToForm(state: SearchFormState, p: api.SearchPreset): SearchFormState {
  const spec = p.baseSpec ? normalizeSpec(p.baseSpec) : state.spec;
  const obj = p.study?.objective;
  const budget = p.study?.budget;
  return {
    ...state,
    name: p.name,
    spec,
    specText: p.baseSpec ? JSON.stringify(pruneSpec(spec), null, 2) : state.specText,
    spaceRows: p.searchSpace?.length ? paramRangesToOptunaSpaceRows(p.searchSpace) : DEFAULT_OPTUNA_SPACE_ROWS,
    objectiveMetrics: obj?.metrics?.length ? obj.metrics : [{ metric: "sharpe", maximize: true }],
    minTrades: obj?.minTrades ?? 10,
    maxDrawdownLimit: obj?.maxDrawdownLimit,
    nTrials: budget?.nTrials ?? 50,
    timeoutSeconds: budget?.timeoutSeconds ?? 900,
    nJobs: budget?.nJobs ?? 2,
    seed: budget?.seed ?? "",
    disableCache: budget?.disableCache ?? false,
    pruningInterval: budget?.pruningReportIntervalBars ?? 0,
    sampler: p.study?.sampler ?? { tpe: {} },
    pruner: p.study?.pruner ?? { none: {} },
    uid: p.config?.uid ?? "",
    interval: p.config?.interval ?? 5,
    start: p.config?.start ? toLocalInput(p.config.start) : toLocalInput(isoDaysAgo(365)),
    end: p.config?.end ? toLocalInput(p.config.end) : toLocalInput(new Date().toISOString()),
    benchmarkUid: p.config?.benchmarkUid ?? "",
    template: templateFromApi(p.template),
    marketForm: marketSpaceFromApi(p.marketSpace),
  };
}
