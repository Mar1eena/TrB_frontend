// REST-клиент домена strategysearch (Optuna-поиск) через Envoy grpc_json_transcoder
// (/v1/strategysearch/*). Зеркало src/api/strategy/index.ts — тот же подход (REST
// вместо grpc-web) годится и здесь, биндинги объявлены в самом proto.
//
// StrategySearchSpec структурно идентична StrategySpec домена strategy (проектировалась
// как копия) — переиспользуем её тип и конструктор/шаблоны спека оттуда, здесь
// не дублируем.

import type { RunStatus, StrategySpec } from "../strategy";

export type { RunStatus, StrategySpec };
export { RUN_STATUS_LABEL, pct, num, fmtDateTime } from "../strategy";

const BASE = "/v1/strategysearch";

export type TrialState =
  | "TRIAL_STATE_UNSPECIFIED"
  | "TRIAL_STATE_RUNNING"
  | "TRIAL_STATE_WAITING"
  | "TRIAL_STATE_COMPLETE"
  | "TRIAL_STATE_PRUNED"
  | "TRIAL_STATE_FAIL";

export const TRIAL_STATE_LABEL: Record<TrialState, string> = {
  TRIAL_STATE_UNSPECIFIED: "—",
  TRIAL_STATE_RUNNING: "выполняется",
  TRIAL_STATE_WAITING: "в очереди",
  TRIAL_STATE_COMPLETE: "готово",
  TRIAL_STATE_PRUNED: "отсечён",
  TRIAL_STATE_FAIL: "ошибка",
};

export type BacktestConfig = {
  uid: string;
  interval: number;
  start: string;
  end: string;
  initialCash?: number;
  commissionPct?: number;
  slippagePct?: number;
  longOnly?: boolean;
  benchmarkUid?: string;
};

// 13 базовых полей (как у strategy.BacktestMetrics) + 21 расширенное поле QuantStats.
export type BacktestMetrics = {
  totalReturn: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  sqn: number;
  tradesCount: number;
  exposure: number;
  finalEquity: number;
  avgTradePct: number;
  expectancy: number;
  calmar: number;
  omega: number;
  tailRatio: number;
  valueAtRisk: number;
  conditionalValueAtRisk: number;
  skew: number;
  kurtosis: number;
  kellyCriterion: number;
  riskOfRuin: number;
  recoveryFactor: number;
  payoffRatio: number;
  gainToPainRatio: number;
  outlierWinRatio: number;
  outlierLossRatio: number;
  commonSenseRatio: number;
  ulcerIndex: number;
  serenityIndex: number;
  alpha: number;
  beta: number;
  informationRatio: number;
  rSquared: number;
  extra?: Record<string, number>;
};

// --- пространство поиска ---

export type IntRange = { min: number; max: number; step?: number };
export type FloatRange = { min: number; max: number; step?: number };
export type LogFloatRange = { min: number; max: number };
export type Choice = { values: number[] };
export type CategoricalChoice = { values: string[] };

export type ParamRange = {
  path: string;
  ints?: IntRange;
  floats?: FloatRange;
  logFloats?: LogFloatRange;
  choice?: Choice;
  categorical?: CategoricalChoice;
};

export type SeedTrial = { params: Record<string, number> };

// --- семплеры (oneof) ---

export type SamplerConfig = {
  tpe?: { nStartupTrials?: number; nEiCandidates?: number; multivariate?: boolean; group?: boolean; constantLiar?: boolean; priorWeight?: number; seed?: string };
  cmaes?: { nStartupTrials?: number; sigma0?: number; warnIndependentSampling?: boolean; restartStrategyIpop?: boolean; useSeparableCma?: boolean; seed?: string };
  random?: { seed?: string };
  grid?: Record<string, never>;
  nsga2?: { populationSize?: number; mutationProb?: number; crossoverProb?: number; seed?: string };
  qmc?: { scramble?: boolean; seed?: string };
  gp?: { nStartupTrials?: number; seed?: string };
};

export type SamplerKind = keyof SamplerConfig;

// --- прунеры (oneof) ---

export type PrunerConfig = {
  none?: Record<string, never>;
  median?: { nStartupTrials?: number; nWarmupSteps?: number; intervalSteps?: number; nMinTrials?: number };
  percentile?: { percentile?: number; nStartupTrials?: number; nWarmupSteps?: number; intervalSteps?: number; nMinTrials?: number };
  successiveHalving?: { minResource?: number; reductionFactor?: number; minEarlyStoppingRate?: number };
  hyperband?: { minResource?: number; maxResource?: number; reductionFactor?: number };
  patient?: { patience?: number; minDelta?: number };
  threshold?: { lower?: number; upper?: number; nWarmupSteps?: number; intervalSteps?: number };
};

export type PrunerKind = keyof PrunerConfig;

// --- целевая функция / бюджет / хранилище ---

export type ObjectiveMetric = { metric: string; maximize: boolean };

export type Objective = {
  metrics: ObjectiveMetric[];
  minTrades?: number;
  maxDrawdownLimit?: number;
};

export type Budget = {
  nTrials?: number;
  timeoutSeconds?: number;
  nJobs?: number;
  seed?: string;
  disableCache?: boolean;
  pruningReportIntervalBars?: number;
};

export type ClickHouseTrialSink = {
  enabled?: boolean;
  database?: string;
  trialsTable?: string;
  studiesTable?: string;
  flushBatchSize?: number;
  flushIntervalMs?: number;
};

export type Storage = {
  storageUrl?: string;
  clickhouse?: ClickHouseTrialSink;
};

export type StudyConfig = {
  studyName?: string;
  sampler?: SamplerConfig;
  pruner?: PrunerConfig;
  objective: Objective;
  budget: Budget;
  storage?: Storage;
  loadIfExists?: boolean;
  seedTrials?: SeedTrial[];
};

export type SearchProgress = {
  status: RunStatus;
  completedTrials: number;
  prunedTrials: number;
  failedTrials: number;
  totalTrials: number;
  isMultiObjective: boolean;
  bestValues?: Record<string, number>;
  bestTrialId?: string;
  paretoFrontTrialIds?: string[];
  error?: string;
};

export type SearchRun = {
  searchId: string;
  name: string;
  baseSpec?: StrategySpec;
  searchSpace?: ParamRange[];
  study?: StudyConfig;
  config?: BacktestConfig;
  progress?: SearchProgress;
  engineVersion: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
};

// --- сохранённые настройки поиска (пресеты формы) ---

export type SearchPreset = {
  id: string;
  name: string;
  baseSpec?: StrategySpec;
  searchSpace?: ParamRange[];
  study?: StudyConfig;
  config?: BacktestConfig;
  createdAt?: string;
};

export type Trial = {
  trialId: string;
  number: number;
  spec?: StrategySpec;
  specHash: string;
  params?: Record<string, number>;
  values?: Record<string, number>;
  state: TrialState;
  metrics?: BacktestMetrics;
  isParetoOptimal?: boolean;
  backtestRunId?: string;
  createdAt?: string;
  completedAt?: string;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (body && typeof body === "object" && "message" in body) {
      msg = String((body as { message: unknown }).message);
    } else if (typeof body === "string" && body) {
      msg = body;
    }
    throw new Error(msg);
  }
  return (body ?? {}) as T;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function submitSearch(body: {
  name?: string;
  baseSpec: StrategySpec;
  searchSpace?: ParamRange[];
  study: StudyConfig;
  config: BacktestConfig;
}): Promise<{ searchId: string; status: RunStatus }> {
  return call(`/searches`, { method: "POST", body: JSON.stringify(body) });
}

export function getSearchProgress(searchId: string): Promise<SearchRun> {
  return call(`/searches/${encodeURIComponent(searchId)}`);
}

export function getBestTrials(searchId: string, topK = 10): Promise<{ items?: Trial[] }> {
  return call(`/searches/${encodeURIComponent(searchId)}/best${qs({ topK })}`);
}

export function listSearches(opts: { status?: RunStatus; limit?: number; offset?: number } = {}): Promise<{
  items?: SearchRun[];
  total?: number;
}> {
  return call(
    `/searches${qs({ status: opts.status, limit: opts.limit ?? 100, offset: opts.offset })}`,
  );
}

export function cancelSearch(searchId: string): Promise<SearchRun> {
  return call(`/searches/${encodeURIComponent(searchId)}:cancel`, { method: "POST", body: "{}" });
}

export function createSearchPreset(body: {
  name: string;
  baseSpec: StrategySpec;
  searchSpace?: ParamRange[];
  study: StudyConfig;
  config: BacktestConfig;
}): Promise<SearchPreset> {
  return call(`/presets`, { method: "POST", body: JSON.stringify(body) });
}

export function listSearchPresets(opts: { limit?: number; offset?: number } = {}): Promise<{
  items?: SearchPreset[];
  total?: number;
}> {
  return call(`/presets${qs({ limit: opts.limit ?? 100, offset: opts.offset })}`);
}

export function deleteSearchPreset(id: string): Promise<{ id: string }> {
  return call(`/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
}
