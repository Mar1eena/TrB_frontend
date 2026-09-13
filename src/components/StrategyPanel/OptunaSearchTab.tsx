// Вкладка «Поиск 2.0» — Optuna-поиск стратегий (backtrader/TA-Lib/QuantStats).
// Независимый от каталога генетического поиска сервис: base_spec передаётся
// инлайн, поэтому «базовая стратегия» здесь — только удобная затравка для
// встроенного SpecBuilder, а не обязательная ссылка.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotify } from "../../notifications";
import { CANDLE_INTERVALS } from "../../api/scheduler";
import * as api from "../../api/strategysearch";
import { SPEC_TEMPLATES, type SpecTemplate } from "./templates";
import { pruneSpec } from "./specModel";
import SpecBuilder from "./SpecBuilder";
import { InfoTip } from "./InfoTip";
import { ObjectiveBuilder, OptunaSpaceBuilder, PrunerBuilder, SamplerBuilder } from "./OptunaBuilders";
import { optimizableParams } from "./SearchBuilders";
import { TemplateBuilder } from "./TemplateBuilder";
import { MarketSpaceBuilder } from "./MarketSpaceBuilder";
import { applyPresetToForm, applySpecToForm, defaultSearchForm, prepareSubmission, type SpecMode } from "./searchForm";
import {
  validateOptunaSpaceRows,
  validateSampler,
  validatePruner,
  validateObjective,
  validateBudget,
  validateTemplate,
  validateMarketSpace,
  validateStructuralSamplerCompat,
  type ValidationIssue,
} from "./searchValidation";
import { SearchSection, openSearchSection } from "./SearchAccordion";
import { SearchCharts } from "./charts/SearchCharts";
import { ConfirmDialog, PromptDialog } from "./ConfirmDialog";
import { ModalBackdrop } from "../common/ModalBackdrop";

type Instrument = { uid: string; ticker: string; name: string };

const ACTIVE_STATUSES: api.RunStatus[] = ["RUN_QUEUED", "RUN_RUNNING"];

const SEARCH_STATUS_FILTERS: api.RunStatus[] = ["RUN_QUEUED", "RUN_RUNNING", "RUN_SUCCEEDED", "RUN_FAILED", "RUN_CANCELED"];

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

// Порядок секций аккордеона сверху вниз — используется, чтобы клик по сводке
// ошибок в липком футере раскрывал самую верхнюю секцию с ошибкой, а не
// произвольную.
const SECTION_ORDER = ["strategy", "market", "objective", "budget", "algo"] as const;
type SectionId = (typeof SECTION_ORDER)[number];

// ValidationIssue.path единообразен по всему searchValidation.ts (см. его
// комментарии) — префикс однозначно определяет, к какой секции формы
// относится ошибка.
function sectionForIssue(path: string): SectionId {
  if (path.startsWith("template.")) return "strategy";
  if (path.startsWith("market_space.")) return "market";
  if (path.startsWith("study.objective")) return "objective";
  if (path.startsWith("study.budget")) return "budget";
  return "algo"; // study.sampler, study.pruner, search_space.*
}

function pluralIssues(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "ошибка";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "ошибки";
  return "ошибок";
}

export default function OptunaSearchTab({
  instruments,
}: {
  instruments: Instrument[];
}) {
  const notify = useNotify();

  // --- единое состояние формы: одно значение = один источник правды для
  // всего, что в итоге сериализуется в SubmitSearchRequest/CreateSearchPresetRequest.
  // Раньше это были ~25 независимых useState, а submit()/savePreset() каждый
  // заново собирали config/study/template/marketSpace — те же поля в двух
  // местах, что и разошлось в истории правок uid/interval/start/end при
  // включённом рыночном поиске. См. prepareSubmission в searchForm.ts.
  const [form, setForm] = useState(defaultSearchForm);
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const chooseTemplate = (id: string) => {
    const tpl = SPEC_TEMPLATES.find((t) => t.id === id);
    setForm((f) => ({ ...(tpl ? applySpecToForm(f, tpl.spec) : f), templateId: id }));
  };

  const switchSpecMode = (next: SpecMode) => {
    if (next === form.specMode) return;
    if (next === "json") {
      patch({ specText: JSON.stringify(pruneSpec(form.spec), null, 2), specMode: "json" });
      return;
    }
    try {
      setForm((f) => ({ ...applySpecToForm(f, JSON.parse(f.specText)), specMode: "builder" }));
    } catch (err) {
      notify.error(`Некорректный JSON: ${err instanceof Error ? err.message : ""}`);
    }
  };

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

  // Единственное место, где собирается и валидируется JSON запроса —
  // submit()/savePreset() лишь добавляют своё "name" к общему payload
  // (см. prepareSubmission в searchForm.ts).
  const submit = async () => {
    const prep = prepareSubmission(form);
    if (!prep.ok) {
      notify.error(prep.message);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitSearch({ name: form.name.trim() || undefined, ...prep.payload });
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
    const prep = prepareSubmission(form);
    if (!prep.ok) {
      notify.error(prep.message);
      return;
    }
    setSavingPreset(true);
    try {
      await api.createSearchPreset({ name: presetName, ...prep.payload });
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
    setForm((f) => applyPresetToForm(f, p));
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

  const indicatorCount = Array.isArray(form.spec.indicators) ? (form.spec.indicators as unknown[]).length : 0;

  // Структурный/рыночный поиск не совместим с sampler'ами, требующими
  // статичное пространство поиска (Grid/CMA-ES/QMC) — см. SamplerBuilder и
  // validateStructuralSamplerCompat.
  const structuralActive = form.template.enabled || form.marketForm.enabled;

  // Живая валидация формы — тот же набор проверок, что prepareSubmission
  // (searchForm.ts) гоняет перед отправкой, но здесь нужна не для блокировки
  // сабмита, а чтобы показать бейджи ошибок на секциях аккордеона и не
  // заставлять пользователя жать «Запустить» вслепую.
  const validationIssues: ValidationIssue[] = useMemo(
    () => [
      ...validateOptunaSpaceRows(form.spaceRows),
      ...validateSampler(form.sampler, form.spaceRows),
      ...validatePruner(form.pruner),
      ...validateObjective(form.objectiveMetrics, form.minTrades, form.maxDrawdownLimit),
      ...validateBudget(form.nTrials, form.timeoutSeconds, form.nJobs),
      ...validateTemplate(form.template),
      ...validateMarketSpace(form.marketForm),
      ...validateStructuralSamplerCompat(form.sampler, structuralActive),
    ],
    [
      form.spaceRows,
      form.sampler,
      form.pruner,
      form.objectiveMetrics,
      form.minTrades,
      form.maxDrawdownLimit,
      form.nTrials,
      form.timeoutSeconds,
      form.nJobs,
      form.template,
      form.marketForm,
      structuralActive,
    ],
  );

  const sectionIssueCounts = useMemo(() => {
    const counts: Record<SectionId, number> = { strategy: 0, market: 0, objective: 0, budget: 0, algo: 0 };
    for (const issue of validationIssues) counts[sectionForIssue(issue.path)]++;
    return counts;
  }, [validationIssues]);

  const firstIssueSection = SECTION_ORDER.find((id) => sectionIssueCounts[id] > 0);

  const [resultsView, setResultsView] = useState<"searches" | "presets">("searches");

  const [searchNameFilter, setSearchNameFilter] = useState("");
  const [searchStatusFilter, setSearchStatusFilter] = useState<api.RunStatus | "all">("all");
  const [presetNameFilter, setPresetNameFilter] = useState("");

  const filteredSearches = searches.filter((s) => {
    if (searchStatusFilter !== "all" && (s.progress?.status ?? "RUN_QUEUED") !== searchStatusFilter) return false;
    const q = searchNameFilter.trim().toLowerCase();
    if (!q) return true;
    return (s.name || s.searchId).toLowerCase().includes(q);
  });

  const filteredPresets = presets.filter((p) => {
    const q = presetNameFilter.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q);
  });

  const [duplicateFromName, setDuplicateFromName] = useState<string | null>(null);

  const duplicatePreset = (p: api.SearchPreset) => {
    setForm((f) => applyPresetToForm(f, p));
    setDuplicateFromName(`${p.name} (копия)`);
    setPresetSavePrompt(true);
  };

  return (
    <div className="search-layout">
      <div className="filters-bar search-filters search-layout-settings">
        <SearchSection
          id="strategy"
          title="Стратегия"
          info="Базовый спек передаётся отдельно на каждый запуск поиска. Возьмите шаблон как затравку и донастройте конструктором."
          badgeCount={sectionIssueCounts.strategy}
        >
          <div className="filters-row filters-fields">
            <label className="filter-field">
              <span>Название поиска</span>
              <input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="необязательно" />
            </label>
            <label className="filter-field">
              <span>Шаблон</span>
              <select value={form.templateId} onChange={(e) => chooseTemplate(e.target.value)}>
                {SPEC_TEMPLATES.map((t: SpecTemplate) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="strategy-mode-switch">
            <button
              type="button"
              className={`strategy-tab ${form.specMode === "builder" ? "is-active" : ""}`}
              onClick={() => switchSpecMode("builder")}
            >
              Конструктор
            </button>
            <button
              type="button"
              className={`strategy-tab ${form.specMode === "json" ? "is-active" : ""}`}
              onClick={() => switchSpecMode("json")}
            >
              JSON
            </button>
            <span className="strategy-editor-sub">индикаторов: {indicatorCount}</span>
          </div>

          <TemplateBuilder value={form.template} onChange={(template) => patch({ template })} />

          {form.template.enabled ? (
            <p className="hint">
              Включён поиск по палитре индикаторов (выше) — индикаторы и правила входа/выхода из спека ниже будут
              проигнорированы, движок соберёт их сам. Sizing/risk/warmup по-прежнему используются из спека.
            </p>
          ) : null}

          {form.specMode === "builder" ? (
            <SpecBuilder value={form.spec} onChange={(spec) => patch({ spec })} issues={null} />
          ) : (
            <label className="filter-field strategy-json-field">
              <span>StrategySearchSpec (JSON)</span>
              <textarea spellCheck={false} value={form.specText} onChange={(e) => patch({ specText: e.target.value })} rows={16} />
            </label>
          )}
        </SearchSection>

        <SearchSection
          id="market"
          title="Рынок и период"
          info="Инструмент, интервал свечей и период истории для оценки трайлов. Бенчмарк — опционально, нужен для alpha/beta/information_ratio/R² в метриках. Рыночный поиск делает инструмент и период тоже частью подбора Optuna, вместо фиксированных значений."
          badgeCount={sectionIssueCounts.market}
        >
          <datalist id="strategy-instruments-optuna">
            {instruments.slice(0, 2000).map((i) => (
              <option key={i.uid} value={i.uid}>
                {i.ticker} — {i.name}
              </option>
            ))}
          </datalist>

          <MarketSpaceBuilder value={form.marketForm} onChange={(marketForm) => patch({ marketForm })} instruments={instruments} />

          <div className="filters-row filters-fields">
            {!form.marketForm.enabled ? (
              <>
                <label className="filter-field">
                  <span>Инструмент</span>
                  <input
                    list="strategy-instruments-optuna"
                    value={form.uid}
                    onChange={(e) => patch({ uid: e.target.value.trim() })}
                  />
                </label>
                <label className="filter-field">
                  <span>Интервал</span>
                  <select value={form.interval} onChange={(e) => patch({ interval: Number(e.target.value) })}>
                    {CANDLE_INTERVALS.map((iv) => (
                      <option key={iv.value} value={iv.value}>
                        {iv.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-field">
                  <span>С</span>
                  <input type="datetime-local" value={form.start} onChange={(e) => patch({ start: e.target.value })} />
                </label>
                <label className="filter-field">
                  <span>По</span>
                  <input type="datetime-local" value={form.end} onChange={(e) => patch({ end: e.target.value })} />
                </label>
              </>
            ) : null}
            <label className="filter-field">
              <span>
                Бенчмарк
                <InfoTip text="Инструмент сравнения для QuantStats-метрик alpha/beta/information_ratio/R². Оставьте пустым, если не нужно. Не зависит от рыночного поиска — бенчмарк всегда один фиксированный инструмент." />
              </span>
              <input
                list="strategy-instruments-optuna"
                value={form.benchmarkUid}
                onChange={(e) => patch({ benchmarkUid: e.target.value.trim() })}
                placeholder="необязательно"
              />
            </label>
          </div>
        </SearchSection>

        <SearchSection
          id="objective"
          title="Цель и ограничения"
          info="Что оптимизирует Optuna и какие трайлы отсекать как недостоверные."
          badgeCount={sectionIssueCounts.objective}
        >
          <ObjectiveBuilder metrics={form.objectiveMetrics} onChange={(objectiveMetrics) => patch({ objectiveMetrics })} />
          <div className="filters-row filters-fields">
            <label className="filter-field">
              <span>
                Мин. сделок
                <InfoTip text="Трайлы с меньшим числом закрытых сделок отсекаются (прунятся) — по единичным сделкам метрика недостоверна." />
              </span>
              <input type="number" value={form.minTrades} onChange={(e) => patch({ minTrades: Number(e.target.value) })} />
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
                value={form.maxDrawdownLimit ?? ""}
                onChange={(e) => patch({ maxDrawdownLimit: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
          </div>
        </SearchSection>

        <SearchSection
          id="budget"
          title="Бюджет"
          info="Сколько трайлов перебрать и как долго. Интервал чекпойнтов включает пост-фактум прунинг: воркер считает бэктест целиком, но репортит промежуточные точки для сравнения с конкурентными трайлами."
          badgeCount={sectionIssueCounts.budget}
        >
          <div className="filters-row filters-fields">
            <label className="filter-field">
              <span>
                Трайлов
                <InfoTip text="Сколько вариантов параметров проверить. 0 — не ограничено (тогда обязателен лимит времени)." />
              </span>
              <input type="number" value={form.nTrials} onChange={(e) => patch({ nTrials: Number(e.target.value) })} />
            </label>
            <label className="filter-field">
              <span>Лимит, сек</span>
              <input
                type="number"
                value={form.timeoutSeconds}
                onChange={(e) => patch({ timeoutSeconds: Number(e.target.value) })}
              />
            </label>
            <label className="filter-field">
              <span>
                Параллельно
                <InfoTip text="Сколько трайлов оценивать одновременно (n_jobs) — потоки координатора, раздающие задачи пулу воркеров." />
              </span>
              <input type="number" value={form.nJobs} onChange={(e) => patch({ nJobs: Number(e.target.value) })} />
            </label>
            <label className="filter-field">
              <span>Seed</span>
              <input value={form.seed} onChange={(e) => patch({ seed: e.target.value })} placeholder="авто" />
            </label>
            <label className="filter-field">
              <span>
                Интервал чекпойнтов, баров
                <InfoTip text="Раз в столько баров бэктеста фиксировать капитал для прунера. 0 — чекпойнты не считаются, прунинг неактивен независимо от выбранного pruner." />
              </span>
              <input
                type="number"
                value={form.pruningInterval}
                onChange={(e) => patch({ pruningInterval: Number(e.target.value) })}
              />
            </label>
            <label className="strategy-inline-check">
              <input
                type="checkbox"
                checked={form.disableCache}
                onChange={(e) => patch({ disableCache: e.target.checked })}
              />
              не использовать кэш оценок
            </label>
          </div>
        </SearchSection>

        <SearchSection
          id="algo"
          title="Алгоритм и пространство поиска"
          info="Как Optuna выбирает параметры (sampler), когда останавливать неперспективные трайлы раньше времени (pruner), и какие параметры варьировать."
          badgeCount={sectionIssueCounts.algo}
        >
          <SamplerBuilder value={form.sampler} onChange={(sampler) => patch({ sampler })} structuralActive={structuralActive} />
          <PrunerBuilder value={form.pruner} onChange={(pruner) => patch({ pruner })} />
          <OptunaSpaceBuilder rows={form.spaceRows} onChange={(spaceRows) => patch({ spaceRows })} spec={form.spec} />
        </SearchSection>

        <div className="filters-row filters-actions search-actions-sticky">
          <button type="button" className="btn primary" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Запуск…" : "Запустить поиск"}
          </button>
          <button type="button" className="btn ghost" onClick={() => void loadSearches()}>
            Обновить
          </button>
          {validationIssues.length > 0 && firstIssueSection ? (
            <button
              type="button"
              className="search-actions-issues"
              onClick={() => openSearchSection(firstIssueSection)}
              title={validationIssues.map((i) => i.message).join("; ")}
            >
              ⚠ {validationIssues.length} {pluralIssues(validationIssues.length)}
            </button>
          ) : null}
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
          <div className="search-results-filter">
            <input
              type="search"
              placeholder="поиск по названию…"
              value={searchNameFilter}
              onChange={(e) => setSearchNameFilter(e.target.value)}
            />
            <div className="search-chips">
              <button
                type="button"
                className={`search-chip ${searchStatusFilter === "all" ? "is-on" : ""}`}
                onClick={() => setSearchStatusFilter("all")}
              >
                Все
              </button>
              {SEARCH_STATUS_FILTERS.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`search-chip ${searchStatusFilter === st ? "is-on" : ""}`}
                  onClick={() => setSearchStatusFilter(st)}
                >
                  {api.RUN_STATUS_LABEL[st]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

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
                {filteredSearches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="hint">
                      {searches.length === 0 ? "Поисков ещё нет." : "Ничего не найдено."}
                    </td>
                  </tr>
                ) : null}
                {filteredSearches.map((s) => {
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
                      <td className="mono">
                        {s.marketCandidates?.length ? `${s.marketCandidates.length} инструм.` : s.config?.uid?.slice(0, 10) || "—"}
                      </td>
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

        {resultsView === "presets" ? (
          <div className="search-results-filter">
            <input
              type="search"
              placeholder="поиск по названию…"
              value={presetNameFilter}
              onChange={(e) => setPresetNameFilter(e.target.value)}
            />
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
                {filteredPresets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="hint">
                      {presets.length === 0 ? "Сохранённых настроек пока нет." : "Ничего не найдено."}
                    </td>
                  </tr>
                ) : null}
                {filteredPresets.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="strategy-name">{p.name}</div>
                    </td>
                    <td className="table-datetime">{api.fmtDateTime(p.createdAt)}</td>
                    <td className="strategy-row-actions">
                      <button type="button" className="btn ghost" onClick={() => applyPreset(p)}>
                        Загрузить
                      </button>
                      <button type="button" className="btn ghost" onClick={() => duplicatePreset(p)}>
                        Дублировать
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
        />
      ) : null}

      {presetSavePrompt ? (
        <PromptDialog
          title="Сохранить настройки поиска"
          message="Будут сохранены стратегия, инструмент, цели, бюджет, семплер/прунер, пространство поиска, а также поиск по палитре индикаторов и рыночный поиск (если включены) — целиком текущая форма. Если имя совпадёт с уже сохранённым, будет предложено перезаписать."
          label="Название"
          defaultValue={duplicateFromName ?? (form.name || "Мои настройки")}
          confirmLabel="Сохранить"
          onCancel={() => {
            setPresetSavePrompt(false);
            setDuplicateFromName(null);
          }}
          onSubmit={(presetName) => {
            setPresetSavePrompt(false);
            setDuplicateFromName(null);
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
}: {
  searchId: string;
  onClose: () => void;
  onRefreshList: () => void;
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

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [resultTab, setResultTab] = useState<"best" | "charts">("best");

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
      <ModalBackdrop onClose={onClose} className="strategy-fullscreen-overlay" title="Optuna-поиск">
        <div className="strategy-fullscreen">
          <header className="strategy-fullscreen-head">
            <div className="strategy-modal-head">
              <h2>Optuna-поиск {p ? statusChip(p.status) : null}</h2>
              <button type="button" className="strategy-modal-close" onClick={onClose}>
                ×
              </button>
            </div>

            {run ? (
              <div className="strategy-result-meta">
                <span className="mono">
                  {run.marketCandidates?.length ? `${run.marketCandidates.length} инструментов (рыночный поиск)` : run.config?.uid}
                </span>{" "}
                · цели{" "}
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

            <div className="chart-tabs">
              <button type="button" className={resultTab === "best" ? "active" : ""} onClick={() => setResultTab("best")}>
                {isMulti ? "Фронт Парето / лучшие трайлы" : "Лучшие трайлы"}
              </button>
              <button type="button" className={resultTab === "charts" ? "active" : ""} onClick={() => setResultTab("charts")}>
                Графики
              </button>
            </div>
          </header>

          <div className="strategy-fullscreen-body">
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </ModalBackdrop>

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
