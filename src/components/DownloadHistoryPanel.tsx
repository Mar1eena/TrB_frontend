import { useNotify } from "../notifications";
import {
  memo,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CANDLE_INTERVALS } from "../api/scheduler";
import {
  fetchLastDownloads,
  formatDateTime,
  intervalLabel,
  type LastDownload,
} from "../api/historicCandle";
import { useThrottledColumnLayout } from "../hooks/useThrottledColumnLayout";
import "../styles/tables.css";
import "./SchedulerPanel.css";

type SortKey =
  | "uid"
  | "name"
  | "ticker"
  | "interval"
  | "last_start"
  | "last_end";

type SortDir = "asc" | "desc";

type HistoryRow = {
  uid: string;
  name: string;
  ticker: string;
  interval: number | null;
  intervalText: string;
  startMs: number;
  endMs: number;
  startText: string;
  endText: string;
  uidL: string;
  nameL: string;
  tickerL: string;
};

const ROW_HEIGHT = 40;

function toMs(value?: string): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeRows(items: LastDownload[]): HistoryRow[] {
  const rows = items.map((row) => {
    const fromDownload = Boolean(row.has_download);
    const startMs = toMs(row.last_start);
    const endMs = fromDownload ? toMs(row.last_end) : 0;
    return {
      uid: row.uid,
      name: row.name || "",
      ticker: row.ticker || "",
      interval: row.interval,
      intervalText:
        row.interval != null && row.interval > 0
          ? intervalLabel(row.interval)
          : "—",
      startMs,
      endMs,
      startText: formatDateTime(row.last_start),
      endText: fromDownload ? formatDateTime(row.last_end) : "—",
      uidL: (row.uid || "").toLowerCase(),
      nameL: (row.name || "").toLowerCase(),
      tickerL: (row.ticker || "").toLowerCase(),
    };
  });
  // Default view is last_start DESC — avoid re-sorting on first paint.
  rows.sort((a, b) => b.startMs - a.startMs);
  return rows;
}

function compareRows(a: HistoryRow, b: HistoryRow, key: SortKey): number {
  switch (key) {
    case "uid":
      return a.uidL.localeCompare(b.uidL, "ru");
    case "name":
      return a.nameL.localeCompare(b.nameL, "ru");
    case "ticker":
      return a.tickerL.localeCompare(b.tickerL, "ru");
    case "interval":
      return (a.interval ?? -1) - (b.interval ?? -1);
    case "last_start":
      return a.startMs - b.startMs;
    case "last_end":
      return a.endMs - b.endMs;
    default:
      return 0;
  }
}

function SortHead({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <div className={`vtable-cell sortable ${className}`.trim()}>
      <button type="button" className="sort-btn" onClick={() => onSort(column)}>
        <span>{label}</span>
        <span className={`sort-indicator ${active ? "is-active" : ""}`} aria-hidden="true">
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </div>
  );
}

const HistoryRowView = memo(function HistoryRowView({
  row,
  alt,
}: {
  row: HistoryRow;
  alt: boolean;
}) {
  return (
    <div className={`vtable-row ${alt ? "is-alt" : ""}`}>
      <div className="vtable-cell col-uid mono" title={row.uid}>
        {row.uid}
      </div>
      <div className="vtable-cell col-name" title={row.name}>
        {row.name || "—"}
      </div>
      <div className="vtable-cell col-ticker" title={row.ticker}>
        {row.ticker ? <span className="table-chip ticker">{row.ticker}</span> : "—"}
      </div>
      <div className="vtable-cell">
        {row.intervalText !== "—" ? (
          <span className="table-chip interval">{row.intervalText}</span>
        ) : (
          "—"
        )}
      </div>
      <div className="vtable-cell table-datetime">{row.startText}</div>
      <div className="vtable-cell table-datetime">{row.endText}</div>
    </div>
  );
});

export default function DownloadHistoryPanel() {
  const notify = useNotify();
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [intervalFilter, setIntervalFilter] = useState<string>("all");
  const [tickerFilter, setTickerFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [uidFilter, setUidFilter] = useState("");

  const deferredTicker = useDeferredValue(tickerFilter);
  const deferredName = useDeferredValue(nameFilter);
  const deferredUid = useDeferredValue(uidFilter);
  const deferredInterval = useDeferredValue(intervalFilter);

  const [sortKey, setSortKey] = useState<SortKey>("last_start");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const reload = () => {
    setLoading(true);
    void (async () => {
      try {
        const rows = normalizeRows(await fetchLastDownloads("", 5000));
        startTransition(() => {
          setItems(rows);
          setLoading(false);
        });
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Ошибка загрузки");
        setLoading(false);
      }
    })();
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = normalizeRows(await fetchLastDownloads("", 5000));
        if (cancelled) return;
        startTransition(() => {
          setItems(rows);
          setLoading(false);
        });
      } catch (err) {
        if (cancelled) return;
        notify.error(err instanceof Error ? err.message : "Ошибка загрузки");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSort = (key: SortKey) => {
    startTransition(() => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      setSortKey(key);
      setSortDir(key === "last_start" || key === "last_end" ? "desc" : "asc");
    });
  };

  const resetFilters = () => {
    setIntervalFilter("all");
    setTickerFilter("");
    setNameFilter("");
    setUidFilter("");
  };

  const filteredIndices = useMemo(() => {
    const tickerQ = deferredTicker.trim().toLowerCase();
    const nameQ = deferredName.trim().toLowerCase();
    const uidQ = deferredUid.trim().toLowerCase();
    const intervalValue =
      deferredInterval === "all" ? null : Number(deferredInterval);
    const noTextFilter = !tickerQ && !nameQ && !uidQ;
    const noIntervalFilter = intervalValue == null;
    const defaultOrder =
      sortKey === "last_start" && sortDir === "desc" && noTextFilter && noIntervalFilter;

    if (defaultOrder) {
      // items already sorted by startMs DESC on load
      const all = new Array<number>(items.length);
      for (let i = 0; i < items.length; i += 1) all[i] = i;
      return all;
    }

    const indices: number[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const row = items[i];
      if (intervalValue != null && (row.interval ?? -1) !== intervalValue) continue;
      if (tickerQ && !row.tickerL.includes(tickerQ)) continue;
      if (nameQ && !row.nameL.includes(nameQ)) continue;
      if (uidQ && !row.uidL.includes(uidQ)) continue;
      indices.push(i);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    indices.sort((ia, ib) => compareRows(items[ia], items[ib], sortKey) * dir);
    return indices;
  }, [
    items,
    deferredInterval,
    deferredTicker,
    deferredName,
    deferredUid,
    sortKey,
    sortDir,
  ]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredIndices.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  useThrottledColumnLayout(
    parentRef,
    (el) => {
      const styles = getComputedStyle(el);
      const rem = Number.parseFloat(styles.fontSize) || 16;
      const available = el.clientWidth;
      const minUid = 12 * rem;
      const minName = 12 * rem;
      const minTicker = 8 * rem;
      const minInterval = 7 * rem;
      const minStart = 10 * rem;
      const minEnd = 10 * rem;
      const minTotal =
        minUid + minName + minTicker + minInterval + minStart + minEnd;
      const extra = Math.max(0, available - minTotal);
      const uid = Math.floor(minUid + extra * 0.16);
      const name = Math.floor(minName + extra * 0.28);
      const ticker = Math.floor(minTicker + extra * 0.14);
      const interval = Math.floor(minInterval + extra * 0.1);
      const start = Math.floor(minStart + extra * 0.16);
      const end = Math.max(
        minEnd,
        available - uid - name - ticker - interval - start,
      );
      el.style.setProperty("--h-col-uid", `${uid}px`);
      el.style.setProperty("--h-col-name", `${name}px`);
      el.style.setProperty("--h-col-ticker", `${ticker}px`);
      el.style.setProperty("--h-col-interval", `${interval}px`);
      el.style.setProperty("--h-col-start", `${start}px`);
      el.style.setProperty("--h-col-end", `${end}px`);
      el.style.setProperty("--vtable-width", `${available}px`);
    },
    [loading, filteredIndices.length],
  );

  return (
    <section className="panel-page history-panel">
      <header className="scheduler-header">
        <p className="eyebrow">История</p>
        <h1>История загрузок</h1>
        <p>
          Последние загрузки свечей по инструментам: данные из{" "}
          <code>TrB.hct_last_download</code>, при отсутствии — первая свеча из{" "}
          <code>TrB.sht</code>.
        </p>
      </header>

      <div className="filters-bar">
        <div className="filters-row filters-fields">
          <label className="filter-field">
            <span>Интервал</span>
            <select
              value={intervalFilter}
              onChange={(e) => setIntervalFilter(e.target.value)}
            >
              <option value="all">Все</option>
              {CANDLE_INTERVALS.map((iv) => (
                <option key={iv.value} value={String(iv.value)}>
                  {iv.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Ticker</span>
            <input
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              placeholder="Содержит…"
            />
          </label>

          <label className="filter-field">
            <span>Name</span>
            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Содержит…"
            />
          </label>

          <label className="filter-field">
            <span>UID</span>
            <input
              value={uidFilter}
              onChange={(e) => setUidFilter(e.target.value)}
              placeholder="Содержит…"
            />
          </label>
        </div>

        <div className="filters-row filters-actions">
          <button type="button" className="btn ghost" onClick={resetFilters}>
            Сбросить
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={loading}
            onClick={reload}
          >
            {loading ? "Загрузка…" : "Обновить"}
          </button>
          <span className="filters-meta">
            <span className="hint">
              {filteredIndices.length} из {items.length}
            </span>
          </span>
        </div>
      </div>

      {loading && items.length === 0 ? <p className="hint">Загрузка…</p> : null}
      {!loading && items.length > 0 && filteredIndices.length === 0 ? (
        <p className="hint">Нет строк по текущим фильтрам.</p>
      ) : null}

      <div
        ref={parentRef}
        className="table-scroll table-scroll-fill vtable-scroll history-vtable"
      >
        {items.length > 0 ? (
          <div className="vtable">
            <div className="vtable-head">
              <SortHead
                label="uid"
                column="uid"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="col-uid"
              />
              <SortHead
                label="name"
                column="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="col-name"
              />
              <SortHead
                label="ticker"
                column="ticker"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="col-ticker"
              />
              <SortHead
                label="interval"
                column="interval"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHead
                label="последняя загрузка"
                column="last_start"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHead
                label="конец окна"
                column="last_end"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
            </div>

            <div
              className="vtable-body"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = items[filteredIndices[virtualRow.index]];
                return (
                  <div
                    key={`${row.uid}:${row.interval ?? "none"}:${row.startMs}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <HistoryRowView row={row} alt={virtualRow.index % 2 === 1} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
