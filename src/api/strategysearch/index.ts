// REST-клиент домена strategysearch (Optuna-поиск) через Envoy grpc_json_transcoder
// (/v1/strategysearch/*) — проще, чем протаскивать сгенерированный grpc-web клиент
// через vite-prebundle.

const BASE = "/v1/strategysearch";

export type RunStatus =
  | "RUN_STATUS_UNSPECIFIED"
  | "RUN_QUEUED"
  | "RUN_RUNNING"
  | "RUN_SUCCEEDED"
  | "RUN_FAILED"
  | "RUN_CANCELED";

export type StrategySpec = Record<string, unknown>;

// --- каталог стратегий ---

export type Strategy = {
  id: string;
  name: string;
  description: string;
  spec: StrategySpec;
  specHash: string;
  specVersion: number;
  archived: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ValidationIssue = { path: string; message: string };

// --- отдельные (не связанные с Optuna-поиском) прогоны бэктеста ---

export type EquityPoint = {
  time: string;
  equity: number;
  cash: number;
  positionValue: number;
  drawdown: number;
  ret: number;
};

export type TradeRecord = {
  tradeId: number;
  isLong: boolean;
  entryTime: string;
  entryPrice: number;
  exitTime: string;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  barsHeld: number;
  mae: number;
  mfe: number;
  entryReason: string;
  exitReason: string;
};

export type BacktestIndicatorPoint = { time: string; values: Record<string, number> };

export type BacktestIndicatorSeries = {
  indicatorId: string;
  indicator: string;
  outputKey: string;
  overlay: boolean;
  points: BacktestIndicatorPoint[];
};

export type BacktestRun = {
  runId: string;
  strategyId: string;
  spec: StrategySpec;
  config: BacktestConfig;
  status: RunStatus;
  error: string;
  engineVersion: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type BacktestRunListItem = { run: BacktestRun; metrics?: BacktestMetrics };

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  RUN_STATUS_UNSPECIFIED: "—",
  RUN_QUEUED: "в очереди",
  RUN_RUNNING: "выполняется",
  RUN_SUCCEEDED: "готово",
  RUN_FAILED: "ошибка",
  RUN_CANCELED: "отменён",
};

export function pct(value: number | undefined | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function num(value: number | undefined | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function fmtDateTime(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1971) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  // uid/interval/start/end необязательны, когда SearchRun.marketSpace задан —
  // тогда инструмент/интервал/период сэмплируются на трайле из marketCandidates,
  // а не фиксированы для всего поиска (см. StrategyTemplate/MarketSpace ниже).
  uid?: string;
  interval?: number;
  start?: string;
  end?: string;
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

// --- структурный поиск (палитра индикаторов) ---
//
// В отличие от ParamRange/searchSpace (тюнинг СКАЛЯРОВ фиксированного baseSpec),
// template задаёт саму СТРУКТУРУ: индикаторы/условия входа-выхода собирает
// движок на каждом трайле (см. engine/search/compose.py). baseSpec при этом
// всё ещё нужен — из него берутся sizing/risk/warmupBars.

export type IndicatorTypeRanges = {
  indicatorType: string;
  fieldRanges: ParamRange[];
};

// CompareOp enum-имена ("COMPARE_OP_GT" и т.п.) — те же строки, что и в
// StructureSpace генетического поиска (SearchBuilders.tsx: OP_LABELS).
export type StrategyTemplate = {
  indicatorPalette: string[];
  maxIndicators: number;
  maxConditionsEntry: number;
  maxConditionsExit?: number; // 0/не задано => exit строится автоматически (обратное условие)
  typeRanges?: IndicatorTypeRanges[];
  allowedOps?: string[];
};

// --- рыночный поиск (инструмент/интервал/окно) ---

export type MarketMode = "MARKET_MODE_PALETTE" | "MARKET_MODE_RANDOM";

export type MarketCandidate = {
  uid: string;
  interval: number;
  availableStart?: string;
  availableEnd?: string;
};

export type MarketSpace = {
  mode: MarketMode;
  uidFilter?: string[]; // PALETTE: точный список; RANDOM: необязательный доп. отбор
  intervalFilter?: number[];
  periodLengthDays: number;
  minHistoryDays?: number;
};

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
  template?: StrategyTemplate;
  marketSpace?: MarketSpace;
  marketCandidates?: MarketCandidate[];
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
  template?: StrategyTemplate;
  marketSpace?: MarketSpace;
};

export type ParamImportance = { path: string; importance: number };

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
  template?: StrategyTemplate;
  marketSpace?: MarketSpace;
}): Promise<{ searchId: string; status: RunStatus }> {
  return call(`/searches`, { method: "POST", body: JSON.stringify(body) });
}

export function getSearchProgress(searchId: string): Promise<SearchRun> {
  return call(`/searches/${encodeURIComponent(searchId)}`);
}

export function getBestTrials(searchId: string, topK = 10): Promise<{ items?: Trial[] }> {
  return call(`/searches/${encodeURIComponent(searchId)}/best${qs({ topK })}`);
}

// Все трайлы поиска (любой state), по возрастанию номера — источник для
// графиков (история оптимизации/parallel coordinate/slice), в отличие от
// getBestTrials, который отдаёт только complete-трайлы.
export function listSearchTrials(
  searchId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ items?: Trial[]; total?: number }> {
  return call(`/searches/${encodeURIComponent(searchId)}/trials${qs({ limit: opts.limit ?? 500, offset: opts.offset })}`);
}

// Важность параметров поиска (optuna fANOVA), считается по требованию на
// движке через реконструкцию Study из её RDB-хранилища. Пустой список, если
// поиск запущен без storage или трайлов ещё недостаточно.
export function getParamImportances(searchId: string, opts: { metric?: string } = {}): Promise<{ items?: ParamImportance[] }> {
  return call(`/searches/${encodeURIComponent(searchId)}/importances${qs({ metric: opts.metric })}`);
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
  template?: StrategyTemplate;
  marketSpace?: MarketSpace;
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

// --- каталог стратегий ---

export function listStrategies(opts: {
  q?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items?: Strategy[]; total?: number }> {
  return call(
    `/strategies${qs({
      q: opts.q,
      includeArchived: opts.includeArchived,
      limit: opts.limit ?? 200,
      offset: opts.offset,
    })}`,
  );
}

export function getStrategy(id: string): Promise<Strategy> {
  return call(`/strategies/${encodeURIComponent(id)}`);
}

export function createStrategy(body: {
  name: string;
  description?: string;
  spec: StrategySpec;
}): Promise<Strategy> {
  return call(`/strategies`, { method: "POST", body: JSON.stringify(body) });
}

export function updateStrategy(
  id: string,
  body: { name: string; description?: string; spec: StrategySpec },
): Promise<Strategy> {
  return call(`/strategies/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteStrategy(id: string): Promise<{ id: string; archived: boolean }> {
  return call(`/strategies/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// DeleteStrategy на бэкенде переключает архивный статус — для архивной стратегии
// этот же вызов возвращает её из архива.
export function restoreStrategy(id: string): Promise<{ id: string; archived: boolean }> {
  return call(`/strategies/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function validateStrategy(
  spec: StrategySpec,
): Promise<{ ok: boolean; issues?: ValidationIssue[] }> {
  return call(`/strategies:validate`, {
    method: "POST",
    body: JSON.stringify({ spec }),
  });
}

// --- бэктесты (отдельные, не связанные с поиском) ---

export function submitBacktest(body: {
  strategyId?: string;
  spec?: StrategySpec;
  config: BacktestConfig;
  force?: boolean;
}): Promise<{ runId: string; status: RunStatus; reused: boolean }> {
  return call(`/backtests`, { method: "POST", body: JSON.stringify(body) });
}

export function getBacktestStatus(runId: string): Promise<BacktestRun> {
  return call(`/backtests/${encodeURIComponent(runId)}`);
}

export function getBacktestResult(
  runId: string,
  opts: {
    includeEquity?: boolean;
    includeTrades?: boolean;
    includeIndicators?: boolean;
    equityMaxPoints?: number;
  } = {},
): Promise<{
  run: BacktestRun;
  metrics?: BacktestMetrics;
  equity?: EquityPoint[];
  trades?: TradeRecord[];
  indicators?: BacktestIndicatorSeries[];
}> {
  return call(
    `/backtests/${encodeURIComponent(runId)}/result${qs({
      includeEquity: opts.includeEquity,
      includeTrades: opts.includeTrades,
      includeIndicators: opts.includeIndicators,
      equityMaxPoints: opts.equityMaxPoints,
    })}`,
  );
}

export function listBacktestRuns(opts: {
  strategyId?: string;
  uid?: string;
  status?: RunStatus;
  sortBy?: string;
  sortDesc?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items?: BacktestRunListItem[]; total?: number }> {
  return call(
    `/backtests${qs({
      strategyId: opts.strategyId,
      uid: opts.uid,
      status: opts.status,
      sortBy: opts.sortBy,
      sortDesc: opts.sortDesc,
      limit: opts.limit ?? 100,
      offset: opts.offset,
    })}`,
  );
}

export function cancelBacktest(runId: string): Promise<BacktestRun> {
  return call(`/backtests/${encodeURIComponent(runId)}:cancel`, {
    method: "POST",
    body: "{}",
  });
}
