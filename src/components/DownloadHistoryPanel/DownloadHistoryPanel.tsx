import { useNotify } from "../../notifications";
import {
  memo,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CANDLE_INTERVALS } from "../../api/scheduler";
import {
  formatDateTime,
  intervalLabel,
  listLastDownloadsPage,
} from "../../api/historicCandle";
import { useThrottledColumnLayout } from "../../hooks/useThrottledColumnLayout";
import { useIncrementalList } from "../../hooks/useIncrementalList";
import { SortHead, SkeletonRow, type SortDir } from "../common/TableParts";
import "../../styles/tables.css";
import "../SchedulerPanel/SchedulerPanel.css";

type SortKey = "uid" | "name" | "ticker" | "interval" | "last_start" | "last_end";

type HistoryRow = {
  uid: string;
  name: string;
  ticker: string;
  interval: number | null;
  intervalText: string;
  startMs: number;
  startText: string;
  endText: string;
};

const ROW_HEIGHT = 40;
const COLUMN_COUNT = 6;

function toMs(value?: string): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function toHistoryRow(row: {
  uid: string;
  name: string;
  ticker: string;
  interval: number | null;
  last_start: string;
  last_end: string;
  has_download: number | boolean;
}): HistoryRow {
  const fromDownload = Boolean(row.has_download);
  return {
    uid: row.uid,
    name: row.name || "",
    ticker: row.ticker || "",
    interval: row.interval,
    intervalText:
      row.interval != null && row.interval > 0 ? intervalLabel(row.interval) : "—",
    startMs: toMs(row.last_start),
    startText: formatDateTime(row.last_start),
    endText: fromDownload ? formatDateTime(row.last_end) : "—",
  };
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

  const fieldFilters = useMemo(
    () => ({ ticker: deferredTicker, name: deferredName, uid: deferredUid }),
    [deferredTicker, deferredName, deferredUid],
  );
  const extra = useMemo(
    () => ({ intervalFilter: deferredInterval === "all" ? 0 : Number(deferredInterval) }),
    [deferredInterval],
  );

  const list = useIncrementalList<HistoryRow>({
    fetchPage: async (p) => {
      try {
        const res = await listLastDownloadsPage({
          offset: p.offset,
          limit: p.limit,
          sortBy: p.sortBy,
          sortDesc: p.sortDesc,
          fieldFilters: p.fieldFilters,
          intervalFilter: Number(p.extra?.intervalFilter) || 0,
        });
        return { rows: res.items.map(toHistoryRow), total: res.total };
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Ошибка загрузки");
        throw err;
      }
    },
    sortBy: sortKey,
    sortDesc: sortDir === "desc",
    fieldFilters,
    extra,
  });

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "last_start" || key === "last_end" ? "desc" : "asc");
  };

  const resetFilters = () => {
    setIntervalFilter("all");
    setTickerFilter("");
    setNameFilter("");
    setUidFilter("");
  };

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: list.total,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const firstIndex = virtualItems[0]?.index ?? 0;
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;
  const { setVisibleRange } = list;

  // Первичная оценка видимого окна до появления виртуальных строк —
  // чтобы размер страницы сразу считался от реальной высоты таблицы.
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (el) {
      setVisibleRange(0, Math.max(10, Math.ceil(el.clientHeight / ROW_HEIGHT)));
    }
  }, [setVisibleRange]);

  useEffect(() => {
    if (virtualItems.length > 0) setVisibleRange(firstIndex, lastIndex);
  }, [firstIndex, lastIndex, virtualItems.length, setVisibleRange]);

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
      const minTotal = minUid + minName + minTicker + minInterval + minStart + minEnd;
      const extraPx = Math.max(0, available - minTotal);
      const uid = Math.floor(minUid + extraPx * 0.16);
      const name = Math.floor(minName + extraPx * 0.28);
      const ticker = Math.floor(minTicker + extraPx * 0.14);
      const interval = Math.floor(minInterval + extraPx * 0.1);
      const start = Math.floor(minStart + extraPx * 0.16);
      const end = Math.max(minEnd, available - uid - name - ticker - interval - start);
      el.style.setProperty("--h-col-uid", `${uid}px`);
      el.style.setProperty("--h-col-name", `${name}px`);
      el.style.setProperty("--h-col-ticker", `${ticker}px`);
      el.style.setProperty("--h-col-interval", `${interval}px`);
      el.style.setProperty("--h-col-start", `${start}px`);
      el.style.setProperty("--h-col-end", `${end}px`);
      el.style.setProperty("--vtable-width", `${available}px`);
    },
    [list.total],
  );

  const empty = list.total === 0 && !list.loading;

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
            disabled={list.loading}
            onClick={list.reload}
          >
            {list.loading ? "Загрузка…" : "Обновить"}
          </button>
          <span className="filters-meta">
            <span className="hint">{list.total} строк</span>
          </span>
        </div>
      </div>

      {list.error ? <p className="error">{list.error}</p> : null}
      {empty ? <p className="hint">Нет строк по текущим фильтрам.</p> : null}

      <div
        ref={parentRef}
        className="table-scroll table-scroll-fill vtable-scroll history-vtable"
      >
        <div className="vtable">
          <div className="vtable-head">
            <SortHead label="uid" column="uid" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="col-uid" />
            <SortHead label="name" column="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="col-name" />
            <SortHead label="ticker" column="ticker" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="col-ticker" />
            <SortHead label="interval" column="interval" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHead label="последняя загрузка" column="last_start" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHead label="конец окна" column="last_end" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>

          <div className="vtable-body" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualItems.map((virtualRow) => {
              const row = list.rowAt(virtualRow.index);
              const alt = virtualRow.index % 2 === 1;
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row ? (
                    <HistoryRowView row={row} alt={alt} />
                  ) : (
                    <SkeletonRow columns={COLUMN_COUNT} alt={alt} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
