// REST-клиент домена стратегий через Envoy grpc_json_transcoder (/v1/strategy/*).
// Фронт больше нигде не ходит по REST, но для этого сервиса это проще, чем
// протаскивать сгенерированный grpc-web клиент через vite-prebundle.

const BASE = "/v1/strategy";

export type RunStatus =
  | "RUN_STATUS_UNSPECIFIED"
  | "RUN_QUEUED"
  | "RUN_RUNNING"
  | "RUN_SUCCEEDED"
  | "RUN_FAILED"
  | "RUN_CANCELED";

export type StrategySpec = Record<string, unknown>;

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

export type BacktestConfig = {
  uid: string;
  interval: number;
  start: string;
  end: string;
  initialCash?: number;
  commissionPct?: number;
  slippagePct?: number;
  longOnly?: boolean;
};

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
  extra?: Record<string, number>;
};

export type BacktestRun = {
  runId: string;
  strategyId: string;
  spec: StrategySpec;
  config: BacktestConfig;
  status: RunStatus;
  error: string;
  engineVersion: string;
  searchRunId: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
};

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

export type BacktestRunListItem = { run: BacktestRun; metrics?: BacktestMetrics };

export type ValidationIssue = { path: string; message: string };

export type Objective = {
  metric: string;
  maximize: boolean;
  minTrades?: number;
  maxDrawdownLimit?: number;
};

export type SearchBudget = {
  maxEvaluations?: number;
  maxSeconds?: number;
  concurrency?: number;
  population?: number;
  generations?: number;
  seed?: string;
};

export type SearchProgress = {
  status: RunStatus;
  evaluated: number;
  total: number;
  bestScore: number;
  bestCandidateId: string;
  currentGeneration: number;
  error: string;
};

export type SearchRun = {
  searchId: string;
  baseStrategyId: string;
  name: string;
  method: string;
  searchSpace?: unknown[];
  structure?: Record<string, unknown>;
  objective?: Objective;
  budget?: SearchBudget;
  config?: BacktestConfig;
  progress?: SearchProgress;
  engineVersion: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type SearchCandidate = {
  id: string;
  spec: StrategySpec;
  specHash: string;
  score: number;
  metrics?: BacktestMetrics;
  rank: number;
  generation: number;
  backtestRunId: string;
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

// --- стратегии ---

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

export function validateStrategy(
  spec: StrategySpec,
): Promise<{ ok: boolean; issues?: ValidationIssue[] }> {
  return call(`/strategies:validate`, {
    method: "POST",
    body: JSON.stringify({ spec }),
  });
}

// --- бэктесты ---

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
  searchRunId?: string;
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
      searchRunId: opts.searchRunId,
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

// --- поиск ---

export function submitSearch(body: {
  baseStrategyId?: string;
  baseSpec?: StrategySpec;
  name?: string;
  objective: Objective;
  budget: SearchBudget;
  config: BacktestConfig;
  searchSpace?: unknown[];
  structure?: Record<string, unknown>;
}): Promise<{ searchId: string; status: RunStatus }> {
  return call(`/searches`, { method: "POST", body: JSON.stringify(body) });
}

export function getSearchProgress(searchId: string): Promise<SearchRun> {
  return call(`/searches/${encodeURIComponent(searchId)}`);
}

export function getBestStrategies(
  searchId: string,
  topK = 10,
): Promise<{ items?: SearchCandidate[] }> {
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
  return call(`/searches/${encodeURIComponent(searchId)}:cancel`, {
    method: "POST",
    body: "{}",
  });
}

// --- утилиты отображения ---

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
