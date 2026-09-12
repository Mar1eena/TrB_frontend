// Вкладка «Поиск 2.0» — Optuna-поиск стратегий (backtrader/TA-Lib/QuantStats).
// Независимый от каталога генетического поиска сервис: base_spec передаётся
// инлайн, поэтому «базовая стратегия» здесь — только удобная затравка для
// встроенного SpecBuilder, а не обязательная ссылка.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotify } from "../../notifications";
import { CANDLE_INTERVALS } from "../../api/scheduler";
import * as api from "../../api/strategysearch";
import * as strategyApi from "../../api/strategy";
import { BLANK_TEMPLATE, SPEC_TEMPLATES, type SpecTemplate } from "./templates";
import { normalizeSpec, pruneSpec } from "./specModel";
import SpecBuilder from "./SpecBuilder";
import { InfoTip } from "./InfoTip";
import { statusChip } from "./StrategyPanel";
import {
  DEFAULT_OPTUNA_SPACE_ROWS,
  ObjectiveBuilder,
  OptunaSpaceBuilder,
  PrunerBuilder,
  SamplerBuilder,
  optunaSpaceRowsToJson,
  paramRangesToOptunaSpaceRows,
  type OptunaSpaceRow,
} from "./OptunaBuilders";
import { optimizableParams } from "./SearchBuilders";
import { validateOptunaSettings } from "./searchValidation";
import { SearchCharts } from "./charts/SearchCharts";
import { ConfirmDialog, PromptDialog } from "./ConfirmDialog";
import { ModalBackdrop } from "../common/ModalBackdrop";

type Instrument = { uid: string; ticker: string; name: string };

const ACTIVE_STATUSES: api.RunStatus[] = ["RUN_QUEUED", "RUN_RUNNING"];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function toRfc3339(local: string): string {
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

export default function OptunaSearchTab({
  strategies,
  instruments,
  onCreatedStrategy,
}: {
  strategies: strategyApi.Strategy[];
  instruments: Instrument[];
  onCreatedStrategy: () => void;
}) {
  const notify = useNotify();

  // --- базовый спек: шаблон/каталог для затравки + встроенный SpecBuilder ---
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE.id);
  const [seedStrategyId, setSeedStrategyId] = useState("");
  const [specMode, setSpecMode] = useState<"builder" | "json">("builder");
  const [spec, setSpec] = useState<strategyApi.StrategySpec>(() => normalizeSpec(BLANK_TEMPLATE.spec));
  const [specText, setSpecText] = useState(() =>
    JSON.stringify(pruneSpec(normalizeSpec(BLANK_TEMPLATE.spec)), null, 2),
  );

  const applySpec = (raw: unknown) => {
    const next = normalizeSpec(raw);
    setSpec(next);
    setSpecText(JSON.stringify(pruneSpec(next), null, 2));
  };

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    setSeedStrategyId("");
    const tpl = SPEC_TEMPLATES.find((t) => t.id === id);
    if (tpl) applySpec(tpl.spec);
  };

  const chooseSeedStrategy = (id: string) => {
    setSeedStrategyId(id);
    const s = strategies.find((s) => s.id === id);
    if (s) applySpec(s.spec);
  };

  const syncFromText = (): boolean => {
    try {
      applySpec(JSON.parse(specText));
      return true;
    } catch (err) {
      notify.error(`Некорректный JSON: ${err instanceof Error ? err.message : ""}`);
      return false;
    }
  };

  const switchSpecMode = (next: "builder" | "json") => {
    if (next === specMode) return;
    if (next === "json") {
      setSpecText(JSON.stringify(pruneSpec(spec), null, 2));
      setSpecMode("json");
    } else if (syncFromText()) {
      setSpecMode("builder");
    }
  };

  const currentSpec = (): strategyApi.StrategySpec | null => {
    if (specMode === "json") {
      try {
        return pruneSpec(normalizeSpec(JSON.parse(specText)));
      } catch (err) {
        notify.error(`Некорректный JSON: ${err instanceof Error ? err.message : ""}`);
        return null;
      }
    }
    return pruneSpec(spec);
  };

  // --- инструмент и период ---
  const [uid, setUid] = useState("");
  const [interval, setIntervalVal] = useState(5);
  const [start, setStart] = useState(() => toLocalInput(isoDaysAgo(365)));
  const [end, setEnd] = useState(() => toLocalInput(new Date().toISOString()));
  const [benchmarkUid, setBenchmarkUid] = useState("");

  // --- целевые метрики ---
  const [objectiveMetrics, setObjectiveMetrics] = useState<api.ObjectiveMetric[]>([
    { metric: "sharpe", maximize: true },
  ]);
  const [minTrades, setMinTrades] = useState(10);
  const [maxDrawdownLimit, setMaxDrawdownLimit] = useState<number | undefined>(undefined);

  // --- бюджет ---
  const [nTrials, setNTrials] = useState(50);
  const [timeoutSeconds, setTimeoutSeconds] = useState(900);
  const [nJobs, setNJobs] = useState(2);
  const [seed, setSeed] = useState("");
  const [disableCache, setDisableCache] = useState(false);
  const [pruningInterval, setPruningInterval] = useState(0);

  // --- алгоритм / прунинг / пространство поиска ---
  const [sampler, setSampler] = useState<api.SamplerConfig>({ tpe: {} });
  const [pruner, setPruner] = useState<api.PrunerConfig>({ none: {} });
  const [spaceRows, setSpaceRows] = useState<OptunaSpaceRow[]>(DEFAULT_OPTUNA_SPACE_ROWS);

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
    if (openSearch) return;
    const hasActive = searches.some((s) => ACTIVE_STATUSES.includes(s.progress?.status ?? "RUN_QUEUED"));
    if (!hasActive) return;
    const id = window.setInterval(() => void loadSearches(), 6000);
    return () => window.clearInterval(id);
  }, [searches, loadSearches, openSearch]);

  const buildStudy = (): api.StudyConfig => ({
    sampler,
    pruner,
    objective: { metrics: objectiveMetrics, minTrades, maxDrawdownLimit },
    budget: {
      nTrials,
      timeoutSeconds,
      nJobs,
      seed: seed.trim() || undefined,
      disableCache,
      pruningReportIntervalBars: pruningInterval || undefined,
    },
  });

  const buildConfig = (startIso: string, endIso: string): api.BacktestConfig => ({
    uid,
    interval,
    start: startIso,
    end: endIso,
    initialCash: 100000,
    commissionPct: 0.0005,
    longOnly: true,
    benchmarkUid: benchmarkUid.trim() || undefined,
  });

  // Общие проверки для «Запустить поиск» и «Сохранить настройки» — обеим
  // операциям нужен валидный spec/период/пространство поиска/цель.
  const validateForm = (): { spec: strategyApi.StrategySpec; searchSpace: api.ParamRange[]; startIso: string; endIso: string } | null => {
    const s = currentSpec();
    if (!s) return null;
    if (!uid) {
      notify.error("Выберите инструмент");
      return null;
    }
    if (spaceRows.length === 0) {
      notify.error("Добавьте хотя бы один параметр для оптимизации");
      return null;
    }
    const startIso = toRfc3339(start);
    const endIso = toRfc3339(end);
    if (!startIso || !endIso) {
      notify.error("Укажите период");
      return null;
    }
    const issues = validateOptunaSettings({
      spaceRows,
      sampler,
      pruner,
      objectiveMetrics,
      minTrades,
      maxDrawdownLimit,
      nTrials,
      timeoutSeconds,
      nJobs,
    });
    if (issues.length > 0) {
      notify.error(issues[0].message);
      return null;
    }
    const searchSpace = optunaSpaceRowsToJson(spaceRows);
    return { spec: s, searchSpace, startIso, endIso };
  };

  const submit = async () => {
    const v = validateForm();
    if (!v) return;
    setSubmitting(true);
    try {
      const res = await api.submitSearch({
        name: name.trim() || undefined,
        baseSpec: v.spec,
        searchSpace: v.searchSpace,
        study: buildStudy(),
        config: buildConfig(v.startIso, v.endIso),
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

  // --- сохранённые настройки (пресеты формы) ---
  const [presets, setPresets] = useState<api.SearchPreset[]>([]);
  const [presetSavePrompt, setPresetSavePrompt] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<api.SearchPreset | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);

  const loadPresets = useCallback(async () => {
    try {
      const res = await api.listSearchPresets();
      setPresets(res.items ?? []);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось загрузить сохранённые настройки");
    }
  }, [notify]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const savePreset = async (presetName: string, overwriteId?: string) => {
    const v = validateForm();
    if (!v) return;
    setSavingPreset(true);
    try {
      await api.createSearchPreset({
        name: presetName,
        baseSpec: v.spec,
        searchSpace: v.searchSpace,
        study: buildStudy(),
        config: buildConfig(v.startIso, v.endIso),
      });
      if (overwriteId) await api.deleteSearchPreset(overwriteId);
      notify.success(overwriteId ? "Настройки перезаписаны" : "Настройки сохранены");
      await loadPresets();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось сохранить настройки");
    } finally {
      setSavingPreset(false);
    }
  };

  const [pendingOverwrite, setPendingOverwrite] = useState<{ name: string; id: string } | null>(null);

  const requestSavePreset = (presetName: string) => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    const existing = presets.find((p) => p.name === trimmed);
    if (existing) {
      setPendingOverwrite({ name: trimmed, id: existing.id });
    } else {
      void savePreset(trimmed);
    }
  };

  const applyPreset = (p: api.SearchPreset) => {
    setName(p.name);
    if (p.baseSpec) applySpec(p.baseSpec);
    setSpaceRows(p.searchSpace?.length ? paramRangesToOptunaSpaceRows(p.searchSpace) : DEFAULT_OPTUNA_SPACE_ROWS);
    const obj = p.study?.objective;
    setObjectiveMetrics(obj?.metrics?.length ? obj.metrics : [{ metric: "sharpe", maximize: true }]);
    setMinTrades(obj?.minTrades ?? 10);
    setMaxDrawdownLimit(obj?.maxDrawdownLimit);
    const budget = p.study?.budget;
    setNTrials(budget?.nTrials ?? 50);
    setTimeoutSeconds(budget?.timeoutSeconds ?? 900);
    setNJobs(budget?.nJobs ?? 2);
    setSeed(budget?.seed ?? "");
    setDisableCache(budget?.disableCache ?? false);
    setPruningInterval(budget?.pruningReportIntervalBars ?? 0);
    setSampler(p.study?.sampler ?? { tpe: {} });
    setPruner(p.study?.pruner ?? { none: {} });
    setUid(p.config?.uid ?? "");
    setIntervalVal(p.config?.interval ?? 5);
    setStart(p.config?.start ? toLocalInput(p.config.start) : toLocalInput(isoDaysAgo(365)));
    setEnd(p.config?.end ? toLocalInput(p.config.end) : toLocalInput(new Date().toISOString()));
    setBenchmarkUid(p.config?.benchmarkUid ?? "");
    setSeedStrategyId("");
    notify.success(`Настройки «${p.name}» загружены`);
  };

  const deletePreset = async (p: api.SearchPreset) => {
    try {
      await api.deleteSearchPreset(p.id);
      notify.success("Настройки удалены");
      await loadPresets();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const indicatorCount = Array.isArray(spec.indicators) ? (spec.indicators as unknown[]).length : 0;

  const [resultsView, setResultsView] = useState<"searches" | "strategies" | "presets">("searches");
  const visibleStrategies = strategies.filter((s) => !s.archived);

  return (
    <div className="search-layout">
      <div className="filters-bar search-filters search-layout-settings">
        <div className="search-section">
          <p className="search-section-title">
            Стратегия
            <InfoTip text="Optuna-поиск не привязан к каталогу — базовый спек передаётся отдельно на каждый запуск. Возьмите шаблон или существующую стратегию как затравку и донастройте конструктором." />
          </p>
          <div className="filters-row filters-fields">
            <label className="filter-field">
              <span>Название поиска</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="необязательно" />
            </label>
            <label className="filter-field">
              <span>Шаблон</span>
              <select value={templateId} onChange={(e) => chooseTemplate(e.target.value)}>
                {SPEC_TEMPLATES.map((t: SpecTemplate) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field" style={{ flexBasis: "16rem" }}>
              <span>...или взять из каталога</span>
              <select value={seedStrategyId} onChange={(e) => chooseSeedStrategy(e.target.value)}>
                <option value="">— не подставлять —</option>
                {strategies
                  .filter((s) => !s.archived)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="strategy-mode-switch">
            <button
              type="button"
              className={`strategy-tab ${specMode === "builder" ? "is-active" : ""}`}
              onClick={() => switchSpecMode("builder")}
            >
              Конструктор
            </button>
            <button
              type="button"
              className={`strategy-tab ${specMode === "json" ? "is-active" : ""}`}
              onClick={() => switchSpecMode("json")}
            >
              JSON
            </button>
            <span className="strategy-editor-sub">индикаторов: {indicatorCount}</span>
          </div>

          {specMode === "builder" ? (
            <SpecBuilder value={spec} onChange={setSpec} issues={null} />
          ) : (
            <label className="filter-field strategy-json-field">
              <span>StrategySearchSpec (JSON)</span>
              <textarea spellCheck={false} value={specText} onChange={(e) => setSpecText(e.target.value)} rows={16} />
            </label>
          )}
        </div>

        <div className="search-section">
          <p className="search-section-title">
            Инструмент и период
            <InfoTip text="Инструмент, интервал свечей и период истории для оценки трайлов. Бенчмарк — опционально, нужен для alpha/beta/information_ratio/R² в метриках." />
          </p>
          <div className="filters-row filters-fields">
            <label className="filter-field">
              <span>Инструмент</span>
              <input list="strategy-instruments-optuna" value={uid} onChange={(e) => setUid(e.target.value.trim())} />
              <datalist id="strategy-instruments-optuna">
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
              <span>
                Бенчмарк
                <InfoTip text="Инструмент сравнения для QuantStats-метрик alpha/beta/information_ratio/R². Оставьте пустым, если не нужно." />
              </span>
              <input
                list="strategy-instruments-optuna"
                value={benchmarkUid}
                onChange={(e) => setBenchmarkUid(e.target.value.trim())}
                placeholder="необязательно"
              />
            </label>
          </div>
        </div>

        <ObjectiveBuilder metrics={objectiveMetrics} onChange={setObjectiveMetrics} />
        <div className="search-section">
          <div className="filters-row filters-fields">
            <label className="filter-field">
              <span>
                Мин. сделок
                <InfoTip text="Трайлы с меньшим числом закрытых сделок отсекаются (прунятся) — по единичным сделкам метрика недостоверна." />
              </span>
              <input type="number" value={minTrades} onChange={(e) => setMinTrades(Number(e.target.value))} />
            </label>
            <label className="filter-field">
              <span>
                Лимит просадки
                <InfoTip text="Трайлы с просадкой выше этой доли отсекаются. 0 — не ограничено." />
              </span>
              <input
                type="number"
                step="0.01"
                placeholder="не ограничено"
                value={maxDrawdownLimit ?? ""}
                onChange={(e) => setMaxDrawdownLimit(e.target.value ? Number(e.target.value) : undefined)}
              />
            </label>
          </div>
        </div>

        <div className="search-section">
          <p className="search-section-title">
            Бюджет
            <InfoTip text="Сколько трайлов перебрать и как долго. Интервал чекпойнтов включает пост-фактум прунинг: воркер считает бэктест целиком, но репортит промежуточные точки для сравнения с конкурентными трайлами." />
          </p>
          <div className="filters-row filters-fields">
            <label className="filter-field">
              <span>
                Трайлов
                <InfoTip text="Сколько вариантов параметров проверить. 0 — не ограничено (тогда обязателен лимит времени)." />
              </span>
              <input type="number" value={nTrials} onChange={(e) => setNTrials(Number(e.target.value))} />
            </label>
            <label className="filter-field">
              <span>Лимит, сек</span>
              <input type="number" value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(Number(e.target.value))} />
            </label>
            <label className="filter-field">
              <span>
                Параллельно
                <InfoTip text="Сколько трайлов оценивать одновременно (n_jobs) — потоки координатора, раздающие задачи пулу воркеров." />
              </span>
              <input type="number" value={nJobs} onChange={(e) => setNJobs(Number(e.target.value))} />
            </label>
            <label className="filter-field">
              <span>Seed</span>
              <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="авто" />
            </label>
            <label className="filter-field">
              <span>
                Интервал чекпойнтов, баров
                <InfoTip text="Раз в столько баров бэктеста фиксировать капитал для прунера. 0 — чекпойнты не считаются, прунинг неактивен независимо от выбранного pruner." />
              </span>
              <input type="number" value={pruningInterval} onChange={(e) => setPruningInterval(Number(e.target.value))} />
            </label>
            <label className="strategy-inline-check">
              <input type="checkbox" checked={disableCache} onChange={(e) => setDisableCache(e.target.checked)} />
              не использовать кэш оценок
            </label>
          </div>
        </div>

        <div className="search-builders">
          <SamplerBuilder value={sampler} onChange={setSampler} />
          <PrunerBuilder value={pruner} onChange={setPruner} />
          <OptunaSpaceBuilder rows={spaceRows} onChange={setSpaceRows} spec={spec} />
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

      <div className="search-layout-list">
        <div className="strategy-mode-switch search-layout-list-tabs">
          <button
            type="button"
            className={`strategy-tab ${resultsView === "searches" ? "is-active" : ""}`}
            onClick={() => setResultsView("searches")}
          >
            Результаты поиска
          </button>
          <button
            type="button"
            className={`strategy-tab ${resultsView === "strategies" ? "is-active" : ""}`}
            onClick={() => setResultsView("strategies")}
          >
            Стратегии
          </button>
          <button
            type="button"
            className={`strategy-tab ${resultsView === "presets" ? "is-active" : ""}`}
            onClick={() => setResultsView("presets")}
          >
            Сохранённые настройки
          </button>
          {resultsView === "presets" ? (
            <button
              type="button"
              className="btn ghost sm search-layout-list-action"
              onClick={() => setPresetSavePrompt(true)}
              disabled={savingPreset}
            >
              Сохранить текущие настройки
            </button>
          ) : null}
        </div>

        {resultsView === "searches" ? (
          <div className="table-scroll table-scroll-fill strategy-table-scroll">
            <table className="strategy-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Инструмент</th>
                  <th>Цель</th>
                  <th>Статус</th>
                  <th className="num">Трайлов</th>
                  <th className="num">Лучшее</th>
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
                {searches.map((s) => {
                  const p = s.progress;
                  const metricNames = s.study?.objective?.metrics?.map((m) => m.metric).join(", ") || "—";
                  const done = (p?.completedTrials ?? 0) + (p?.prunedTrials ?? 0) + (p?.failedTrials ?? 0);
                  const bestLabel = p?.isMultiObjective
                    ? p.paretoFrontTrialIds?.length
                      ? `Парето ×${p.paretoFrontTrialIds.length}`
                      : "—"
                    : api.num(p?.bestValues ? Object.values(p.bestValues)[0] : undefined, 4);
                  return (
                    <tr key={s.searchId} className="is-clickable" onClick={() => setOpenSearch(s.searchId)}>
                      <td>{s.name || <span className="mono">{s.searchId.slice(0, 8)}</span>}</td>
                      <td className="mono">{s.config?.uid?.slice(0, 10)}</td>
                      <td>{metricNames}</td>
                      <td>{statusChip(p?.status ?? "RUN_QUEUED")}</td>
                      <td className="num">
                        {done}
                        {p?.totalTrials ? ` / ${p.totalTrials}` : ""}
                      </td>
                      <td className="num">{bestLabel}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {resultsView === "strategies" ? (
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
                {visibleStrategies.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="hint">
                      Стратегий пока нет.
                    </td>
                  </tr>
                ) : null}
                {visibleStrategies.map((s) => {
                  const inds = Array.isArray(s.spec?.indicators)
                    ? (s.spec.indicators as { settings?: Record<string, unknown> }[])
                        .map((i) => (i.settings ? Object.keys(i.settings)[0] : "?"))
                        .join(", ")
                    : "—";
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="strategy-name">{s.name}</div>
                        {s.description ? <div className="strategy-sub">{s.description}</div> : null}
                      </td>
                      <td className="mono">{inds || "—"}</td>
                      <td className="table-datetime">{strategyApi.fmtDateTime(s.updatedAt)}</td>
                      <td>
                        <button type="button" className="btn ghost" onClick={() => chooseSeedStrategy(s.id)}>
                          Использовать как базу
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {resultsView === "presets" ? (
          <div className="table-scroll table-scroll-fill strategy-table-scroll">
            <table className="strategy-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Создано</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {presets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="hint">
                      Сохранённых настроек пока нет.
                    </td>
                  </tr>
                ) : null}
                {presets.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="strategy-name">{p.name}</div>
                    </td>
                    <td className="table-datetime">{strategyApi.fmtDateTime(p.createdAt)}</td>
                    <td className="strategy-row-actions">
                      <button type="button" className="btn ghost" onClick={() => applyPreset(p)}>
                        Загрузить
                      </button>
                      <button type="button" className="btn ghost" onClick={() => setPresetToDelete(p)}>
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {openSearch ? (
        <OptunaSearchResultModal
          searchId={openSearch}
          onClose={() => setOpenSearch(null)}
          onRefreshList={loadSearches}
          onCreatedStrategy={onCreatedStrategy}
        />
      ) : null}

      {presetSavePrompt ? (
        <PromptDialog
          title="Сохранить настройки поиска"
          message="Будут сохранены стратегия, инструмент, цели, бюджет, семплер/прунер и пространство поиска — целиком текущая форма. Если имя совпадёт с уже сохранённым, будет предложено перезаписать."
          label="Название"
          defaultValue={name || "Мои настройки"}
          confirmLabel="Сохранить"
          onCancel={() => setPresetSavePrompt(false)}
          onSubmit={(presetName) => {
            setPresetSavePrompt(false);
            requestSavePreset(presetName);
          }}
        />
      ) : null}

      {pendingOverwrite ? (
        <ConfirmDialog
          title="Перезаписать настройки"
          message={<>Настройки «{pendingOverwrite.name}» уже существуют. Заменить их текущей формой?</>}
          confirmLabel="Перезаписать"
          tone="danger"
          onCancel={() => setPendingOverwrite(null)}
          onConfirm={() => {
            const { name: n, id } = pendingOverwrite;
            setPendingOverwrite(null);
            void savePreset(n, id);
          }}
        />
      ) : null}

      {presetToDelete ? (
        <ConfirmDialog
          title="Удалить настройки"
          message={<>Настройки «{presetToDelete.name}» будут удалены без возможности восстановления.</>}
          confirmLabel="Удалить"
          tone="danger"
          onCancel={() => setPresetToDelete(null)}
          onConfirm={() => {
            const p = presetToDelete;
            setPresetToDelete(null);
            void deletePreset(p);
          }}
        />
      ) : null}
    </div>
  );
}

function OptunaSearchResultModal({
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
  const [best, setBest] = useState<api.Trial[]>([]);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [progress, bestRes] = await Promise.all([
        api.getSearchProgress(searchId),
        api.getBestTrials(searchId, 15).catch(() => ({ items: [] as api.Trial[] })),
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

  const [saveTarget, setSaveTarget] = useState<api.Trial | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [resultTab, setResultTab] = useState<"best" | "charts">("best");
  const [expanded, setExpanded] = useState(false);

  const saveTrial = async (t: api.Trial, name: string) => {
    if (!t.spec) return;
    try {
      await strategyApi.createStrategy({ name, description: `Из Optuna-поиска ${searchId}`, spec: t.spec });
      notify.success("Стратегия создана");
      onCreatedStrategy();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось создать");
    }
  };

  const p = run?.progress;
  const active = ACTIVE_STATUSES.includes(p?.status ?? "RUN_QUEUED");
  const objectiveMetrics = run?.study?.objective?.metrics ?? [];
  const isMulti = p?.isMultiObjective ?? objectiveMetrics.length > 1;

  // Человекопонятные подписи для params трайла — те же ярлыки, что в
  // билдере пространства поиска ("RSI «rsi» · Период"), а не сырые path.
  const paramLabels = useMemo(() => {
    const opts = optimizableParams(run?.baseSpec);
    return new Map(opts.map((o) => [o.path, o.label]));
  }, [run?.baseSpec]);

  const formatTrialParams = (params: Record<string, number> | undefined): string => {
    const entries = Object.entries(params ?? {});
    if (entries.length === 0) return "—";
    return entries.map(([path, value]) => `${paramLabels.get(path) ?? path} = ${api.num(value, 4)}`).join("; ");
  };

  return (
    <>
      <ModalBackdrop onClose={onClose} className="strategy-modal-overlay" title="Optuna-поиск">
        <div className={`strategy-modal wide${expanded ? " expanded" : ""}`}>
          <header className="strategy-modal-head">
            <h2>Optuna-поиск {p ? statusChip(p.status) : null}</h2>
            <div className="strategy-modal-head-actions">
              <button
                type="button"
                className="strategy-modal-close"
                title={expanded ? "Свернуть окно" : "Развернуть окно"}
                aria-label={expanded ? "Свернуть окно" : "Развернуть окно"}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "⤡" : "⤢"}
              </button>
              <button type="button" className="strategy-modal-close" onClick={onClose}>
                ×
              </button>
            </div>
          </header>

          {run ? (
            <div className="strategy-result-meta">
              <span className="mono">{run.config?.uid}</span> · цели{" "}
              <b>{objectiveMetrics.map((m) => `${m.metric} (${m.maximize ? "max" : "min"})`).join(", ") || "—"}</b> ·
              трайлов {(p?.completedTrials ?? 0) + (p?.prunedTrials ?? 0) + (p?.failedTrials ?? 0)}
              {p?.totalTrials ? ` из ${p.totalTrials}` : ""} · готово {p?.completedTrials ?? 0} · отсечено{" "}
              {p?.prunedTrials ?? 0} · ошибок {p?.failedTrials ?? 0}
              {!isMulti ? (
                <>
                  {" "}
                  · лучшее{" "}
                  <b>{api.num(p?.bestValues ? Object.values(p.bestValues)[0] : undefined, 4)}</b>
                </>
              ) : (
                <> · фронт Парето: {p?.paretoFrontTrialIds?.length ?? 0}</>
              )}
              {p?.error ? <div className="strategy-error">{p.error}</div> : null}
            </div>
          ) : null}

          {active ? (
            <div className="strategy-running">
              <span className="strategy-spinner" /> Поиск идёт…
              <button type="button" className="btn ghost" onClick={() => setConfirmCancel(true)}>
                Отменить
              </button>
            </div>
          ) : null}

          <div className="strategy-trades">
            <div className="chart-tabs">
              <button type="button" className={resultTab === "best" ? "active" : ""} onClick={() => setResultTab("best")}>
                {isMulti ? "Фронт Парето / лучшие трайлы" : "Лучшие трайлы"}
              </button>
              <button type="button" className={resultTab === "charts" ? "active" : ""} onClick={() => setResultTab("charts")}>
                Графики
              </button>
            </div>

            {resultTab === "charts" ? (
              <SearchCharts searchId={searchId} run={run} paramLabels={paramLabels} />
            ) : best.length === 0 ? (
              <p className="hint">Пока нет завершённых трайлов.</p>
            ) : (
              <div className="table-scroll strategy-trades-scroll">
                <table className="strategy-table compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Статус</th>
                      <th>Параметры</th>
                      {objectiveMetrics.map((m) => (
                        <th key={m.metric} className="num">
                          {m.metric}
                        </th>
                      ))}
                      <th className="num">Sharpe</th>
                      <th className="num">Просадка</th>
                      <th className="num">Сделок</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {best.map((t) => (
                      <tr key={t.trialId}>
                        <td>
                          {t.number}
                          {t.isParetoOptimal ? " ★" : ""}
                        </td>
                        <td>{api.TRIAL_STATE_LABEL[t.state]}</td>
                        <td className="mono strategy-sub">{formatTrialParams(t.params)}</td>
                        {objectiveMetrics.map((m) => (
                          <td key={m.metric} className="num">
                            {api.num(t.values?.[m.metric], 4)}
                          </td>
                        ))}
                        <td className="num">{api.num(t.metrics?.sharpe)}</td>
                        <td className="num">{api.pct(t.metrics?.maxDrawdown)}</td>
                        <td className="num">{t.metrics?.tradesCount ?? "—"}</td>
                        <td>
                          <button type="button" className="btn ghost" onClick={() => setSaveTarget(t)}>
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
      </ModalBackdrop>

      {saveTarget ? (
        <PromptDialog
          title="Сохранить как стратегию"
          message={
            <>
              Трайл #{saveTarget.number} — будет добавлен в каталог стратегий.
            </>
          }
          label="Название стратегии"
          defaultValue={`${run?.name || "Optuna-поиск"} #${saveTarget.number}`}
          confirmLabel="Сохранить"
          onCancel={() => setSaveTarget(null)}
          onSubmit={(name) => {
            const t = saveTarget;
            setSaveTarget(null);
            void saveTrial(t, name);
          }}
        />
      ) : null}

      {confirmCancel ? (
        <ConfirmDialog
          title="Отменить поиск"
          message="Прогресс уже оценённых трайлов сохранится."
          confirmLabel="Отменить поиск"
          tone="danger"
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false);
            void cancel();
          }}
        />
      ) : null}
    </>
  );
}
