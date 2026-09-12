// Вкладка «Графики» результата поиска 2.0: история оптимизации, важность
// параметров, slice-срез, parallel coordinates, EDF и contour — по образцу
// optuna.visualization, но на ECharts (echartsSetup.ts) вместо ручных SVG:
// зум/пан, тултипы со всеми параметрами трайла, brushing по осям parallel
// coordinates, экспорт в PNG.
//
// Данные грузятся один раз при открытии и повторно — при завершении поиска
// или по кнопке «Обновить», а НЕ на каждый poll-тик прогресса (импортансы
// дорого пересчитывать на движке — реконструкция optuna.Study + fANOVA).

import { useEffect, useState } from "react";
import * as api from "../../../api/strategysearch";
import { ContourChart } from "./ContourChart";
import { EdfChart } from "./EdfChart";
import { OptimizationHistoryChart } from "./OptimizationHistoryChart";
import { ParallelCoordinatesChart } from "./ParallelCoordinatesChart";
import { ParamImportanceChart } from "./ParamImportanceChart";
import { SliceChart } from "./SliceChart";

const ACTIVE_STATUSES: api.RunStatus[] = ["RUN_QUEUED", "RUN_RUNNING"];

export function SearchCharts({
  searchId,
  run,
  paramLabels,
}: {
  searchId: string;
  run: api.SearchRun | null;
  paramLabels: Map<string, string>;
}) {
  const objectiveMetrics = run?.study?.objective?.metrics ?? [];
  const [metric, setMetric] = useState(objectiveMetrics[0]?.metric ?? "");
  useEffect(() => {
    if (objectiveMetrics.length > 0 && !objectiveMetrics.some((m) => m.metric === metric)) {
      setMetric(objectiveMetrics[0].metric);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectiveMetrics.map((m) => m.metric).join(",")]);

  const maximize = objectiveMetrics.find((m) => m.metric === metric)?.maximize ?? true;
  const status = run?.progress?.status ?? "RUN_QUEUED";
  const terminal = !ACTIVE_STATUSES.includes(status);

  const [trials, setTrials] = useState<api.Trial[]>([]);
  const [trialsLoading, setTrialsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTrialsLoading(true);
    api
      .listSearchTrials(searchId, { limit: 500 })
      .then((res) => {
        if (!cancelled) setTrials(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setTrials([]);
      })
      .finally(() => {
        if (!cancelled) setTrialsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // terminal берётся в зависимости, чтобы перезагрузить один раз по
    // завершении поиска — сам список активных статусов не меняется на лету.
  }, [searchId, terminal, reloadKey]);

  const [importances, setImportances] = useState<api.ParamImportance[]>([]);
  const [importancesLoading, setImportancesLoading] = useState(false);

  useEffect(() => {
    if (!metric) return;
    let cancelled = false;
    setImportancesLoading(true);
    api
      .getParamImportances(searchId, { metric })
      .then((res) => {
        if (!cancelled) setImportances(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setImportances([]);
      })
      .finally(() => {
        if (!cancelled) setImportancesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchId, terminal, reloadKey, metric]);

  const paramPaths = (run?.searchSpace ?? []).filter((r) => !r.categorical).map((r) => r.path);

  return (
    <div>
      <div className="strategy-result-meta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        {objectiveMetrics.length > 1 ? (
          <div className="chart-metric-tabs">
            {objectiveMetrics.map((m) => (
              <button key={m.metric} type="button" className={m.metric === metric ? "active" : ""} onClick={() => setMetric(m.metric)}>
                {m.metric}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button type="button" className="btn ghost sm" onClick={() => setReloadKey((k) => k + 1)} disabled={trialsLoading || importancesLoading}>
          Обновить графики
        </button>
      </div>

      <div className="chart-section">
        <h4>История оптимизации</h4>
        <OptimizationHistoryChart trials={trials} metric={metric} maximize={maximize} paramLabels={paramLabels} />
      </div>

      <div className="chart-section">
        <h4>Важность параметров</h4>
        <ParamImportanceChart items={importances} paramLabels={paramLabels} />
      </div>

      <div className="chart-section">
        <h4>Срез по параметру</h4>
        <SliceChart trials={trials} metric={metric} paramPaths={paramPaths} paramLabels={paramLabels} />
      </div>

      <div className="chart-section">
        <h4>Parallel coordinates</h4>
        <ParallelCoordinatesChart trials={trials} paramPaths={paramPaths} metric={metric} maximize={maximize} paramLabels={paramLabels} />
      </div>

      <div className="chart-section">
        <h4>Распределение значений цели (EDF)</h4>
        <EdfChart trials={trials} metric={metric} />
      </div>

      <div className="chart-section">
        <h4>Contour</h4>
        <ContourChart trials={trials} metric={metric} paramPaths={paramPaths} paramLabels={paramLabels} />
      </div>
    </div>
  );
}
