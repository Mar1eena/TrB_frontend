// Общий чек-лист параметров для графиков с множественным выбором осей
// (Parallel coordinates, Slice) — переиспользуемый пикер вместо дублирования
// одного и того же набора чекбоксов-пиллов и кнопок «Все»/«Сброс» в каждом
// графике по отдельности.

import type * as api from "../../../api/strategysearch";

/** Топ-N путей параметров по важности; без данных важности — первые N как есть. */
export function topByImportance(paths: string[], importances: api.ParamImportance[], n: number): string[] {
  if (importances.length === 0) return paths.slice(0, n);
  const order = new Map(importances.map((im) => [im.path, im.importance]));
  return [...paths].sort((a, b) => (order.get(b) ?? -1) - (order.get(a) ?? -1)).slice(0, n);
}

export function ParamChecklist({
  paths,
  paramLabels,
  selected,
  onToggle,
  onAll,
  onNone,
}: {
  paths: string[];
  paramLabels: Map<string, string>;
  selected: Set<string>;
  onToggle: (path: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="chart-param-checklist">
      {paths.map((p) => (
        <label key={p} className={`chart-param-pill${selected.has(p) ? " active" : ""}`}>
          <input type="checkbox" checked={selected.has(p)} onChange={() => onToggle(p)} />
          {paramLabels.get(p) ?? p}
        </label>
      ))}
      <span className="chart-param-checklist-actions">
        <button type="button" onClick={onAll}>
          Все
        </button>
        <button type="button" onClick={onNone}>
          Сброс
        </button>
      </span>
    </div>
  );
}
