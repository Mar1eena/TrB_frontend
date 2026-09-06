import { useCallback, useEffect, useRef, useState } from "react";
import { useNotify } from "../../notifications";
import { CANDLE_INTERVALS, fetchInstruments } from "../../api/scheduler";
import * as api from "../../api/strategy";
import {
  DEFAULT_SEARCH_SPACE,
  DEFAULT_STRUCTURE,
  SPEC_TEMPLATES,
  type SpecTemplate,
} from "./templates";
import EquityChart from "./EquityChart";
import "../SchedulerPanel/SchedulerPanel.css";
import "../../styles/tables.css";
import "./StrategyPanel.css";

type Tab = "strategies" | "backtests" | "search";
type Instrument = { uid: string; ticker: string; name: string };

const ACTIVE_STATUSES: api.RunStatus[] = ["RUN_QUEUED", "RUN_RUNNING"];

function intervalLabel(v: number): string {
  return CANDLE_INTERVALS.find((iv) => iv.value === v)?.label ?? String(v);
}

function statusChip(status: api.RunStatus) {
  const cls =
    status === "RUN_SUCCEEDED"
      ? "ok"
      : status === "RUN_FAILED"
        ? "err"
        : status === "RUN_RUNNING"
          ? "run"
          : status === "RUN_CANCELED"
            ? "muted"
            : "queued";
  return <span className={`strategy-chip ${cls}`}>{api.RUN_STATUS_LABEL[status]}</span>;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function toRfc3339(local: string): string {
  // datetime-local -> RFC3339 UTC
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StrategyPanel() {
  const notify = useNotify();
  const [tab, setTab] = useState<Tab>("strategies");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [strategies, setStrategies] = useState<api.Strategy[]>([]);
  const [reloadStrategiesToken, setReloadStrategies] = useState(0);

  // навигация из вкладки "Стратегии" в "Бэктест"
  const [prefillBacktestStrategy, setPrefillBacktestStrategy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchInstruments("", 5000, { lite: true });
        if (!cancelled) {
          setInstruments(
            rows.map((r) => ({ uid: r.uid, ticker: r.ticker || "", name: r.name || r.uid })),
          );
        }
      } catch {
        /* каталог не критичен */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadStrategies = useCallback(async () => {
    try {
      const res = await api.listStrategies({ limit: 500 });
      setStrategies(res.items ?? []);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось загрузить стратегии");
    }
  }, [notify]);

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies, reloadStrategiesToken]);

  return (
    <section className="panel-page strategy-panel">
      <header className="scheduler-header">
        <p className="eyebrow">Сервисы</p>
        <h1>Стратегии</h1>
        <p>
          Составление стратегий (дерево правил над индикаторами), бэктесты на{" "}
          <code>backtrader</code> и генетический поиск. Результаты — метрики,
          кривая капитала и сделки.
        </p>
      </header>

      <div className="strategy-tabs">
        <button
          type="button"
          className={`strategy-tab ${tab === "strategies" ? "is-active" : ""}`}
          onClick={() => setTab("strategies")}
        >
          Стратегии
        </button>
        <button
          type="button"
          className={`strategy-tab ${tab === "backtests" ? "is-active" : ""}`}
          onClick={() => setTab("backtests")}
        >
          Бэктесты
        </button>
        <button
          type="button"
          className={`strategy-tab ${tab === "search" ? "is-active" : ""}`}
          onClick={() => setTab("search")}
        >
          Поиск
        </button>
      </div>

      <div className="strategy-tab-body">
        {tab === "strategies" ? (
          <StrategiesTab
            strategies={strategies}
            onChanged={() => setReloadStrategies((n) => n + 1)}
            onRunBacktest={(id) => {
              setPrefillBacktestStrategy(id);
              setTab("backtests");
            }}
          />
        ) : null}
        {tab === "backtests" ? (
          <BacktestsTab
            strategies={strategies}
            instruments={instruments}
            prefillStrategyId={prefillBacktestStrategy}
            onPrefillConsumed={() => setPrefillBacktestStrategy(null)}
          />
        ) : null}
        {tab === "search" ? (
          <SearchTab strategies={strategies} instruments={instruments} onCreatedStrategy={loadStrategies} />
        ) : null}
      </div>
    </section>
  );
}

/* ---------------- Стратегии ---------------- */

function StrategiesTab({
  strategies,
  onChanged,
  onRunBacktest,
}: {
  strategies: api.Strategy[];
  onChanged: () => void;
  onRunBacktest: (id: string) => void;
}) {
  const notify = useNotify();
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; strategy: api.Strategy } | null>(
    null,
  );
  const [includeArchived, setIncludeArchived] = useState(false);

  const visible = includeArchived ? strategies : strategies.filter((s) => !s.archived);

  const archive = async (s: api.Strategy) => {
    if (!window.confirm(`Архивировать стратегию «${s.name}»?`)) return;
    try {
      await api.deleteStrategy(s.id);
      notify.success("Стратегия архивирована");
      onChanged();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка");
    }
  };

  return (
    <>
      <div className="filters-bar strategy-toolbar">
        <button type="button" className="btn primary" onClick={() => setEditor({ mode: "create" })}>
          + Новая стратегия
        </button>
        <label className="strategy-inline-check">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          показывать архивные
        </label>
        <span className="filters-meta">
          <span className="hint">{visible.length} шт.</span>
        </span>
      </div>

      <div className="table-scroll table-scroll-fill strategy-table-scroll">
        <table className="strategy-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Индикаторы</th>
              <th>Обновлена</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={4} className="hint">
                  Стратегий пока нет — создайте первую по шаблону.
                </td>
              </tr>
            ) : null}
            {visible.map((s) => {
              const inds = Array.isArray(s.spec?.indicators)
                ? (s.spec.indicators as { settings?: Record<string, unknown> }[])
                    .map((i) => (i.settings ? Object.keys(i.settings)[0] : "?"))
                    .join(", ")
                : "—";
              return (
                <tr key={s.id} className={s.archived ? "is-archived" : ""}>
                  <td>
                    <div className="strategy-name">{s.name}</div>
                    {s.description ? <div className="strategy-sub">{s.description}</div> : null}
                  </td>
                  <td className="mono">{inds || "—"}</td>
                  <td className="table-datetime">{api.fmtDateTime(s.updatedAt)}</td>
                  <td className="strategy-row-actions">
                    <button type="button" className="btn ghost" onClick={() => setEditor({ mode: "edit", strategy: s })}>
                      Изменить
                    </button>
                    <button type="button" className="btn ghost" onClick={() => onRunBacktest(s.id)}>
                      Бэктест
                    </button>
                    {!s.archived ? (
                      <button type="button" className="btn danger" onClick={() => void archive(s)}>
                        В архив
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editor ? (
        <SpecEditorModal
          initial={editor.mode === "edit" ? editor.strategy : null}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function SpecEditorModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: api.Strategy | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const notify = useNotify();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [templateId, setTemplateId] = useState<string>(SPEC_TEMPLATES[0].id);
  const [text, setText] = useState(() =>
    JSON.stringify(initial?.spec ?? SPEC_TEMPLATES[0].spec, null, 2),
  );
  const [issues, setIssues] = useState<api.ValidationIssue[] | null>(null);
  const [busy, setBusy] = useState(false);

  const applyTemplate = (tpl: SpecTemplate) => {
    setTemplateId(tpl.id);
    setText(JSON.stringify(tpl.spec, null, 2));
    setIssues(null);
  };

  const parse = (): api.StrategySpec | null => {
    try {
      return JSON.parse(text) as api.StrategySpec;
    } catch (err) {
      notify.error(`Некорректный JSON: ${err instanceof Error ? err.message : ""}`);
      return null;
    }
  };

  const validate = async () => {
    const spec = parse();
    if (!spec) return;
    setBusy(true);
    try {
      const res = await api.validateStrategy(spec);
      setIssues(res.issues ?? []);
      if (res.ok) notify.success("Стратегия валидна");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка проверки");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const spec = parse();
    if (!spec) return;
    if (!name.trim()) {
      notify.error("Укажите название");
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        await api.updateStrategy(initial.id, { name: name.trim(), description, spec });
      } else {
        await api.createStrategy({ name: name.trim(), description, spec });
      }
      notify.success(initial ? "Стратегия обновлена" : "Стратегия создана");
      onSaved();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="strategy-modal-overlay" onClick={onClose}>
      <div className="strategy-modal wide" onClick={(e) => e.stopPropagation()}>
        <header className="strategy-modal-head">
          <h2>{initial ? "Изменить стратегию" : "Новая стратегия"}</h2>
          <button type="button" className="strategy-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="strategy-form-grid">
          <label className="filter-field">
            <span>Название</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="RSI mean-reversion SBER" />
          </label>
          <label className="filter-field">
            <span>Описание</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Кратко" />
          </label>
          {!initial ? (
            <label className="filter-field">
              <span>Шаблон</span>
              <select
                value={templateId}
                onChange={(e) => {
                  const tpl = SPEC_TEMPLATES.find((t) => t.id === e.target.value);
                  if (tpl) applyTemplate(tpl);
                }}
              >
                {SPEC_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <label className="filter-field strategy-json-field">
          <span>StrategySpec (JSON)</span>
          <textarea
            spellCheck={false}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setIssues(null);
            }}
            rows={20}
          />
        </label>

        {issues ? (
          issues.length === 0 ? (
            <p className="strategy-ok">✔ Ошибок не найдено</p>
          ) : (
            <ul className="strategy-issues">
              {issues.map((is, i) => (
                <li key={i}>
                  <code>{is.path}</code> — {is.message}
                </li>
              ))}
            </ul>
          )
        ) : null}

        <footer className="strategy-modal-actions">
          <button type="button" className="btn ghost" onClick={() => void validate()} disabled={busy}>
            Проверить
          </button>
          <button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>
            {initial ? "Сохранить" : "Создать"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------- Бэктесты ---------------- */

function BacktestsTab({
  strategies,
  instruments,
  prefillStrategyId,
  onPrefillConsumed,
}: {
  strategies: api.Strategy[];
  instruments: Instrument[];
  prefillStrategyId: string | null;
  onPrefillConsumed: () => void;
}) {
  const notify = useNotify();
  const [strategyId, setStrategyId] = useState("");
  const [uid, setUid] = useState("");
  const [interval, setIntervalVal] = useState(5);
  const [start, setStart] = useState(() => toLocalInput(isoDaysAgo(365)));
  const [end, setEnd] = useState(() => toLocalInput(new Date().toISOString()));
  const [cash, setCash] = useState(100000);
  const [commission, setCommission] = useState(0.0005);
  const [longOnly, setLongOnly] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [runs, setRuns] = useState<api.BacktestRunListItem[]>([]);
  const [openRun, setOpenRun] = useState<string | null>(null);

  useEffect(() => {
    if (prefillStrategyId) {
      setStrategyId(prefillStrategyId);
      onPrefillConsumed();
    }
  }, [prefillStrategyId, onPrefillConsumed]);

  const loadRuns = useCallback(async () => {
    try {
      const res = await api.listBacktestRuns({ limit: 100, sortBy: "created_at", sortDesc: true });
      setRuns(res.items ?? []);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось загрузить прогоны");
    }
  }, [notify]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // авто-обновление, пока есть активные прогоны
  useEffect(() => {
    const hasActive = runs.some((r) => ACTIVE_STATUSES.includes(r.run.status));
    if (!hasActive) return;
    const id = window.setInterval(() => void loadRuns(), 3000);
    return () => window.clearInterval(id);
  }, [runs, loadRuns]);

  const submit = async () => {
    if (!strategyId) {
      notify.error("Выберите стратегию");
      return;
    }
    if (!uid) {
      notify.error("Выберите инструмент");
      return;
    }
    const startIso = toRfc3339(start);
    const endIso = toRfc3339(end);
    if (!startIso || !endIso) {
      notify.error("Укажите период");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitBacktest({
        strategyId,
        config: {
          uid,
          interval,
          start: startIso,
          end: endIso,
          initialCash: cash,
          commissionPct: commission,
          longOnly,
        },
      });
      notify.success(res.reused ? "Такой прогон уже есть — открываю результат" : "Бэктест поставлен в очередь");
      await loadRuns();
      setOpenRun(res.runId);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось запустить");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="filters-bar">
        <div className="filters-row filters-fields">
          <label className="filter-field" style={{ flexBasis: "16rem" }}>
            <span>Стратегия</span>
            <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
              <option value="">— выберите —</option>
              {strategies
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Инструмент (uid)</span>
            <input
              list="strategy-instruments"
              value={uid}
              onChange={(e) => setUid(e.target.value.trim())}
              placeholder="uid или тикер"
            />
            <datalist id="strategy-instruments">
              {instruments.slice(0, 2000).map((i) => (
                <option key={i.uid} value={i.uid}>
                  {i.ticker} — {i.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="filter-field">
            <span>Интервал</span>
            <select value={interval} onChange={(e) => setIntervalVal(Number(e.target.value))}>
              {CANDLE_INTERVALS.map((iv) => (
                <option key={iv.value} value={iv.value}>
                  {iv.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>С</span>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>По</span>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>Капитал</span>
            <input type="number" value={cash} onChange={(e) => setCash(Number(e.target.value))} />
          </label>
          <label className="filter-field">
            <span>Комиссия</span>
            <input
              type="number"
              step="0.0001"
              value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
            />
          </label>
          <label className="strategy-inline-check">
            <input type="checkbox" checked={longOnly} onChange={(e) => setLongOnly(e.target.checked)} />
            только long
          </label>
        </div>
        <div className="filters-row filters-actions">
          <button type="button" className="btn primary" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Запуск…" : "Запустить бэктест"}
          </button>
          <button type="button" className="btn ghost" onClick={() => void loadRuns()}>
            Обновить
          </button>
        </div>
      </div>

      <div className="table-scroll table-scroll-fill strategy-table-scroll">
        <table className="strategy-table">
          <thead>
            <tr>
              <th>Стратегия</th>
              <th>Инструмент</th>
              <th>Период</th>
              <th>Статус</th>
              <th className="num">Доходность</th>
              <th className="num">CAGR</th>
              <th className="num">Sharpe</th>
              <th className="num">Просадка</th>
              <th className="num">Сделок</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={10} className="hint">
                  Прогонов ещё нет.
                </td>
              </tr>
            ) : null}
            {runs.map(({ run, metrics }) => {
              const strat = strategies.find((s) => s.id === run.strategyId);
              return (
                <tr key={run.runId} className="is-clickable" onClick={() => setOpenRun(run.runId)}>
                  <td>{strat?.name ?? <span className="mono">{run.strategyId.slice(0, 8) || "inline"}</span>}</td>
                  <td className="mono">{run.config?.uid?.slice(0, 10)}</td>
                  <td className="table-datetime">
                    {intervalLabel(run.config?.interval)} · {api.fmtDateTime(run.config?.start)} —{" "}
                    {api.fmtDateTime(run.config?.end)}
                  </td>
                  <td>{statusChip(run.status)}</td>
                  <td className="num">{api.pct(metrics?.totalReturn)}</td>
                  <td className="num">{api.pct(metrics?.cagr)}</td>
                  <td className="num">{api.num(metrics?.sharpe)}</td>
                  <td className="num">{api.pct(metrics?.maxDrawdown)}</td>
                  <td className="num">{metrics?.tradesCount ?? "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenRun(run.runId);
                      }}
                    >
                      Открыть
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openRun ? <BacktestResultModal runId={openRun} onClose={() => setOpenRun(null)} onRefreshList={loadRuns} /> : null}
    </>
  );
}

const METRIC_ROWS: { key: keyof api.BacktestMetrics; label: string; kind: "pct" | "num" }[] = [
  { key: "totalReturn", label: "Доходность", kind: "pct" },
  { key: "cagr", label: "CAGR", kind: "pct" },
  { key: "sharpe", label: "Sharpe", kind: "num" },
  { key: "sortino", label: "Sortino", kind: "num" },
  { key: "maxDrawdown", label: "Макс. просадка", kind: "pct" },
  { key: "winRate", label: "Win rate", kind: "pct" },
  { key: "profitFactor", label: "Profit factor", kind: "num" },
  { key: "sqn", label: "SQN", kind: "num" },
  { key: "exposure", label: "В рынке", kind: "pct" },
  { key: "avgTradePct", label: "Ср. сделка", kind: "pct" },
  { key: "expectancy", label: "Ожидание", kind: "num" },
  { key: "finalEquity", label: "Капитал в конце", kind: "num" },
];

function BacktestResultModal({
  runId,
  onClose,
  onRefreshList,
}: {
  runId: string;
  onClose: () => void;
  onRefreshList: () => void;
}) {
  const notify = useNotify();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getBacktestResult>> | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getBacktestResult(runId, {
        includeEquity: true,
        includeTrades: true,
        equityMaxPoints: 4000,
      });
      setData(res);
      setLoading(false);
      return res.run.status;
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось загрузить результат");
      setLoading(false);
      return "RUN_FAILED" as api.RunStatus;
    }
  }, [runId, notify]);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      const status = await load();
      if (!stopped && ACTIVE_STATUSES.includes(status)) {
        pollRef.current = window.setInterval(async () => {
          const s = await load();
          if (!ACTIVE_STATUSES.includes(s)) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            onRefreshList();
          }
        }, 3000);
      }
    })();
    return () => {
      stopped = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load, onRefreshList]);

  const cancel = async () => {
    try {
      await api.cancelBacktest(runId);
      notify.info("Отмена запрошена");
      void load();
      onRefreshList();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const run = data?.run;
  const metrics = data?.metrics;
  const trades = data?.trades ?? [];

  return (
    <div className="strategy-modal-overlay" onClick={onClose}>
      <div className="strategy-modal wide" onClick={(e) => e.stopPropagation()}>
        <header className="strategy-modal-head">
          <h2>
            Результат бэктеста {run ? statusChip(run.status) : null}
          </h2>
          <button type="button" className="strategy-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        {loading ? <p className="hint">Загрузка…</p> : null}

        {run ? (
          <div className="strategy-result-meta">
            <span className="mono">{run.config?.uid}</span> · {intervalLabel(run.config?.interval)} ·{" "}
            {api.fmtDateTime(run.config?.start)} — {api.fmtDateTime(run.config?.end)}
            {run.engineVersion ? <span className="strategy-sub"> · {run.engineVersion}</span> : null}
            {run.error ? <div className="strategy-error">{run.error}</div> : null}
          </div>
        ) : null}

        {ACTIVE_STATUSES.includes(run?.status ?? "RUN_STATUS_UNSPECIFIED") ? (
          <div className="strategy-running">
            <span className="strategy-spinner" /> Прогон выполняется, результат обновится автоматически…
            <button type="button" className="btn ghost" onClick={() => void cancel()}>
              Отменить
            </button>
          </div>
        ) : null}

        {metrics ? (
          <div className="strategy-metrics-grid">
            {METRIC_ROWS.map((m) => {
              const v = metrics[m.key] as number | undefined;
              return (
                <div key={String(m.key)} className="strategy-metric">
                  <span className="strategy-metric-label">{m.label}</span>
                  <span className="strategy-metric-value">
                    {m.kind === "pct" ? api.pct(v) : api.num(v)}
                  </span>
                </div>
              );
            })}
            <div className="strategy-metric">
              <span className="strategy-metric-label">Сделок</span>
              <span className="strategy-metric-value">{metrics.tradesCount}</span>
            </div>
          </div>
        ) : null}

        {data?.equity && data.equity.length > 1 ? (
          <div className="strategy-chart-wrap">
            <EquityChart points={data.equity} />
          </div>
        ) : null}

        {trades.length > 0 ? (
          <div className="strategy-trades">
            <h3>Сделки ({trades.length})</h3>
            <div className="table-scroll strategy-trades-scroll">
              <table className="strategy-table compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Напр.</th>
                    <th>Вход</th>
                    <th className="num">Цена</th>
                    <th>Выход</th>
                    <th className="num">Цена</th>
                    <th className="num">P/L</th>
                    <th className="num">P/L %</th>
                    <th className="num">Баров</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.tradeId} className={t.pnl >= 0 ? "trade-win" : "trade-loss"}>
                      <td>{t.tradeId}</td>
                      <td>{t.isLong ? "long" : "short"}</td>
                      <td className="table-datetime">{api.fmtDateTime(t.entryTime)}</td>
                      <td className="num">{api.num(t.entryPrice, 4)}</td>
                      <td className="table-datetime">{api.fmtDateTime(t.exitTime)}</td>
                      <td className="num">{api.num(t.exitPrice, 4)}</td>
                      <td className="num">{api.num(t.pnl)}</td>
                      <td className="num">{api.pct(t.pnlPct)}</td>
                      <td className="num">{t.barsHeld}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Поиск ---------------- */

function SearchTab({
  strategies,
  instruments,
  onCreatedStrategy,
}: {
  strategies: api.Strategy[];
  instruments: Instrument[];
  onCreatedStrategy: () => void;
}) {
  const notify = useNotify();
  const [baseStrategyId, setBaseStrategyId] = useState("");
  const [uid, setUid] = useState("");
  const [interval, setIntervalVal] = useState(5);
  const [start, setStart] = useState(() => toLocalInput(isoDaysAgo(365)));
  const [end, setEnd] = useState(() => toLocalInput(new Date().toISOString()));
  const [metric, setMetric] = useState("sharpe");
  const [minTrades, setMinTrades] = useState(10);
  const [population, setPopulation] = useState(20);
  const [generations, setGenerations] = useState(8);
  const [maxSeconds, setMaxSeconds] = useState(600);
  const [spaceText, setSpaceText] = useState(() => JSON.stringify(DEFAULT_SEARCH_SPACE, null, 2));
  const [structureText, setStructureText] = useState(() => JSON.stringify(DEFAULT_STRUCTURE, null, 2));
  const [submitting, setSubmitting] = useState(false);

  const [searches, setSearches] = useState<api.SearchRun[]>([]);
  const [openSearch, setOpenSearch] = useState<string | null>(null);

  const loadSearches = useCallback(async () => {
    try {
      const res = await api.listSearches({ limit: 100 });
      setSearches(res.items ?? []);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось загрузить поиски");
    }
  }, [notify]);

  useEffect(() => {
    void loadSearches();
  }, [loadSearches]);

  useEffect(() => {
    const hasActive = searches.some((s) =>
      ACTIVE_STATUSES.includes(s.progress?.status ?? "RUN_QUEUED"),
    );
    if (!hasActive) return;
    const id = window.setInterval(() => void loadSearches(), 4000);
    return () => window.clearInterval(id);
  }, [searches, loadSearches]);

  const submit = async () => {
    if (!baseStrategyId) {
      notify.error("Выберите базовую стратегию");
      return;
    }
    if (!uid) {
      notify.error("Выберите инструмент");
      return;
    }
    let searchSpace: unknown[];
    let structure: Record<string, unknown>;
    try {
      searchSpace = JSON.parse(spaceText);
      structure = JSON.parse(structureText);
    } catch (err) {
      notify.error(`JSON пространства поиска: ${err instanceof Error ? err.message : ""}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitSearch({
        baseStrategyId,
        objective: { metric, maximize: true, minTrades },
        budget: { population, generations, maxSeconds, concurrency: 2 },
        config: {
          uid,
          interval,
          start: toRfc3339(start),
          end: toRfc3339(end),
          initialCash: 100000,
          commissionPct: 0.0005,
          longOnly: true,
        },
        searchSpace,
        structure,
      });
      notify.success("Поиск запущен");
      await loadSearches();
      setOpenSearch(res.searchId);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось запустить поиск");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="filters-bar">
        <div className="filters-row filters-fields">
          <label className="filter-field" style={{ flexBasis: "16rem" }}>
            <span>Базовая стратегия</span>
            <select value={baseStrategyId} onChange={(e) => setBaseStrategyId(e.target.value)}>
              <option value="">— выберите —</option>
              {strategies
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Инструмент</span>
            <input list="strategy-instruments-search" value={uid} onChange={(e) => setUid(e.target.value.trim())} />
            <datalist id="strategy-instruments-search">
              {instruments.slice(0, 2000).map((i) => (
                <option key={i.uid} value={i.uid}>
                  {i.ticker} — {i.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="filter-field">
            <span>Интервал</span>
            <select value={interval} onChange={(e) => setIntervalVal(Number(e.target.value))}>
              {CANDLE_INTERVALS.map((iv) => (
                <option key={iv.value} value={iv.value}>
                  {iv.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>С</span>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>По</span>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>Цель</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="sharpe">Sharpe</option>
              <option value="cagr">CAGR</option>
              <option value="cagr_over_maxdd">CAGR / MaxDD</option>
              <option value="sqn">SQN</option>
              <option value="total_return">Доходность</option>
            </select>
          </label>
          <label className="filter-field">
            <span>Мин. сделок</span>
            <input type="number" value={minTrades} onChange={(e) => setMinTrades(Number(e.target.value))} />
          </label>
          <label className="filter-field">
            <span>Популяция</span>
            <input type="number" value={population} onChange={(e) => setPopulation(Number(e.target.value))} />
          </label>
          <label className="filter-field">
            <span>Поколений</span>
            <input type="number" value={generations} onChange={(e) => setGenerations(Number(e.target.value))} />
          </label>
          <label className="filter-field">
            <span>Лимит, сек</span>
            <input type="number" value={maxSeconds} onChange={(e) => setMaxSeconds(Number(e.target.value))} />
          </label>
        </div>
        <div className="filters-row strategy-space-row">
          <label className="filter-field strategy-json-field">
            <span>Пространство параметров (JSON)</span>
            <textarea spellCheck={false} rows={8} value={spaceText} onChange={(e) => setSpaceText(e.target.value)} />
          </label>
          <label className="filter-field strategy-json-field">
            <span>Структура (JSON)</span>
            <textarea
              spellCheck={false}
              rows={8}
              value={structureText}
              onChange={(e) => setStructureText(e.target.value)}
            />
          </label>
        </div>
        <div className="filters-row filters-actions">
          <button type="button" className="btn primary" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Запуск…" : "Запустить поиск"}
          </button>
          <button type="button" className="btn ghost" onClick={() => void loadSearches()}>
            Обновить
          </button>
        </div>
      </div>

      <div className="table-scroll table-scroll-fill strategy-table-scroll">
        <table className="strategy-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Инструмент</th>
              <th>Цель</th>
              <th>Статус</th>
              <th className="num">Оценено</th>
              <th className="num">Лучший score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {searches.length === 0 ? (
              <tr>
                <td colSpan={7} className="hint">
                  Поисков ещё нет.
                </td>
              </tr>
            ) : null}
            {searches.map((s) => (
              <tr key={s.searchId} className="is-clickable" onClick={() => setOpenSearch(s.searchId)}>
                <td>{s.name || <span className="mono">{s.searchId.slice(0, 8)}</span>}</td>
                <td className="mono">{s.config?.uid?.slice(0, 10)}</td>
                <td>{s.objective?.metric}</td>
                <td>{statusChip(s.progress?.status ?? "RUN_QUEUED")}</td>
                <td className="num">
                  {s.progress?.evaluated ?? 0}
                  {s.progress?.total ? ` / ${s.progress.total}` : ""}
                </td>
                <td className="num">{api.num(s.progress?.bestScore, 4)}</td>
                <td>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSearch(s.searchId);
                    }}
                  >
                    Открыть
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openSearch ? (
        <SearchResultModal
          searchId={openSearch}
          onClose={() => setOpenSearch(null)}
          onRefreshList={loadSearches}
          onCreatedStrategy={onCreatedStrategy}
        />
      ) : null}
    </>
  );
}

function SearchResultModal({
  searchId,
  onClose,
  onRefreshList,
  onCreatedStrategy,
}: {
  searchId: string;
  onClose: () => void;
  onRefreshList: () => void;
  onCreatedStrategy: () => void;
}) {
  const notify = useNotify();
  const [run, setRun] = useState<api.SearchRun | null>(null);
  const [best, setBest] = useState<api.SearchCandidate[]>([]);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [progress, bestRes] = await Promise.all([
        api.getSearchProgress(searchId),
        api.getBestStrategies(searchId, 10).catch(() => ({ items: [] as api.SearchCandidate[] })),
      ]);
      setRun(progress);
      setBest(bestRes.items ?? []);
      return progress.progress?.status ?? "RUN_QUEUED";
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка");
      return "RUN_FAILED" as api.RunStatus;
    }
  }, [searchId, notify]);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      const status = await load();
      if (!stopped && ACTIVE_STATUSES.includes(status)) {
        pollRef.current = window.setInterval(async () => {
          const s = await load();
          if (!ACTIVE_STATUSES.includes(s)) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            onRefreshList();
          }
        }, 4000);
      }
    })();
    return () => {
      stopped = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load, onRefreshList]);

  const cancel = async () => {
    try {
      await api.cancelSearch(searchId);
      notify.info("Отмена запрошена");
      void load();
      onRefreshList();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const saveCandidate = async (c: api.SearchCandidate) => {
    const name = window.prompt("Название новой стратегии", `${run?.name || "search"} #${c.rank}`);
    if (!name) return;
    try {
      await api.createStrategy({ name, description: `Из поиска ${searchId}`, spec: c.spec });
      notify.success("Стратегия создана");
      onCreatedStrategy();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось создать");
    }
  };

  const p = run?.progress;
  const active = ACTIVE_STATUSES.includes(p?.status ?? "RUN_QUEUED");

  return (
    <div className="strategy-modal-overlay" onClick={onClose}>
      <div className="strategy-modal wide" onClick={(e) => e.stopPropagation()}>
        <header className="strategy-modal-head">
          <h2>Поиск {p ? statusChip(p.status) : null}</h2>
          <button type="button" className="strategy-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        {run ? (
          <div className="strategy-result-meta">
            <span className="mono">{run.config?.uid}</span> · цель <b>{run.objective?.metric}</b> ·{" "}
            поколение {p?.currentGeneration ?? 0} · оценено {p?.evaluated ?? 0}
            {p?.total ? ` из ${p.total}` : ""} · лучший score{" "}
            <b>{api.num(p?.bestScore, 4)}</b>
            {p?.error ? <div className="strategy-error">{p.error}</div> : null}
          </div>
        ) : null}

        {active ? (
          <div className="strategy-running">
            <span className="strategy-spinner" /> Поиск идёт…
            <button type="button" className="btn ghost" onClick={() => void cancel()}>
              Отменить
            </button>
          </div>
        ) : null}

        <div className="strategy-trades">
          <h3>Лучшие кандидаты</h3>
          {best.length === 0 ? (
            <p className="hint">Пока нет оценённых кандидатов.</p>
          ) : (
            <div className="table-scroll strategy-trades-scroll">
              <table className="strategy-table compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="num">Score</th>
                    <th className="num">Доходность</th>
                    <th className="num">CAGR</th>
                    <th className="num">Sharpe</th>
                    <th className="num">Просадка</th>
                    <th className="num">Сделок</th>
                    <th>Пок.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {best.map((c) => (
                    <tr key={c.id}>
                      <td>{c.rank || "—"}</td>
                      <td className="num">{api.num(c.score, 4)}</td>
                      <td className="num">{api.pct(c.metrics?.totalReturn)}</td>
                      <td className="num">{api.pct(c.metrics?.cagr)}</td>
                      <td className="num">{api.num(c.metrics?.sharpe)}</td>
                      <td className="num">{api.pct(c.metrics?.maxDrawdown)}</td>
                      <td className="num">{c.metrics?.tradesCount ?? "—"}</td>
                      <td>{c.generation}</td>
                      <td>
                        <button type="button" className="btn ghost" onClick={() => void saveCandidate(c)}>
                          Сохранить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
