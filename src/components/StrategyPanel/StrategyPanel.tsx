import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNotify } from "../../notifications";
import { CANDLE_INTERVALS, fetchInstruments } from "../../api/scheduler";
import * as api from "../../api/strategysearch";
import { BLANK_TEMPLATE, SPEC_TEMPLATES, type SpecTemplate } from "./templates";
import EquityChart from "./EquityChart";
import PriceChart from "./PriceChart";
import TradesTable from "./TradesTable";
import SpecBuilder from "./SpecBuilder";
import { ConfirmDialog } from "./ConfirmDialog";
import { normalizeSpec, pruneSpec } from "./specModel";
import { ModalBackdrop } from "../common/ModalBackdrop";
import { isoDaysAgo, toRfc3339, toLocalInput } from "./searchForm";
import OptunaSearchTab from "./OptunaSearchTab";
import "../SchedulerPanel/SchedulerPanel.css";
import "../../styles/tables.css";
import "./StrategyPanel.css";

type Tab = "strategies" | "backtests" | "optuna";
type Instrument = { uid: string; ticker: string; name: string };

const ACTIVE_STATUSES: api.RunStatus[] = ["RUN_QUEUED", "RUN_RUNNING"];

// Бэкенд без поля include_indicators отвечает ошибкой — узнаём один раз за сессию.
let indicatorsSupported = true;

function intervalLabel(v: number | undefined): string {
  return CANDLE_INTERVALS.find((iv) => iv.value === v)?.label ?? String(v ?? "—");
}

export function statusChip(status: api.RunStatus) {
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

type NotifyApi = ReturnType<typeof useNotify>;

const RUN_TOAST_KIND: Record<api.RunStatus, "ok" | "err" | "info" | null> = {
  RUN_STATUS_UNSPECIFIED: null,
  RUN_QUEUED: "info",
  RUN_RUNNING: "info",
  RUN_SUCCEEDED: "ok",
  RUN_FAILED: "err",
  RUN_CANCELED: "info",
};

/** Пуш-уведомление при смене статуса прогона (реальное время через опрос). */
function notifyRunTransition(
  notify: NotifyApi,
  prev: api.RunStatus | null | undefined,
  next: api.RunStatus,
  label: string,
): void {
  if (prev === next || prev == null) return;
  const kind = RUN_TOAST_KIND[next];
  if (!kind) return;
  const text = `${label} — ${api.RUN_STATUS_LABEL[next]}`;
  if (kind === "ok") notify.success(text, "Бэктест");
  else if (kind === "err") notify.error(text, "Бэктест");
  else notify.info(text, "Бэктест");
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} мин ${s % 60} с` : `${s} с`;
}

function ActionIcon({ name }: { name: "edit" | "run" | "archive" | "unarchive" }) {
  const paths: Record<string, ReactNode> = {
    edit: <path d="M4 13.5V16h2.5l7.4-7.4-2.5-2.5L4 13.5zM15.7 6.3a.7.7 0 0 0 0-1L14.7 4.3a.7.7 0 0 0-1 0l-1 1 2.5 2.5 1-1.5z" />,
    run: <path d="M6 4l9 6-9 6V4z" />,
    archive: (
      <>
        <path d="M3 5h14v3H3z" />
        <path d="M4 9h12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9zm4 2v2h4v-2H8z" />
      </>
    ),
    unarchive: (
      <>
        <path d="M3 5h14v3H3z" />
        <path d="M4 9h12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9zm6 1l3 3h-2v2.5h-2V13H7l3-3z" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function StrategyPanel() {
  const notify = useNotify();
  const [tab, setTab] = useState<Tab>("strategies");

  // навигация из вкладки "Стратегии" в "Бэктест"
  const [prefillBacktestStrategy, setPrefillBacktestStrategy] = useState<string | null>(null);

  const { data: instruments = [] } = useQuery({
    queryKey: ["strategyPanel", "instruments"],
    queryFn: async (): Promise<Instrument[]> => {
      const rows = await fetchInstruments("", 5000, { lite: true });
      return rows.map((r) => ({ uid: r.uid, ticker: r.ticker || "", name: r.name || r.uid }));
    },
    staleTime: 5 * 60_000,
  });

  const strategiesQuery = useQuery({
    queryKey: ["strategyPanel", "strategies"],
    queryFn: async () => {
      const res = await api.listStrategies({ limit: 500, includeArchived: true });
      return res.items ?? [];
    },
  });
  const strategies = strategiesQuery.data ?? [];
  const { refetch: refetchStrategies, error: strategiesError } = strategiesQuery;
  const loadStrategies = useCallback(() => {
    void refetchStrategies();
  }, [refetchStrategies]);

  useEffect(() => {
    if (strategiesError) {
      notify.error(
        strategiesError instanceof Error ? strategiesError.message : "Не удалось загрузить стратегии",
      );
    }
  }, [strategiesError, notify]);

  return (
    <section className="panel-page strategy-panel">
      <header className="scheduler-header">
        <p className="eyebrow">Сервисы</p>
        <h1>Стратегии</h1>
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
          className={`strategy-tab ${tab === "optuna" ? "is-active" : ""}`}
          onClick={() => setTab("optuna")}
        >
          Поиск 2.0
        </button>
      </div>

      <div className="strategy-tab-body">
        {tab === "strategies" ? (
          <StrategiesTab
            strategies={strategies}
            onChanged={loadStrategies}
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
        {tab === "optuna" ? <OptunaSearchTab instruments={instruments} /> : null}
      </div>
    </section>
  );
}

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
  const [confirmArchive, setConfirmArchive] = useState<api.Strategy | null>(null);

  const visible = includeArchived ? strategies : strategies.filter((s) => !s.archived);

  const archive = async (s: api.Strategy) => {
    try {
      await api.deleteStrategy(s.id);
      notify.success("Стратегия архивирована");
      onChanged();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const unarchive = async (s: api.Strategy) => {
    try {
      await api.restoreStrategy(s.id);
      notify.success("Стратегия возвращена из архива");
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
                    <button
                      type="button"
                      className="strategy-action edit"
                      title="Открыть редактор стратегии"
                      onClick={() => setEditor({ mode: "edit", strategy: s })}
                    >
                      <ActionIcon name="edit" />
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="strategy-action run"
                      title="Запустить бэктест по этой стратегии"
                      onClick={() => onRunBacktest(s.id)}
                    >
                      <ActionIcon name="run" />
                      Бэктест
                    </button>
                    {s.archived ? (
                      <button
                        type="button"
                        className="strategy-action unarchive"
                        title="Вернуть стратегию из архива"
                        onClick={() => void unarchive(s)}
                      >
                        <ActionIcon name="unarchive" />
                        Из архива
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="strategy-action archive"
                        title="Переместить стратегию в архив"
                        onClick={() => setConfirmArchive(s)}
                      >
                        <ActionIcon name="archive" />
                        В архив
                      </button>
                    )}
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

      {confirmArchive ? (
        <ConfirmDialog
          title="Архивировать стратегию"
          message={
            <>
              Стратегия «{confirmArchive.name}» будет скрыта из активных. Её можно вернуть кнопкой
              «Из архива».
            </>
          }
          confirmLabel="В архив"
          tone="danger"
          onCancel={() => setConfirmArchive(null)}
          onConfirm={() => {
            const s = confirmArchive;
            setConfirmArchive(null);
            void archive(s);
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
  const [templateId, setTemplateId] = useState<string>(BLANK_TEMPLATE.id);
  const [mode, setMode] = useState<"builder" | "json">("builder");
  const [spec, setSpec] = useState<api.StrategySpec>(() =>
    normalizeSpec(initial?.spec ?? BLANK_TEMPLATE.spec),
  );
  const [text, setText] = useState(() =>
    JSON.stringify(pruneSpec(normalizeSpec(initial?.spec ?? BLANK_TEMPLATE.spec)), null, 2),
  );
  const [issues, setIssues] = useState<api.ValidationIssue[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<SpecTemplate | null>(null);

  const applyTemplate = (tpl: SpecTemplate) => {
    setTemplateId(tpl.id);
    const next = normalizeSpec(tpl.spec);
    setSpec(next);
    setText(JSON.stringify(pruneSpec(next), null, 2));
    setIssues(null);
  };

  // JSON -> spec; false => текст не распарсился, остаёмся в JSON-режиме
  const syncFromText = (): boolean => {
    try {
      setSpec(normalizeSpec(JSON.parse(text)));
      return true;
    } catch (err) {
      notify.error(`Некорректный JSON: ${err instanceof Error ? err.message : ""}`);
      return false;
    }
  };

  const switchMode = (next: "builder" | "json") => {
    if (next === mode) return;
    if (next === "json") {
      setText(JSON.stringify(pruneSpec(spec), null, 2));
      setMode("json");
    } else if (syncFromText()) {
      setMode("builder");
    }
  };

  // актуальный spec с учётом активного режима
  const currentSpec = (): api.StrategySpec | null => {
    if (mode === "json") {
      try {
        return pruneSpec(normalizeSpec(JSON.parse(text)));
      } catch (err) {
        notify.error(`Некорректный JSON: ${err instanceof Error ? err.message : ""}`);
        return null;
      }
    }
    return pruneSpec(spec);
  };

  const validate = async () => {
    const s = currentSpec();
    if (!s) return;
    setBusy(true);
    try {
      const res = await api.validateStrategy(s);
      setIssues(res.issues ?? []);
      if (res.ok) notify.success("Стратегия валидна");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка проверки");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const s = currentSpec();
    if (!s) return;
    if (!name.trim()) {
      notify.error("Укажите название");
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        await api.updateStrategy(initial.id, { name: name.trim(), description, spec: s });
      } else {
        await api.createStrategy({ name: name.trim(), description, spec: s });
      }
      notify.success(initial ? "Стратегия обновлена" : "Стратегия создана");
      onSaved();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const chooseTemplate = (id: string) => {
    const tpl = SPEC_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    if (initial) {
      setPendingTemplate(tpl);
      return;
    }
    applyTemplate(tpl);
  };

  const indicatorCount = Array.isArray(spec.indicators) ? spec.indicators.length : 0;

  return (
    <>
    <ModalBackdrop
      onClose={onClose}
      disabled={busy}
      className="strategy-modal-overlay"
      title={initial ? "Редактор стратегии" : "Новая стратегия"}
    >
      <div className="strategy-modal wide strategy-editor">
        <header className="strategy-modal-head">
          <div>
            <h2>{initial ? "Редактор стратегии" : "Новая стратегия"}</h2>
            <p className="strategy-editor-sub">
              {mode === "builder" ? "Конструктор" : "Ручной JSON"} · индикаторов: {indicatorCount}
              {issues ? (issues.length === 0 ? " · проверена" : ` · ошибок: ${issues.length}`) : ""}
            </p>
          </div>
          <button type="button" className="strategy-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="strategy-editor-body">
          <div className="strategy-form-grid">
            <label className="filter-field">
              <span>Название</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="RSI mean-reversion SBER"
                autoFocus={!initial}
              />
            </label>
            <label className="filter-field">
              <span>Описание</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Кратко" />
            </label>
            <label className="filter-field">
              <span>{initial ? "Заменить шаблоном" : "Шаблон"}</span>
              <select
                value={initial ? "" : templateId}
                onChange={(e) => chooseTemplate(e.target.value)}
              >
                {initial ? <option value="">— выберите —</option> : null}
                {SPEC_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {!initial ? (
                <small className="strategy-template-hint">
                  {SPEC_TEMPLATES.find((t) => t.id === templateId)?.description}
                </small>
              ) : null}
            </label>
          </div>

          <div className="strategy-mode-switch">
            <button
              type="button"
              className={`strategy-tab ${mode === "builder" ? "is-active" : ""}`}
              onClick={() => switchMode("builder")}
            >
              Конструктор
            </button>
            <button
              type="button"
              className={`strategy-tab ${mode === "json" ? "is-active" : ""}`}
              onClick={() => switchMode("json")}
            >
              JSON
            </button>
          </div>

          {mode === "builder" ? (
            <SpecBuilder value={spec} onChange={setSpec} issues={issues} />
          ) : (
            <label className="filter-field strategy-json-field">
              <span>StrategySpec (JSON)</span>
              <textarea
                spellCheck={false}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setIssues(null);
                }}
                rows={22}
              />
            </label>
          )}

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
        </div>

        <footer className="strategy-modal-actions">
          <span className="strategy-editor-status">
            {issues == null
              ? "Не проверена"
              : issues.length === 0
                ? "✔ Стратегия валидна"
                : `${issues.length} ошибок в конфигурации`}
          </span>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="button" className="btn ghost" onClick={() => void validate()} disabled={busy}>
            Проверить
          </button>
          <button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Сохранение…" : initial ? "Сохранить" : "Создать"}
          </button>
        </footer>
      </div>
    </ModalBackdrop>

      {pendingTemplate ? (
        <ConfirmDialog
          title="Заменить конфигурацию шаблоном"
          message={
            <>
              Текущее дерево правил будет заменено шаблоном «{pendingTemplate.label}». Несохранённые
              изменения пропадут.
            </>
          }
          confirmLabel="Заменить"
          tone="danger"
          onCancel={() => setPendingTemplate(null)}
          onConfirm={() => {
            applyTemplate(pendingTemplate);
            setPendingTemplate(null);
          }}
        />
      ) : null}
    </>
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
  const [force, setForce] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [runs, setRuns] = useState<api.BacktestRunListItem[]>([]);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const statusSeenRef = useRef<Map<string, api.RunStatus>>(new Map());

  useEffect(() => {
    if (prefillStrategyId) {
      setStrategyId(prefillStrategyId);
      onPrefillConsumed();
    }
  }, [prefillStrategyId, onPrefillConsumed]);

  const loadRuns = useCallback(async () => {
    try {
      const res = await api.listBacktestRuns({ limit: 100, sortBy: "created_at", sortDesc: true });
      const items = res.items ?? [];
      // пуш-уведомления о смене статуса (кроме самой первой загрузки списка)
      const seen = statusSeenRef.current;
      const first = seen.size === 0;
      for (const { run } of items) {
        const prev = seen.get(run.runId);
        if (!first) notifyRunTransition(notify, prev ?? run.status, run.status, `Прогон ${run.runId.slice(0, 8)}`);
        seen.set(run.runId, run.status);
      }
      setRuns(items);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось загрузить прогоны");
    }
  }, [notify]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // авто-обновление, пока есть активные прогоны; при открытой модалке
  // статус тянет она сама — список не дёргаем.
  useEffect(() => {
    if (openRun) return;
    const hasActive = runs.some((r) => ACTIVE_STATUSES.includes(r.run.status));
    if (!hasActive) return;
    const id = window.setInterval(() => void loadRuns(), 5000);
    return () => window.clearInterval(id);
  }, [runs, loadRuns, openRun]);

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
        force,
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
          <label className="strategy-inline-check" title="Игнорировать дедуп и посчитать заново (например после обновления движка)">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            принудительно
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
              <th className="num" title={METRIC_HELP.totalReturn}>Доходность</th>
              <th className="num" title={METRIC_HELP.cagr}>CAGR</th>
              <th className="num" title={METRIC_HELP.sharpe}>Sharpe</th>
              <th className="num" title={METRIC_HELP.maxDrawdown}>Просадка</th>
              <th className="num" title={METRIC_HELP.tradesCount}>Сделок</th>
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

const METRIC_HELP: Record<string, string> = {
  totalReturn: "Суммарная доходность за весь период теста: (капитал в конце ÷ начальный капитал) − 1.",
  cagr: "CAGR — среднегодовой темп роста капитала с учётом сложного процента (приведённая к году доходность).",
  sharpe:
    "Sharpe — доходность на единицу общего риска: среднедневная доходность ÷ её стандартное отклонение, годовая. >1 хорошо, >2 отлично.",
  sortino:
    "Sortino — как Sharpe, но в знаменателе только волатильность убытков (downside). Не штрафует за рост.",
  maxDrawdown: "Максимальная просадка — самое глубокое падение капитала от предыдущего пика за период.",
  winRate: "Доля прибыльных сделок от их общего числа.",
  profitFactor: "Profit factor — сумма прибыли всех выигрышных сделок ÷ сумма убытка проигрышных. >1 — стратегия в плюсе.",
  sqn: "SQN (System Quality Number, Van Tharp) — качество системы: √N · среднее сделки ÷ σ сделок. 2–3 — хорошо, >3 — отлично.",
  exposure: "Доля времени (баров), когда в позиции была открыта хотя бы одна сделка.",
  avgTradePct: "Средняя доходность одной сделки в долях от начального капитала.",
  expectancy: "Математическое ожидание одной сделки в валюте счёта (средний P/L на сделку).",
  finalEquity: "Стоимость счёта в конце периода теста.",
  tradesCount: "Число закрытых сделок за период.",
};

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
  const [statusRun, setStatusRun] = useState<api.BacktestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartTab, setChartTab] = useState<"equity" | "price">("price");
  const [elapsed, setElapsed] = useState(0);
  const prevStatusRef = useRef<api.RunStatus | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  // Тяжёлый запрос (equity + trades + индикаторы) — только когда прогон завершён.
  const loadResult = useCallback(async () => {
    const base = { includeEquity: true, includeTrades: true, equityMaxPoints: 4000 } as const;
    try {
      let res;
      // includeIndicators поддерживается не всеми версиями бэкенда — один раз проверяем и запоминаем.
      if (indicatorsSupported) {
        try {
          res = await api.getBacktestResult(runId, { ...base, includeIndicators: true });
        } catch {
          indicatorsSupported = false;
          res = await api.getBacktestResult(runId, base);
        }
      } else {
        res = await api.getBacktestResult(runId, base);
      }
      setData(res);
      setStatusRun(res.run);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось загрузить результат");
    } finally {
      setLoading(false);
    }
  }, [runId, notify]);

  // Лёгкий запрос статуса — для опроса, пока прогон активен (без equity/trades).
  const loadStatus = useCallback(async (): Promise<api.RunStatus> => {
    try {
      const run = await api.getBacktestStatus(runId);
      setStatusRun(run);
      const startedMs = run.startedAt ? Date.parse(run.startedAt) : NaN;
      if (Number.isFinite(startedMs)) startedAtRef.current = startedMs;
      notifyRunTransition(notify, prevStatusRef.current, run.status, `Прогон ${runId.slice(0, 8)}`);
      prevStatusRef.current = run.status;
      return run.status;
    } catch {
      return "RUN_STATUS_UNSPECIFIED";
    }
  }, [runId, notify]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    void (async () => {
      const status = await loadStatus();
      if (stopped) return;
      if (ACTIVE_STATUSES.includes(status)) {
        setLoading(false);
        timer = window.setInterval(async () => {
          const s = await loadStatus();
          if (!ACTIVE_STATUSES.includes(s)) {
            if (timer) window.clearInterval(timer);
            timer = null;
            await loadResult();
            onRefreshList();
          }
        }, 3000);
      } else {
        await loadResult();
      }
    })();
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
    };
  }, [loadStatus, loadResult, onRefreshList]);

  // счётчик времени, пока прогон активен
  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(statusRun?.status ?? "RUN_STATUS_UNSPECIFIED")) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(id);
  }, [statusRun?.status]);

  const cancel = async () => {
    try {
      await api.cancelBacktest(runId);
      notify.info("Отмена запрошена");
      void loadStatus();
      onRefreshList();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const run = data?.run ?? statusRun;
  const metrics = data?.metrics;
  const trades = data?.trades ?? [];

  return (
    <ModalBackdrop onClose={onClose} className="strategy-modal-overlay" title="Результат бэктеста">
      <div className="strategy-modal wide">
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
            <span className="strategy-spinner" />
            {run?.status === "RUN_QUEUED" ? "В очереди" : "Выполняется"} · {fmtElapsed(elapsed)} ·
            обновляется автоматически…
            <button type="button" className="btn ghost" onClick={() => void cancel()}>
              Отменить
            </button>
          </div>
        ) : null}

        {metrics ? (
          <div className="strategy-metrics-grid">
            {METRIC_ROWS.map((m) => {
              const v = metrics[m.key] as number | undefined;
              const help = METRIC_HELP[String(m.key)];
              return (
                <div key={String(m.key)} className="strategy-metric" title={help}>
                  <span className="strategy-metric-label">
                    {m.label}
                    {help ? <span className="strategy-metric-info">ⓘ</span> : null}
                  </span>
                  <span className="strategy-metric-value">
                    {m.kind === "pct" ? api.pct(v) : api.num(v)}
                  </span>
                </div>
              );
            })}
            <div className="strategy-metric" title={METRIC_HELP.tradesCount}>
              <span className="strategy-metric-label">
                Сделок
                <span className="strategy-metric-info">ⓘ</span>
              </span>
              <span className="strategy-metric-value">{metrics.tradesCount}</span>
            </div>
          </div>
        ) : null}

        {run?.config && (run.status === "RUN_SUCCEEDED" || (data?.equity?.length ?? 0) > 1) ? (
          <div className="strategy-charts">
            <div className="strategy-chart-switch">
              <button
                type="button"
                className={`strategy-tab ${chartTab === "price" ? "is-active" : ""}`}
                onClick={() => setChartTab("price")}
              >
                Цена и сделки
              </button>
              <button
                type="button"
                className={`strategy-tab ${chartTab === "equity" ? "is-active" : ""}`}
                onClick={() => setChartTab("equity")}
                disabled={!data?.equity || data.equity.length < 2}
              >
                Кривая капитала
              </button>
            </div>

            {chartTab === "price" && run.config ? (
              <PriceChart config={run.config} trades={trades} />
            ) : null}

            {chartTab === "equity" && data?.equity && data.equity.length > 1 ? (
              <div className="strategy-chart-wrap">
                <EquityChart points={data.equity} />
              </div>
            ) : null}
          </div>
        ) : null}

        {trades.length > 0 ? (
          <div className="strategy-trades">
            <h3>Сделки ({trades.length})</h3>
            <TradesTable trades={trades} />
          </div>
        ) : null}
      </div>
    </ModalBackdrop>
  );
}

