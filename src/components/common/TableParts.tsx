import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";

/** Заголовок сортируемой колонки виртуализированной таблицы (`.vtable`). */
export function SortHead<K extends string>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = "",
  title,
  children,
}: {
  label: ReactNode;
  column: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  className?: string;
  title?: string;
  /** Доп. содержимое под кнопкой — например поле фильтра колонки. */
  children?: ReactNode;
}) {
  const active = sortKey === column;
  return (
    <div className={`vtable-cell sortable ${className}`.trim()} title={title}>
      <button type="button" className="sort-btn" onClick={() => onSort(column)}>
        <span>{label}</span>
        <span
          className={`sort-indicator ${active ? "is-active" : ""}`}
          aria-hidden="true"
        >
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
      {children}
    </div>
  );
}

/** Плейсхолдер-строка на время подгрузки (`rowAt` вернул undefined). */
export function SkeletonRow({ columns, alt }: { columns: number; alt: boolean }) {
  return (
    <div className={`vtable-row is-skeleton ${alt ? "is-alt" : ""}`.trim()} aria-hidden="true">
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="vtable-cell">
          <span className="vtable-skeleton-bar" />
        </div>
      ))}
    </div>
  );
}
