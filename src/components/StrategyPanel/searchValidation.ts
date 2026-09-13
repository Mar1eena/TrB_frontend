// Валидация настроек поиска 2.0 (Optuna) до отправки на сервер. Зеркалирует
// проверки на Go (internal/services/strategysearch/manage/pkg/validate/study.go),
// чтобы форма отклоняла типичные ошибки конфигурации сразу, а не после ответа
// сервера или (хуже) после провала уже запущенного поиска глубоко в движке.
// Без схемной библиотеки (zod/yup здесь не используются, см. остальной StrategyPanel) —
// ручные проверки в том же стиле, что и весь модуль.

import type * as api from "../../api/strategysearch";
import type { OptunaSpaceRow } from "./OptunaBuilders";
import type { TemplateForm } from "./TemplateBuilder";
import type { MarketSpaceForm } from "./MarketSpaceBuilder";

export type ValidationIssue = { path: string; message: string };

export function validateOptunaSpaceRows(rows: OptunaSpaceRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const path = r.path.trim();
    const p = `search_space.${i}`;
    if (!path) {
      issues.push({ path: `${p}.path`, message: "путь параметра обязателен" });
      return;
    }
    if (seen.has(path)) {
      issues.push({ path: `${p}.path`, message: `дублирующийся путь параметра: ${path}` });
    }
    seen.add(path);
    switch (r.kind) {
      case "int":
      case "float":
        if (r.min > r.max) {
          issues.push({ path: p, message: "мин. не может быть больше макс." });
        }
        if (r.step != null && r.step < 0) {
          issues.push({ path: `${p}.step`, message: "шаг не может быть отрицательным" });
        }
        break;
      case "log_float":
        if (r.min <= 0) {
          issues.push({ path: `${p}.min`, message: "требуется строго положительное значение (log-диапазон)" });
        }
        if (r.min > r.max) {
          issues.push({ path: p, message: "мин. не может быть больше макс." });
        }
        break;
      case "choice":
        if (!(r.choiceValues ?? "").split(",").map((s) => s.trim()).filter(Boolean).length) {
          issues.push({ path: p, message: "нужно хотя бы одно значение" });
        }
        break;
      case "categorical":
        if (!(r.categoricalValues ?? "").split(",").map((s) => s.trim()).filter(Boolean).length) {
          issues.push({ path: p, message: "нужно хотя бы одно значение" });
        }
        break;
    }
  });
  return issues;
}

// GridSampler требует конечный перебор: ints, floats/log_floats только со step,
// либо choice/categorical (см. engine/search/samplers.py:_grid_space).
function isGridCompatible(row: OptunaSpaceRow): boolean {
  if (row.kind === "int" || row.kind === "choice" || row.kind === "categorical") return true;
  if (row.kind === "float") return !!row.step && row.step > 0;
  return false; // log_float несовместим с Grid ни при каких условиях
}

export function validateSampler(sampler: api.SamplerConfig, rows: OptunaSpaceRow[]): ValidationIssue[] {
  if (!sampler.grid) return [];
  const issues: ValidationIssue[] = [];
  rows.forEach((r, i) => {
    if (!isGridCompatible(r)) {
      issues.push({
        path: `search_space.${i}`,
        message: "GridSampler требует ints, floats со step, либо choice/categorical",
      });
    }
  });
  return issues;
}

export function validatePruner(pruner: api.PrunerConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (pruner.percentile) {
    const pct = pruner.percentile.percentile;
    if (pct != null && (pct < 0 || pct > 100)) {
      issues.push({ path: "study.pruner.percentile.percentile", message: "ожидается значение в [0, 100]" });
    }
  }
  if (pruner.successiveHalving) {
    const rf = pruner.successiveHalving.reductionFactor;
    if (rf != null && rf !== 0 && rf <= 1) {
      issues.push({ path: "study.pruner.successive_halving.reduction_factor", message: "должен быть больше 1" });
    }
  }
  if (pruner.hyperband) {
    const { reductionFactor: rf, maxResource: maxR, minResource: minR } = pruner.hyperband;
    if (rf != null && rf !== 0 && rf <= 1) {
      issues.push({ path: "study.pruner.hyperband.reduction_factor", message: "должен быть больше 1" });
    }
    if (maxR != null && maxR !== 0 && minR != null && minR !== 0 && maxR < minR) {
      issues.push({ path: "study.pruner.hyperband.max_resource", message: "не может быть меньше min_resource" });
    }
  }
  if (pruner.threshold) {
    const { lower, upper } = pruner.threshold;
    if (!lower && !upper) {
      issues.push({ path: "study.pruner.threshold", message: "нужна хотя бы одна граница (lower или upper)" });
    }
  }
  return issues;
}

export function validateObjective(objective: api.ObjectiveMetric[], minTrades: number, maxDrawdownLimit: number | undefined): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (objective.length === 0) {
    issues.push({ path: "study.objective.metrics", message: "нужна хотя бы одна метрика" });
  }
  if (minTrades < 0) {
    issues.push({ path: "study.objective.min_trades", message: "не может быть отрицательным" });
  }
  if (maxDrawdownLimit != null && maxDrawdownLimit !== 0 && (maxDrawdownLimit < 0 || maxDrawdownLimit >= 1)) {
    issues.push({ path: "study.objective.max_drawdown_limit", message: "ожидается доля в [0, 1)" });
  }
  return issues;
}

export function validateBudget(nTrials: number, timeoutSeconds: number, nJobs: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nTrials && !timeoutSeconds) {
    issues.push({ path: "study.budget", message: "задайте число трайлов или таймаут" });
  }
  if (nJobs < 0) {
    issues.push({ path: "study.budget.n_jobs", message: "не может быть отрицательным" });
  }
  return issues;
}

// Зеркалирует validate.Template (manage/pkg/validate/template.go).
export function validateTemplate(t: TemplateForm): ValidationIssue[] {
  if (!t.enabled) return [];
  const issues: ValidationIssue[] = [];
  if (t.indicatorPalette.length === 0) {
    issues.push({ path: "template.indicator_palette", message: "нужен хотя бы один тип индикатора" });
  }
  if (t.maxIndicators < 1) {
    issues.push({ path: "template.max_indicators", message: "должен быть больше 0" });
  }
  if (t.maxConditionsEntry < 1) {
    issues.push({ path: "template.max_conditions_entry", message: "должен быть больше 0" });
  }
  for (const type of t.indicatorPalette) {
    for (const row of t.typeRanges[type] ?? []) {
      if (row.min > row.max) {
        issues.push({ path: `template.${type}.${row.name}`, message: "мин. не может быть больше макс." });
      }
    }
  }
  return issues;
}

export function validateMarketSpace(m: MarketSpaceForm): ValidationIssue[] {
  if (!m.enabled) return [];
  const issues: ValidationIssue[] = [];
  if (!m.periodLengthDays || m.periodLengthDays < 1) {
    issues.push({ path: "market_space.period_length_days", message: "укажите длину окна бэктеста в днях" });
  }
  if (m.mode === "MARKET_MODE_PALETTE" && m.uidFilter.length === 0) {
    issues.push({ path: "market_space.uid_filter", message: "выберите хотя бы один инструмент для перебора" });
  }
  return issues;
}

// Grid/CmaEs/QMC требуют статическую фиксированную размерность пространства
// поиска — несовместимы со структурным/рыночным поиском, где набор suggest_*
// зависит от предыдущих выборов внутри trial (см. engine/search/compose.py,
// market.py и manage/pkg/validate/template.go:SamplerForStructuralSearch).
export function validateStructuralSamplerCompat(sampler: api.SamplerConfig, structuralActive: boolean): ValidationIssue[] {
  if (!structuralActive) return [];
  const incompatible: [boolean, string][] = [
    [!!sampler.grid, "GridSampler"],
    [!!sampler.cmaes, "CmaEsSampler"],
    [!!sampler.qmc, "QMCSampler"],
  ];
  const hit = incompatible.find(([on]) => on);
  if (!hit) return [];
  return [{ path: "study.sampler", message: `${hit[1]} несовместим со структурным/рыночным поиском — выберите TPE/Random/NSGA-II` }];
}

export function validateOptunaSettings(input: {
  spaceRows: OptunaSpaceRow[];
  sampler: api.SamplerConfig;
  pruner: api.PrunerConfig;
  objectiveMetrics: api.ObjectiveMetric[];
  minTrades: number;
  maxDrawdownLimit: number | undefined;
  nTrials: number;
  timeoutSeconds: number;
  nJobs: number;
}): ValidationIssue[] {
  return [
    ...validateOptunaSpaceRows(input.spaceRows),
    ...validateSampler(input.sampler, input.spaceRows),
    ...validatePruner(input.pruner),
    ...validateObjective(input.objectiveMetrics, input.minTrades, input.maxDrawdownLimit),
    ...validateBudget(input.nTrials, input.timeoutSeconds, input.nJobs),
  ];
}
