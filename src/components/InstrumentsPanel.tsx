import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { listInstruments, listInstrumentVersions, type Instrument } from "../api/data";
import { syncInstruments } from "../api/test";
import { formatDate, formatDateTimeMs } from "../api/scheduler";
import { useThrottledColumnLayout } from "../hooks/useThrottledColumnLayout";
import { useNotify } from "../notifications";
import "../styles/tables.css";
import "./SchedulerPanel.css";
import "./InstrumentsPanel.css";

type SortKey =
  | "ticker"
  | "name"
  | "figi"
  | "uid"
  | "currency"
  | "exchange"
  | "trading_status"
  | "lot"
  | "version"
  | "version_count";

type SortDir = "asc" | "desc";

type Column = {
  key: SortKey;
  label: string;
  className: string;
};

const COLUMNS: Column[] = [
  { key: "ticker", label: "ticker", className: "col-ticker" },
  { key: "name", label: "name", className: "col-name" },
  { key: "figi", label: "figi", className: "col-figi" },
  { key: "uid", label: "uid", className: "col-uid" },
  { key: "currency", label: "валюта", className: "col-currency" },
  { key: "exchange", label: "биржа", className: "col-exchange" },
  { key: "trading_status", label: "статус торгов", className: "col-trading-status" },
  { key: "lot", label: "лот", className: "col-lot" },
  { key: "version", label: "версия", className: "col-version" },
  { key: "version_count", label: "версий", className: "col-version-count" },
];

const EMPTY_FILTERS: Record<SortKey, string> = {
  ticker: "",
  name: "",
  figi: "",
  uid: "",
  currency: "",
  exchange: "",
  trading_status: "",
  lot: "",
  version: "",
  version_count: "",
};

const ROW_HEIGHT = 40;

type TableRow = {
  item: Instrument;
  tickerL: string;
  nameL: string;
  figiL: string;
  uidL: string;
  currencyL: string;
  exchangeL: string;
  tradingStatus: number;
  tradingStatusText: string;
  lotText: string;
  versionMs: number;
  versionText: string;
  versionCount: number;
  versionCountText: string;
};

const TRADING_STATUS: Record<number, string> = {
  0: "не определён",
  1: "недоступен",
  2: "открытие",
  3: "закрытие",
  4: "перерыв",
  5: "торги",
  6: "аукцион закрытия",
  7: "dark pool",
  8: "дискретный аукцион",
  9: "аукцион открытия",
  10: "по цене закрытия",
  11: "сессия назначена",
  12: "сессия закрыта",
  13: "сессия открыта",
};

const SHARE_TYPE: Record<number, string> = {
  0: "не указан",
  1: "обыкновенная",
  2: "привилегированная",
  3: "ADR",
  4: "GDR",
};

function toMs(value?: string): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeRows(items: Instrument[]): TableRow[] {
  return items.map((item) => {
    const versionCount = item.version_count ?? 1;
    return {
      item,
      tickerL: (item.ticker || "").toLowerCase(),
      nameL: (item.name || "").toLowerCase(),
      figiL: (item.figi || "").toLowerCase(),
      uidL: (item.uid || "").toLowerCase(),
      currencyL: (item.currency || "").toLowerCase(),
      exchangeL: (item.exchange || "").toLowerCase(),
      tradingStatus: item.trading_status,
      tradingStatusText: (TRADING_STATUS[item.trading_status] ?? String(item.trading_status)).toLowerCase(),
      lotText: String(item.lot ?? ""),
      versionMs: toMs(item.version),
      versionText: formatDateTimeMs(item.version),
      versionCount,
      versionCountText: String(versionCount),
    };
  });
}

function compareRows(a: TableRow, b: TableRow, key: SortKey): number {
  switch (key) {
    case "ticker":
      return a.tickerL.localeCompare(b.tickerL, "ru");
    case "name":
      return a.nameL.localeCompare(b.nameL, "ru");
    case "figi":
      return a.figiL.localeCompare(b.figiL, "ru");
    case "uid":
      return a.uidL.localeCompare(b.uidL, "ru");
    case "currency":
      return a.currencyL.localeCompare(b.currencyL, "ru");
    case "exchange":
      return a.exchangeL.localeCompare(b.exchangeL, "ru");
    case "trading_status":
      return a.tradingStatus - b.tradingStatus;
    case "lot":
      return (a.item.lot ?? 0) - (b.item.lot ?? 0);
    case "version":
      return a.versionMs - b.versionMs;
    case "version_count":
      return a.versionCount - b.versionCount;
    default:
      return 0;
  }
}

function cellText(row: TableRow, key: SortKey): string {
  switch (key) {
    case "ticker":
      return row.tickerL;
    case "name":
      return row.nameL;
    case "figi":
      return row.figiL;
    case "uid":
      return row.uidL;
    case "currency":
      return row.currencyL;
    case "exchange":
      return row.exchangeL;
    case "trading_status":
      return row.tradingStatusText;
    case "lot":
      return row.lotText;
    case "version":
      return row.versionText.toLowerCase();
    case "version_count":
      return row.versionCountText;
    default:
      return "";
  }
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 9 });
}

function fmtBool(v: boolean): string {
  return v ? "да" : "нет";
}

function labeled(code: number, map: Record<number, string>): string {
  const name = map[code];
  return name ? `${name} (${code})` : String(code);
}

function ColumnHead({
  column,
  sortKey,
  sortDir,
  filter,
  onSort,
  onFilter,
}: {
  column: Column;
  sortKey: SortKey;
  sortDir: SortDir;
  filter: string;
  onSort: (key: SortKey) => void;
  onFilter: (key: SortKey, value: string) => void;
}) {
  const active = sortKey === column.key;
  return (
    <div className={`vtable-cell sortable ${column.className}`}>
      <button type="button" className="sort-btn" onClick={() => onSort(column.key)}>
        <span>{column.label}</span>
        <span className={`sort-indicator ${active ? "is-active" : ""}`} aria-hidden="true">
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
      <input
        className="col-filter"
        value={filter}
        onChange={(e) => onFilter(column.key, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="фильтр"
        aria-label={`Фильтр ${column.label}`}
      />
    </div>
  );
}

const InstrumentRowView = memo(function InstrumentRowView({
  row,
  alt,
  selected,
  onOpen,
}: {
  row: TableRow;
  alt: boolean;
  selected: boolean;
  onOpen: (uid: string) => void;
}) {
  const item = row.item;
  return (
    <div
      className={`vtable-row is-clickable ${alt ? "is-alt" : ""} ${selected ? "is-selected" : ""}`}
      onClick={() => onOpen(item.uid)}
    >
      <div className="vtable-cell col-ticker" title={item.ticker}>
        {item.ticker ? <span className="table-chip ticker">{item.ticker}</span> : "—"}
      </div>
      <div className="vtable-cell col-name" title={item.name}>
        {item.name || "—"}
      </div>
      <div className="vtable-cell col-figi mono" title={item.figi}>
        {item.figi || "—"}
      </div>
      <div className="vtable-cell col-uid mono" title={item.uid}>
        {item.uid}
      </div>
      <div className="vtable-cell col-currency">{item.currency || "—"}</div>
      <div className="vtable-cell col-exchange" title={item.exchange}>
        {item.exchange || "—"}
      </div>
      <div className="vtable-cell col-trading-status" title={TRADING_STATUS[item.trading_status] ?? String(item.trading_status)}>
        {TRADING_STATUS[item.trading_status] ?? String(item.trading_status)}
      </div>
      <div className="vtable-cell col-lot">{item.lot || "—"}</div>
      <div className="vtable-cell col-version table-datetime">{row.versionText}</div>
      <div className="vtable-cell col-version-count">{row.versionCountText}</div>
    </div>
  );
});

function displayFieldValue(value: string): string {
  return value || "—";
}

function versionRowKey(row: Instrument): string {
  return `${row.version ?? ""}:${row.figi}`;
}

function DetailField({ label, value }: { label: string; value: string }) {
  const shown = displayFieldValue(value);
  return (
    <div className="instrument-field">
      <dt>{label}</dt>
      <dd title={shown}>{shown}</dd>
    </div>
  );
}

function instrumentFields(item: Instrument): { label: string; value: string }[] {
  return [
    { label: "ticker", value: item.ticker },
    { label: "name", value: item.name },
    { label: "uid", value: item.uid },
    { label: "figi", value: item.figi },
    { label: "isin", value: item.isin },
    { label: "версия", value: formatDateTimeMs(item.version) },
    { label: "class_code", value: item.class_code },
    { label: "валюта", value: item.currency },
    { label: "биржа", value: item.exchange },
    { label: "сектор", value: item.sector },
    { label: "лот", value: fmtNum(item.lot) },
    { label: "статус торгов", value: labeled(item.trading_status, TRADING_STATUS) },
    { label: "тип акции", value: labeled(item.share_type, SHARE_TYPE) },
    { label: "страна риска", value: item.country_of_risk_name || item.country_of_risk },
    { label: "код страны", value: item.country_of_risk },
    { label: "IPO", value: formatDate(item.ipo_date) },
    { label: "размер выпуска", value: fmtNum(item.issue_size) },
    { label: "план выпуска", value: fmtNum(item.issue_size_plan) },
    {
      label: "номинал",
      value: `${fmtNum(item.nominal_units + item.nominal_nano / 1e9)} ${item.nominal_currency}`.trim(),
    },
    { label: "шаг цены", value: fmtNum(item.min_price_increment) },
    { label: "klong", value: fmtNum(item.klong) },
    { label: "kshort", value: fmtNum(item.kshort) },
    { label: "dlong", value: fmtNum(item.dlong) },
    { label: "dshort", value: fmtNum(item.dshort) },
    { label: "dlong_min", value: fmtNum(item.dlong_min) },
    { label: "dshort_min", value: fmtNum(item.dshort_min) },
    { label: "dlong_client", value: fmtNum(item.dlong_client) },
    { label: "dshort_client", value: fmtNum(item.dshort_client) },
    { label: "real_exchange", value: String(item.real_exchange) },
    { label: "instrument_exchange", value: String(item.instrument_exchange) },
    { label: "position_uid", value: item.position_uid },
    { label: "asset_uid", value: item.asset_uid },
    { label: "первая 1м свеча", value: formatDate(item.first_1min_candle_date) },
    { label: "первая 1д свеча", value: formatDate(item.first_1day_candle_date) },
    { label: "short", value: fmtBool(item.short_enabled_flag) },
    { label: "API trade", value: fmtBool(item.api_trade_available_flag) },
    { label: "покупка", value: fmtBool(item.buy_available_flag) },
    { label: "продажа", value: fmtBool(item.sell_available_flag) },
    { label: "ликвидность", value: fmtBool(item.liquidity_flag) },
    { label: "OTC", value: fmtBool(item.otc_flag) },
    { label: "дивиденды", value: fmtBool(item.div_yield_flag) },
    { label: "ИИС", value: fmtBool(item.for_iis_flag) },
    { label: "квал. инвестор", value: fmtBool(item.for_qual_investor_flag) },
    { label: "выходные", value: fmtBool(item.weekend_flag) },
    { label: "blocked TCA", value: fmtBool(item.blocked_tca_flag) },
    { label: "тесты", value: item.required_tests.join(", ") },
    { label: "логотип", value: item.brand_logo_name },
    { label: "цвет бренда", value: item.brand_logo_base_color },
    { label: "цвет текста", value: item.brand_text_color },
  ];
}

type FieldDiff = {
  label: string;
  left: string;
  right: string;
  changed: boolean;
};

function diffInstrumentFields(left: Instrument, right: Instrument): FieldDiff[] {
  const a = instrumentFields(left);
  const b = instrumentFields(right);
  return a.map((field, i) => {
    const leftValue = displayFieldValue(field.value);
    const rightValue = displayFieldValue(b[i]?.value ?? "");
    return {
      label: field.label,
      left: leftValue,
      right: rightValue,
      changed: leftValue !== rightValue,
    };
  });
}

function InstrumentDetails({ item, onClose }: { item: Instrument; onClose: () => void }) {
  const notify = useNotify();
  const backdropPressed = useRef(false);
  const [versions, setVersions] = useState<Instrument[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<Instrument | null>(null);
  const [comparePair, setComparePair] = useState<[Instrument, Instrument] | null>(null);
  const [pickedKeys, setPickedKeys] = useState<string[]>([]);
  const [onlyDiffs, setOnlyDiffs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingVersions(true);
    setSelectedVersion(null);
    setComparePair(null);
    setPickedKeys([]);
    void listInstrumentVersions(item.uid)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          notify.error(err instanceof Error ? err.message : "Не удалось загрузить версии");
          setVersions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.uid, notify]);

  const closeInnerView = () => {
    setSelectedVersion(null);
    setComparePair(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedVersion || comparePair) {
        closeInnerView();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selectedVersion, comparePair]);

  const title = comparePair
    ? `${comparePair[1].ticker || item.ticker || item.uid} · сравнение версий`
    : selectedVersion
      ? `${selectedVersion.ticker || item.ticker || item.uid} · ${formatDateTimeMs(selectedVersion.version)}`
      : `${item.ticker || item.uid}${item.name ? ` · ${item.name}` : ""}`;

  const latestVersionMs = useMemo(() => {
    let max = 0;
    for (const row of versions) {
      const ms = toMs(row.version);
      if (ms > max) max = ms;
    }
    return max;
  }, [versions]);

  const pickedSet = useMemo(() => new Set(pickedKeys), [pickedKeys]);

  const fieldDiffs = useMemo(
    () => (comparePair ? diffInstrumentFields(comparePair[0], comparePair[1]) : []),
    [comparePair],
  );
  const changedCount = useMemo(() => fieldDiffs.filter((row) => row.changed).length, [fieldDiffs]);
  const visibleDiffs = onlyDiffs ? fieldDiffs.filter((row) => row.changed) : fieldDiffs;

  const togglePicked = (row: Instrument) => {
    const key = versionRowKey(row);
    setPickedKeys((prev) => {
      if (prev.includes(key)) return prev.filter((itemKey) => itemKey !== key);
      if (prev.length >= 2) {
        const last = prev[prev.length - 1];
        return last ? [last, key] : [key];
      }
      return [...prev, key];
    });
  };

  const startCompare = () => {
    const picked = versions.filter((row) => pickedSet.has(versionRowKey(row)));
    if (picked.length !== 2) return;
    const ordered = [...picked].sort((a, b) => toMs(a.version) - toMs(b.version));
    setSelectedVersion(null);
    setComparePair([ordered[0], ordered[1]]);
  };

  return (
    <div
      className="instrument-modal-backdrop"
      onMouseDown={(e) => {
        backdropPressed.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (backdropPressed.current && e.target === e.currentTarget) onClose();
        backdropPressed.current = false;
      }}
    >
      <div
        className={`instrument-modal instrument-modal-wide${comparePair ? " instrument-modal-compare" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="instrument-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="instrument-modal-head">
          <div>
            <p className="eyebrow">
              {comparePair ? "Сравнение версий" : selectedVersion ? "Версия инструмента" : "Инструмент"}
            </p>
            <h3 id="instrument-modal-title">{title}</h3>
          </div>
          <button type="button" className="instrument-modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="instrument-modal-body">
          {comparePair ? (
            <>
              <div className="instrument-version-toolbar">
                <button type="button" className="btn ghost" onClick={closeInnerView}>
                  ← К истории версий
                </button>
                <label className="instrument-compare-toggle">
                  <input
                    type="checkbox"
                    checked={onlyDiffs}
                    onChange={(e) => setOnlyDiffs(e.target.checked)}
                  />
                  только отличия
                </label>
                <span className="hint">
                  {changedCount} из {fieldDiffs.length} полей отличаются
                </span>
              </div>
              <div className="instrument-versions-table-wrap">
                <table className="instrument-compare-table">
                  <thead>
                    <tr>
                      <th>поле</th>
                      <th>{formatDateTimeMs(comparePair[0].version)}</th>
                      <th>{formatDateTimeMs(comparePair[1].version)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDiffs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="instrument-compare-empty">
                          Различий нет.
                        </td>
                      </tr>
                    ) : (
                      visibleDiffs.map((row) => (
                        <tr key={row.label} className={row.changed ? "is-changed" : undefined}>
                          <th scope="row">{row.label}</th>
                          <td title={row.left}>{row.left}</td>
                          <td title={row.right}>{row.right}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : selectedVersion ? (
            <>
              <div className="instrument-version-toolbar">
                <button type="button" className="btn ghost" onClick={closeInnerView}>
                  ← К истории версий
                </button>
              </div>
              <dl className="instrument-fields">
                {instrumentFields(selectedVersion).map((field) => (
                  <DetailField key={field.label} label={field.label} value={field.value} />
                ))}
              </dl>
            </>
          ) : (
            <>
              <p className="instrument-versions-hint">
                История версий из <code>TrB.sht</code> (до merge в ClickHouse). Нажмите строку, чтобы открыть
                реквизиты. Отметьте две версии, чтобы сравнить поля.
              </p>
              {versions.length > 0 ? (
                <p className="instrument-versions-current-hint">
                  Зелёным подсвечена актуальная версия — строка с максимальной датой{" "}
                  <code>version</code> (её же показывает основная таблица через{" "}
                  <code>ReplacingMergeTree</code>).
                </p>
              ) : null}
              {versions.length > 1 ? (
                <div className="instrument-version-toolbar">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={pickedKeys.length !== 2}
                    onClick={startCompare}
                  >
                    Сравнить
                  </button>
                  <span className="hint">
                    {pickedKeys.length === 2
                      ? "Выбраны две версии"
                      : `Выбрано ${pickedKeys.length} из 2`}
                  </span>
                </div>
              ) : null}
              {loadingVersions ? <p className="hint">Загрузка версий…</p> : null}
              {!loadingVersions && versions.length === 0 ? (
                <p className="hint">Версий не найдено.</p>
              ) : null}
              {versions.length > 0 ? (
                <div className="instrument-versions-table-wrap">
                  <table className="instrument-versions-table">
                    <thead>
                      <tr>
                        <th className="instrument-versions-check">сравн.</th>
                        <th>версия</th>
                        <th>ticker</th>
                        <th>name</th>
                        <th>figi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((row) => {
                        const isCurrent = latestVersionMs > 0 && toMs(row.version) === latestVersionMs;
                        const key = versionRowKey(row);
                        const isPicked = pickedSet.has(key);
                        const classNames = [
                          isCurrent ? "is-current-version" : "",
                          isPicked ? "is-compare-picked" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <tr
                            key={key}
                            className={classNames || undefined}
                            title={
                              isCurrent
                                ? "Актуальная версия: максимальная дата version"
                                : undefined
                            }
                            onClick={() => setSelectedVersion(row)}
                          >
                            <td className="instrument-versions-check" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isPicked}
                                disabled={versions.length < 2}
                                aria-label={`Выбрать ${formatDateTimeMs(row.version)} для сравнения`}
                                onChange={() => togglePicked(row)}
                              />
                            </td>
                            <td>{formatDateTimeMs(row.version)}</td>
                            <td>{row.ticker || "—"}</td>
                            <td title={row.name}>{row.name || "—"}</td>
                            <td title={row.figi}>{row.figi || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InstrumentsPanel() {
  const notify = useNotify();
  const [items, setItems] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Record<SortKey, string>>(EMPTY_FILTERS);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const confirmBackdropPressed = useRef(false);
  const deferredFilters = useDeferredValue(filters);

  const reload = async () => {
    setLoading(true);
    try {
      const rows = await listInstruments("", 20000, { lite: false });
      setItems(normalizeRows(rows));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось загрузить инструменты");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load
  }, []);

  useEffect(() => {
    if (!selectedUid && !confirmRefresh) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmRefresh) {
        setConfirmRefresh(false);
        return;
      }
      setSelectedUid(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUid, confirmRefresh]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "version" ? "desc" : "asc");
  };

  const onFilter = (key: SortKey, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const filteredIndices = useMemo(() => {
    const active = COLUMNS.map((c) => ({
      key: c.key,
      q: deferredFilters[c.key].trim().toLowerCase(),
    })).filter((f) => f.q);
    const dir = sortDir === "asc" ? 1 : -1;
    const indices: number[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const row = items[i];
      if (active.some((f) => !cellText(row, f.key).includes(f.q))) continue;
      indices.push(i);
    }
    indices.sort((ia, ib) => compareRows(items[ia], items[ib], sortKey) * dir);
    return indices;
  }, [items, deferredFilters, sortKey, sortDir]);

  const selected = useMemo(
    () => (selectedUid ? items.find((row) => row.item.uid === selectedUid)?.item ?? null : null),
    [items, selectedUid],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredIndices.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  useThrottledColumnLayout(
    parentRef,
    (el) => {
      const styles = getComputedStyle(el);
      const rem = Number.parseFloat(styles.fontSize) || 16;
      const available = el.clientWidth;
      const mins = [8, 14, 10, 12, 5, 8, 10, 4, 12, 5].map((n) => n * rem);
      const minTotal = mins.reduce((a, b) => a + b, 0);
      const extra = Math.max(0, available - minTotal);
      const weights = [0.08, 0.2, 0.1, 0.12, 0.05, 0.08, 0.12, 0.04, 0.14, 0.07];
      const sizes = mins.map((min, i) => Math.floor(min + extra * weights[i]));
      const keys = [
        "ticker",
        "name",
        "figi",
        "uid",
        "currency",
        "exchange",
        "trading-status",
        "lot",
        "version",
        "version-count",
      ];
      keys.forEach((key, i) => el.style.setProperty(`--i-col-${key}`, `${sizes[i]}px`));
      el.style.setProperty("--vtable-width", `${available}px`);
    },
    [loading, filteredIndices.length],
  );

  const onRefresh = async () => {
    setConfirmRefresh(false);
    setRefreshing(true);
    try {
      const result = await syncInstruments();
      notify.success(
        `получено ${result.fetched}, новых ${result.inserted}, обновлено ${result.updated}, без изменений ${result.unchanged}`,
        "Справочник обновлён",
      );
      await reload();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось обновить инструменты");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="panel-page history-panel">
      <header className="scheduler-header instruments-header">
        <h1>Инструменты</h1>
      </header>

      <div className="filters-bar">
        <div className="filters-row filters-actions">
          <button type="button" className="btn ghost" onClick={resetFilters}>
            Сбросить фильтры
          </button>
          <button type="button" className="btn ghost" disabled={loading} onClick={() => void reload()}>
            {loading ? "Загрузка…" : "Обновить таблицу"}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={refreshing || loading}
            onClick={() => setConfirmRefresh(true)}
          >
            {refreshing ? "Запрос к Тинькофф…" : "Обновить из Тинькофф"}
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

      <div ref={parentRef} className="table-scroll table-scroll-fill vtable-scroll instruments-vtable">
        {items.length > 0 ? (
          <div className="vtable">
            <div className="vtable-head">
              {COLUMNS.map((column) => (
                <ColumnHead
                  key={column.key}
                  column={column}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  filter={filters[column.key]}
                  onSort={onSort}
                  onFilter={onFilter}
                />
              ))}
            </div>
            <div className="vtable-body" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = items[filteredIndices[virtualRow.index]];
                return (
                  <div
                    key={row.item.uid}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <InstrumentRowView
                      row={row}
                      alt={virtualRow.index % 2 === 1}
                      selected={row.item.uid === selectedUid}
                      onOpen={setSelectedUid}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {selected ? <InstrumentDetails item={selected} onClose={() => setSelectedUid(null)} /> : null}

      {confirmRefresh ? (
        <div
          className="instrument-modal-backdrop"
          onMouseDown={(e) => {
            confirmBackdropPressed.current = e.target === e.currentTarget;
          }}
          onMouseUp={(e) => {
            if (confirmBackdropPressed.current && e.target === e.currentTarget) {
              setConfirmRefresh(false);
            }
            confirmBackdropPressed.current = false;
          }}
        >
          <div
            className="instrument-modal instrument-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instrument-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="instrument-modal-head">
              <div>
                <p className="eyebrow">Подтверждение</p>
                <h3 id="instrument-confirm-title">Обновить из Тинькофф?</h3>
              </div>
              <button
                type="button"
                className="instrument-modal-close"
                onClick={() => setConfirmRefresh(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="instrument-modal-body">
              <p className="instrument-confirm-text">
                Запросить акции у T-Invest и обновить справочник <code>TrB.sht</code>?
              </p>
            </div>
            <div className="instrument-modal-foot">
              <button type="button" className="btn ghost" onClick={() => setConfirmRefresh(false)}>
                Отмена
              </button>
              <button type="button" className="btn primary" onClick={() => void onRefresh()}>
                Обновить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
