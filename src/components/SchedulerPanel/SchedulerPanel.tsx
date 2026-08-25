import {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  INTERVAL_1DAY,
  INTERVAL_1MIN,
  SCHEDULER_INTERVALS,
  fetchInstruments,
  fetchTargets,
  formatDate,
  groupTargets,
  hasCandleDate,
  syncTargets,
} from "../../api/scheduler";
import { useThrottledColumnLayout } from "../../hooks/useThrottledColumnLayout";
import "../../styles/tables.css";
import "./SchedulerPanel.css";
import { useNotify } from "../../notifications";

type CatalogItem = {
  uid: string;
  name: string;
  ticker: string;
  currency: string;
  uidL: string;
  nameL: string;
  tickerL: string;
  currencyL: string;
  has1min: boolean;
  has1day: boolean;
  first1minText: string;
  first1dayText: string;
  first1minMs: number;
  first1dayMs: number;
};

type SortKey = "uid" | "name" | "ticker" | "currency" | "minDate" | "dayDate" | `iv:${number}`;
type SortDir = "asc" | "desc";
type PresenceFilter = "all" | "with" | "without";

const ROW_HEIGHT = 40;

const INTERVAL_BIT: Record<number, number> = Object.fromEntries(
  SCHEDULER_INTERVALS.map((iv, index) => [iv.value, 1 << index]),
);

function maskHas(mask: number, interval: number): boolean {
  return (mask & (INTERVAL_BIT[interval] ?? 0)) !== 0;
}

function toggleMaskBit(mask: number, interval: number, enabled: boolean): number {
  const bit = INTERVAL_BIT[interval] ?? 0;
  return enabled ? mask | bit : mask & ~bit;
}

function intervalsFromMask(mask: number): number[] {
  if (!mask) return [];
  return SCHEDULER_INTERVALS.filter((iv) => maskHas(mask, iv.value)).map((iv) => iv.value);
}

function countActive(masks: Int32Array): number {
  let n = 0;
  for (let i = 0; i < masks.length; i += 1) {
    if (masks[i] !== 0) n += 1;
  }
  return n;
}

function intervalAvailable(item: CatalogItem, interval: number): boolean {
  if (interval === INTERVAL_1MIN) return item.has1min;
  if (interval === INTERVAL_1DAY) return item.has1day;
  return false;
}

function buildMasks(
  catalog: CatalogItem[],
  targets: ReturnType<typeof groupTargets>,
): Int32Array {
  const byUID = new Map(targets.map((row) => [row.uid, row]));
  const masks = new Int32Array(catalog.length);
  for (let i = 0; i < catalog.length; i += 1) {
    const row = byUID.get(catalog[i].uid);
    if (!row) continue;
    let mask = 0;
    for (const iv of SCHEDULER_INTERVALS) {
      if (row.intervals[iv.value]) {
        mask |= INTERVAL_BIT[iv.value];
      }
    }
    masks[i] = mask;
  }
  return masks;
}

function SortHead({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = "",
  title,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  title?: string;
}) {
  const active = sortKey === column;
  return (
    <div className={`vtable-cell sortable ${className}`.trim()} title={title}>
      <button type="button" className="sort-btn" onClick={() => onSort(column)}>
        <span>{label}</span>
        <span className={`sort-indicator ${active ? "is-active" : ""}`} aria-hidden="true">
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </div>
  );
}

type RowProps = {
  item: CatalogItem;
  mask: number;
  selected: boolean;
  saving: boolean;
  alt: boolean;
  onSelect: (uid: string, additive: boolean) => void;
  onToggle: (uid: string, interval: number, enabled: boolean) => void;
};

const SchedulerRow = memo(function SchedulerRow({
  item,
  mask,
  selected,
  saving,
  alt,
  onSelect,
  onToggle,
}: RowProps) {
  return (
    <div
      className={`vtable-row is-clickable ${alt ? "is-alt" : ""} ${selected ? "is-selected" : ""} ${
        mask ? "has-targets" : ""
      }`}
      onClick={(e) => onSelect(item.uid, e.metaKey || e.ctrlKey)}
    >
      <div className="vtable-cell sticky-col col-uid mono" title={item.uid}>
        {item.uid}
      </div>
      <div className="vtable-cell sticky-col col-name" title={item.name}>
        {item.name || "—"}
      </div>
      <div className="vtable-cell sticky-col col-ticker" title={item.ticker}>
        {item.ticker ? <span className="table-chip ticker">{item.ticker}</span> : "—"}
      </div>
      <div className="vtable-cell col-currency" title={item.currency || undefined}>
        {item.currency || "—"}
      </div>
      <div className="vtable-cell col-date" title={item.has1min ? item.first1minText : undefined}>
        {item.has1min ? item.first1minText : ""}
      </div>
      <IntervalCheck
        label={`${item.ticker || item.name} 1 мин`}
        interval={INTERVAL_1MIN}
        available={item.has1min}
        checked={maskHas(mask, INTERVAL_1MIN)}
        saving={saving}
        onToggle={(interval, enabled) => onToggle(item.uid, interval, enabled)}
      />
      <div className="vtable-cell col-date" title={item.has1day ? item.first1dayText : undefined}>
        {item.has1day ? item.first1dayText : ""}
      </div>
      <IntervalCheck
        label={`${item.ticker || item.name} 1 день`}
        interval={INTERVAL_1DAY}
        available={item.has1day}
        checked={maskHas(mask, INTERVAL_1DAY)}
        saving={saving}
        onToggle={(interval, enabled) => onToggle(item.uid, interval, enabled)}
      />
    </div>
  );
});

function IntervalCheck({
  label,
  interval,
  available,
  checked,
  saving,
  onToggle,
}: {
  label: string;
  interval: number;
  available: boolean;
  checked: boolean;
  saving: boolean;
  onToggle: (interval: number, enabled: boolean) => void;
}) {
  const missing = !available;
  return (
    <div
      className={`vtable-cell col-interval ${missing ? "is-missing-date" : ""}`}
      title={missing ? "Нет первой свечи — интервал недоступен" : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={saving || (missing && !checked)}
        onChange={(e) => onToggle(interval, e.target.checked)}
        aria-label={label}
      />
    </div>
  );
}

export default function SchedulerPanel() {
  const notify = useNotify();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [baselineMasks, setBaselineMasks] = useState(() => new Int32Array(0));
  /** Sparse edits on top of baseline — avoids copying 10k ints on every checkbox click. */
  const [overrides, setOverrides] = useState<Map<number, number>>(() => new Map());
  const [clearedAll, setClearedAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCount, setActiveCount] = useState(0);

  const [tickerFilter, setTickerFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [uidFilter, setUidFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState<PresenceFilter>("all");
  const [minDateFilter, setMinDateFilter] = useState<PresenceFilter>("all");
  const [dayDateFilter, setDayDateFilter] = useState<PresenceFilter>("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");

  const deferredTicker = useDeferredValue(tickerFilter);
  const deferredName = useDeferredValue(nameFilter);
  const deferredUid = useDeferredValue(uidFilter);

  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const baselineRef = useRef(baselineMasks);
  baselineRef.current = baselineMasks;
  const clearedRef = useRef(clearedAll);
  clearedRef.current = clearedAll;
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const getMask = useCallback((index: number): number => {
    const over = overridesRef.current;
    if (over.has(index)) return over.get(index)!;
    if (clearedRef.current) return 0;
    return baselineRef.current[index] ?? 0;
  }, []);

  const indexByUID = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < catalog.length; i += 1) {
      map.set(catalog[i].uid, i);
    }
    return map;
  }, [catalog]);

  const dirty = clearedAll || overrides.size > 0;

  const reload = async () => {
    setLoading(true);
    try {
      const [instruments, targets] = await Promise.all([
        fetchInstruments("", 10000, { lite: false }),
        fetchTargets(),
      ]);
      // API already returns ticker order — skip expensive localeCompare sort.
      const nextCatalog: CatalogItem[] = instruments.map((item) => {
        const name = item.name || item.uid;
        const ticker = item.ticker || "";
        const currency = item.currency || "";
        const has1min = hasCandleDate(item.first_1min_candle_date);
        const has1day = hasCandleDate(item.first_1day_candle_date);
        return {
          uid: item.uid,
          name,
          ticker,
          currency,
          uidL: item.uid.toLowerCase(),
          nameL: name.toLowerCase(),
          tickerL: ticker.toLowerCase(),
          currencyL: currency.toLowerCase(),
          has1min,
          has1day,
          first1minText: has1min ? formatDate(item.first_1min_candle_date) : "",
          first1dayText: has1day ? formatDate(item.first_1day_candle_date) : "",
          first1minMs: has1min ? Date.parse(item.first_1min_candle_date as string) : 0,
          first1dayMs: has1day ? Date.parse(item.first_1day_candle_date as string) : 0,
        };
      });
      const nextMasks = buildMasks(nextCatalog, groupTargets(targets));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      startTransition(() => {
        setCatalog(nextCatalog);
        setBaselineMasks(nextMasks);
        setOverrides(new Map());
        setClearedAll(false);
        setActiveCount(countActive(nextMasks));
        setSelected(new Set());
        setLoading(false);
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка загрузки");
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const onToggle = useCallback(
    (uid: string, interval: number, enabled: boolean) => {
      const index = indexByUID.get(uid);
      if (index == null) return;

      const item = catalogRef.current[index];
      if (item && enabled && !intervalAvailable(item, interval)) return;

      const before = getMask(index);
      const after = toggleMaskBit(before, interval, enabled);
      if (before === after) return;

      const baseline = baselineRef.current[index] ?? 0;
      setOverrides((prev) => {
        const next = new Map(prev);
        if (!clearedRef.current && after === baseline) {
          next.delete(index);
        } else {
          next.set(index, after);
        }
        return next;
      });

      const wasActive = before !== 0;
      const isActive = after !== 0;
      if (wasActive !== isActive) {
        setActiveCount((n) => n + (isActive ? 1 : -1));
      }
    },
    [getMask, indexByUID],
  );

  const onSelect = useCallback((uid: string, additive: boolean) => {
    setSelected((prev) => {
      if (!additive) {
        if (prev.size === 1 && prev.has(uid)) return new Set();
        return new Set([uid]);
      }
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const clearSelectedIntervals = () => {
    if (selected.size === 0) return;
    let removed = 0;
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const uid of selected) {
        const index = indexByUID.get(uid);
        if (index == null) continue;
        const before = next.has(index)
          ? next.get(index)!
          : clearedAll
            ? 0
            : (baselineMasks[index] ?? 0);
        if (before === 0) continue;
        removed += 1;
        if (!clearedAll && baselineMasks[index] === 0) next.delete(index);
        else next.set(index, 0);
      }
      return next;
    });
    if (removed) setActiveCount((n) => n - removed);
  };

  const clearAllIntervals = () => {
    setClearedAll(true);
    setOverrides(new Map());
    setActiveCount(0);
    setSelected(new Set());
  };

  const onReset = () => {
    setOverrides(new Map());
    setClearedAll(false);
    setActiveCount(countActive(baselineMasks));
    setSelected(new Set());
  };

  const onAccept = async () => {
    setSaving(true);
    try {
      const payload: { uid: string; intervals: number[] }[] = [];
      for (let i = 0; i < catalog.length; i += 1) {
        const mask = getMask(i);
        if (mask === 0) continue;
        payload.push({
          uid: catalog[i].uid,
          intervals: intervalsFromMask(mask),
        });
      }
      await syncTargets(payload, { allowEmpty: payload.length === 0 });
      await reload();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const onSort = (key: SortKey) => {
    startTransition(() => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      setSortKey(key);
      setSortDir("asc");
    });
  };

  const resetFilters = () => {
    setTickerFilter("");
    setNameFilter("");
    setUidFilter("");
    setTargetFilter("all");
    setMinDateFilter("all");
    setDayDateFilter("all");
    setCurrencyFilter("all");
  };

  const currencyOptions = useMemo(() => {
    const byLower = new Map<string, string>();
    let empty = false;
    for (const item of catalog) {
      if (!item.currency) {
        empty = true;
        continue;
      }
      if (!byLower.has(item.currencyL)) byLower.set(item.currencyL, item.currency);
    }
    return {
      values: Array.from(byLower.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru")),
      empty,
    };
  }, [catalog]);

  const maskSensitive =
    targetFilter !== "all" || sortKey.startsWith("iv:");

  const filteredIndices = useMemo(() => {
    const tickerQ = deferredTicker.trim().toLowerCase();
    const nameQ = deferredName.trim().toLowerCase();
    const uidQ = deferredUid.trim().toLowerCase();
    const indices: number[] = [];

    for (let i = 0; i < catalog.length; i += 1) {
      const item = catalog[i];
      if (maskSensitive) {
        const mask = overrides.has(i)
          ? overrides.get(i)!
          : clearedAll
            ? 0
            : (baselineMasks[i] ?? 0);
        if (targetFilter === "with" && mask === 0) continue;
        if (targetFilter === "without" && mask !== 0) continue;
      }
      if (minDateFilter === "with" && !item.has1min) continue;
      if (minDateFilter === "without" && item.has1min) continue;
      if (dayDateFilter === "with" && !item.has1day) continue;
      if (dayDateFilter === "without" && item.has1day) continue;
      if (currencyFilter !== "all") {
        if (currencyFilter === "__empty__") {
          if (item.currency) continue;
        } else if (item.currencyL !== currencyFilter) {
          continue;
        }
      }
      if (tickerQ && !item.tickerL.includes(tickerQ)) continue;
      if (nameQ && !item.nameL.includes(nameQ)) continue;
      if (uidQ && !item.uidL.includes(uidQ)) continue;
      indices.push(i);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    indices.sort((ia, ib) => {
      const a = catalog[ia];
      const b = catalog[ib];
      let cmp = 0;
      if (sortKey.startsWith("iv:")) {
        const iv = Number(sortKey.slice(3));
        const ma = overrides.has(ia)
          ? overrides.get(ia)!
          : clearedAll
            ? 0
            : (baselineMasks[ia] ?? 0);
        const mb = overrides.has(ib)
          ? overrides.get(ib)!
          : clearedAll
            ? 0
            : (baselineMasks[ib] ?? 0);
        cmp = Number(maskHas(ma, iv)) - Number(maskHas(mb, iv));
      } else if (sortKey === "uid") {
        cmp = a.uidL.localeCompare(b.uidL, "ru");
      } else if (sortKey === "name") {
        cmp = a.nameL.localeCompare(b.nameL, "ru");
      } else if (sortKey === "currency") {
        cmp = a.currencyL.localeCompare(b.currencyL, "ru");
      } else if (sortKey === "minDate") {
        cmp = a.first1minMs - b.first1minMs;
      } else if (sortKey === "dayDate") {
        cmp = a.first1dayMs - b.first1dayMs;
      } else {
        cmp = a.tickerL.localeCompare(b.tickerL, "ru");
      }
      return cmp * dir;
    });

    return indices;
  }, [
    catalog,
    deferredTicker,
    deferredName,
    deferredUid,
    targetFilter,
    minDateFilter,
    dayDateFilter,
    currencyFilter,
    sortKey,
    sortDir,
    maskSensitive,
    maskSensitive ? overrides : null,
    maskSensitive ? clearedAll : null,
    maskSensitive ? baselineMasks : null,
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
      const minName = 14 * rem;
      const minTicker = 9 * rem;
      const minCurrency = 5 * rem;
      const minDate = 8 * rem;
      const minIv = 3.4 * rem;
      const minTotal = minUid + minName + minTicker + minCurrency + minDate * 2 + minIv * 2;
      const extra = Math.max(0, available - minTotal);
      const uid = Math.floor(minUid + extra * 0.2);
      const name = Math.floor(minName + extra * 0.36);
      const ticker = Math.floor(minTicker + extra * 0.14);
      const currency = Math.floor(minCurrency + extra * 0.06);
      const date = Math.floor(minDate + extra * 0.08);
      const used = uid + name + ticker + currency + date * 2;
      const iv = Math.max(minIv, (available - used) / 2);
      el.style.setProperty("--col-uid", `${uid}px`);
      el.style.setProperty("--col-name", `${name}px`);
      el.style.setProperty("--col-ticker", `${ticker}px`);
      el.style.setProperty("--col-currency", `${currency}px`);
      el.style.setProperty("--col-date", `${date}px`);
      el.style.setProperty("--col-iv", `${iv}px`);
      el.style.setProperty("--vtable-width", `${available}px`);
    },
    [loading, filteredIndices.length],
  );

  return (
    <section className="panel-page scheduler-panel">
      <header className="scheduler-header">
        <p className="eyebrow">Планировщик свечей</p>
        <h1>Цели догрузки свечей</h1>
        <p>
          Отметьте минутный и дневной интервалы у инструментов, затем нажмите «Принять»,
          чтобы сохранить в PostgreSQL. Нулевая дата первой свечи помечает интервал как
          недоступный. Клик по строке выделяет её; Ctrl/⌘ — множественный выбор.
        </p>
      </header>

      <div className="filters-bar">
        <div className="filters-row filters-fields">
          <label className="filter-field">
            <span>Цели</span>
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value as PresenceFilter)}
            >
              <option value="all">Все</option>
              <option value="with">С интервалами</option>
              <option value="without">Без интервалов</option>
            </select>
          </label>

          <label className="filter-field" title="first_1min_candle_date">
            <span>1м дата</span>
            <select
              value={minDateFilter}
              onChange={(e) => setMinDateFilter(e.target.value as PresenceFilter)}
            >
              <option value="all">Все</option>
              <option value="with">Есть</option>
              <option value="without">Нет</option>
            </select>
          </label>

          <label className="filter-field" title="first_1day_candle_date">
            <span>1д дата</span>
            <select
              value={dayDateFilter}
              onChange={(e) => setDayDateFilter(e.target.value as PresenceFilter)}
            >
              <option value="all">Все</option>
              <option value="with">Есть</option>
              <option value="without">Нет</option>
            </select>
          </label>

          <label className="filter-field">
            <span>Валюта</span>
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
            >
              <option value="all">Все</option>
              {currencyOptions.values.map(([codeL, code]) => (
                <option key={codeL} value={codeL}>
                  {code.toUpperCase()}
                </option>
              ))}
              {currencyOptions.empty ? (
                <option value="__empty__">без валюты</option>
              ) : null}
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
            Сбросить фильтры
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={selected.size === 0 || saving}
            onClick={clearSelectedIntervals}
          >
            Очистить выбранные ({selected.size})
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={activeCount === 0 || saving}
            onClick={clearAllIntervals}
          >
            Очистить все
          </button>
          <span className="filters-sep" aria-hidden="true" />
          <button
            type="button"
            className="btn ghost"
            disabled={!dirty || saving}
            onClick={onReset}
          >
            Отменить
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!dirty || saving}
            onClick={() => void onAccept()}
          >
            {saving ? "Сохранение…" : "Принять"}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={dirty || saving || loading}
            onClick={() => void reload()}
          >
            Обновить
          </button>
          <span className="filters-meta">
            {dirty ? <span className="dirty-badge">есть несохранённые изменения</span> : null}
            <span className="hint">
              {filteredIndices.length} строк · целей {activeCount}
            </span>
          </span>
        </div>
      </div>

      {loading ? <p className="hint">Загрузка…</p> : null}
      {!loading && catalog.length > 0 && filteredIndices.length === 0 ? (
        <p className="hint">Нет строк по текущим фильтрам.</p>
      ) : null}

      <div ref={parentRef} className="table-scroll table-scroll-fill vtable-scroll">
        {!loading && catalog.length > 0 ? (
          <div className="vtable">
            <div className="vtable-head">
              <SortHead
                label="uid"
                column="uid"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="sticky-col col-uid"
              />
              <SortHead
                label="name"
                column="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="sticky-col col-name"
              />
              <SortHead
                label="ticker"
                column="ticker"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="sticky-col col-ticker"
              />
              <SortHead
                label="валюта"
                column="currency"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="col-currency"
                title="currency"
              />
              <SortHead
                label="1м дата"
                column="minDate"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="col-date"
                title="first_1min_candle_date"
              />
              <SortHead
                label="1м"
                column={`iv:${INTERVAL_1MIN}`}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="col-interval"
                title="1 мин"
              />
              <SortHead
                label="1д дата"
                column="dayDate"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="col-date"
                title="first_1day_candle_date"
              />
              <SortHead
                label="1д"
                column={`iv:${INTERVAL_1DAY}`}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="col-interval"
                title="1 день"
              />
            </div>

            <div
              className="vtable-body"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const catalogIndex = filteredIndices[virtualRow.index];
                const item = catalog[catalogIndex];
                return (
                  <div
                    key={item.uid}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <SchedulerRow
                      item={item}
                      mask={getMask(catalogIndex)}
                      selected={selected.has(item.uid)}
                      saving={saving}
                      alt={virtualRow.index % 2 === 1}
                      onSelect={onSelect}
                      onToggle={onToggle}
                    />
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
