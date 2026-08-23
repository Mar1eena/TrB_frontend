import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addColumn,
  createDatabase,
  createTable,
  dropColumn,
  dropDatabase,
  dropPartition,
  dropTable,
  executeClickHouseQuery,
  fetchClickHouseInfo,
  fetchTableInfo,
  formatBytes,
  formatUptime,
  getMetrics,
  getTableOptions,
  isSystemDatabase,
  killProcess,
  listDatabases,
  listDisks,
  listParts,
  listProcesses,
  listTables,
  modifyColumn,
  optimizeTable,
  previewTableData,
  renameColumn,
  renameTable,
  truncateTable,
  type ChColumn,
  type ChDatabase,
  type ChDisk,
  type ChMetric,
  type ChProcess,
  type ChQueryResult,
  type ChServerInfo,
  type ChTable,
  type ChTableOptions,
  type ChTablePart,
} from "../api/clickhouse";
import "../styles/tables.css";
import "./SchedulerPanel.css";
import "./ClickHouseManagerPanel.css";
import CreateTableModal from "./ClickHouseCreateTableModal";
import { useNotify } from "../notifications";

type MainTab = "explorer" | "console" | "processes" | "system";
type TableDetailTab = "columns" | "preview" | "parts" | "ddl";

type Dialog =
  | { kind: "create-db" }
  | { kind: "create-table" }
  | { kind: "rename-table" }
  | { kind: "add-column" }
  | { kind: "rename-column"; column: ChColumn }
  | { kind: "modify-column"; column: ChColumn }
  | {
      kind: "confirm-danger";
      title: string;
      prompt: string;
      actionName: string;
      onConfirm: () => Promise<void>;
    }
  | { kind: "view-process-query"; proc: ChProcess };

const SQL_PRESETS = [
  {
    name: "Топ-10 самых больших таблиц",
    sql: "SELECT database, name, total_rows, formatReadableSize(total_bytes) AS size, engine\nFROM system.tables\nWHERE database != 'system'\nORDER BY total_bytes DESC\nLIMIT 10",
  },
  {
    name: "Размер баз данных",
    sql: "SELECT database, count() AS tables_count, sum(total_rows) AS total_rows, formatReadableSize(sum(total_bytes)) AS total_size\nFROM system.tables\nGROUP BY database\nORDER BY sum(total_bytes) DESC",
  },
  {
    name: "Активные партиции по таблицам",
    sql: "SELECT database, table, count() AS parts_count, sum(rows) AS total_rows, formatReadableSize(sum(bytes_on_disk)) AS size_on_disk\nFROM system.parts\nWHERE active = 1 AND database != 'system'\nGROUP BY database, table\nORDER BY sum(bytes_on_disk) DESC\nLIMIT 25",
  },
  {
    name: "Использование дисков",
    sql: "SELECT name, path, formatReadableSize(free_space) AS free, formatReadableSize(total_space) AS total, round(100 * (1 - free_space / total_space), 2) AS used_percent, type\nFROM system.disks",
  },
  {
    name: "Спецификация колонок по типам",
    sql: "SELECT type, count() AS columns_count\nFROM system.columns\nWHERE database != 'system'\nGROUP BY type\nORDER BY columns_count DESC\nLIMIT 20",
  },
];

function classifyType(t: string): "is-number" | "is-string" | "is-date" | "is-complex" {
  const low = t.toLowerCase();
  if (low.includes("int") || low.includes("float") || low.includes("decimal") || low.includes("numeric")) {
    return "is-number";
  }
  if (low.includes("date") || low.includes("time")) {
    return "is-date";
  }
  if (low.includes("array") || low.includes("tuple") || low.includes("map") || low.includes("nested")) {
    return "is-complex";
  }
  return "is-string";
}

/** Pretty-print ClickHouse CREATE TABLE (and similar) DDL with indented columns. */
function formatClickHouseDdl(raw: string): string {
  const input = raw?.trim();
  if (!input) return "";
  if ((input.match(/\n/g) ?? []).length >= 2 && /^\s{2,}\S/m.test(input)) {
    return input;
  }

  const s = input.replace(/\s+/g, " ").trim();
  const firstParen = s.indexOf("(");
  if (firstParen < 0) return input;

  let depth = 0;
  let closeIdx = -1;
  let inStr = false;
  let quote = "";
  for (let i = firstParen; i < s.length; i++) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : "";
    if (inStr) {
      if (ch === quote && prev !== "\\") inStr = false;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx < 0) return input;

  const header = s.slice(0, firstParen).trim();
  const inner = s.slice(firstParen + 1, closeIdx).trim();
  const rest = s.slice(closeIdx + 1).trim();

  const cols: string[] = [];
  let buf = "";
  depth = 0;
  inStr = false;
  quote = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    const prev = i > 0 ? inner[i - 1] : "";
    if (inStr) {
      buf += ch;
      if (ch === quote && prev !== "\\") inStr = false;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inStr = true;
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      buf += ch;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      buf += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      if (buf.trim()) cols.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) cols.push(buf.trim());

  const clauseBreak =
    /\s+(ENGINE|ORDER BY|PARTITION BY|PRIMARY KEY|SAMPLE BY|TTL|SETTINGS|COMMENT|AS)\b/gi;
  const restLines = rest
    ? rest
        .replace(clauseBreak, "\n$1")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  return [
    `${header} (`,
    ...cols.map((col, i) => `    ${col}${i < cols.length - 1 ? "," : ""}`),
    ")",
    ...restLines,
  ].join("\n");
}

function QueryResultTable({
  columns,
  types,
  rows,
}: {
  columns: string[];
  types?: string[];
  rows: string[][];
}) {
  return (
    <div className="table-scroll table-scroll-fill ch-result-scroll">
      <table className="data-table ch-result-table">
        <thead>
          <tr>
            <th className="sticky-col ch-row-num">#</th>
            {columns.map((col, idx) => (
              <th
                key={`${col}-${idx}`}
                className="ch-col-head"
                title={types?.[idx] ? `${col}: ${types[idx]}` : col}
              >
                <span className="ch-col-name">{col}</span>
                {types?.[idx] ? <span className="ch-col-type">{types[idx]}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx}>
              <td className="sticky-col ch-row-num muted">{rIdx + 1}</td>
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="mono ch-cell"
                  title={cell === "NULL" ? "NULL" : cell}
                >
                  {cell === "NULL" ? <em className="muted">NULL</em> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function exportCsv(columns: string[], rows: string[][], filename: string) {
  const escapeCell = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const lines = [
    columns.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson(columns: string[], rows: string[][], filename: string) {
  const data = rows.map((row) => {
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i] ?? "";
    });
    return obj;
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Close only when press+release both happen on the backdrop (not drag-out from modal). */
function ModalBackdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const pressed = useRef(false);
  return (
    <div
      className="ch-modal-backdrop"
      onMouseDown={(e) => {
        pressed.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressed.current && e.target === e.currentTarget) onClose();
        pressed.current = false;
      }}
    >
      {children}
    </div>
  );
}

export default function ClickHouseManagerPanel() {
  const notify = useNotify();
  const [info, setInfo] = useState<ChServerInfo | null>(null);
  const [infoChecked, setInfoChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("explorer");
  const [databases, setDatabases] = useState<ChDatabase[]>([]);
  const [tables, setTables] = useState<ChTable[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [selectedTable, setSelectedTable] = useState<ChTable | null>(null);
  const [tableDetailTab, setTableDetailTab] = useState<TableDetailTab>("columns");

  const [dbFilter, setDbFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [tableSort, setTableSort] = useState<"name" | "rows" | "size">("name");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Preview state
  const [previewData, setPreviewData] = useState<ChQueryResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLimit, setPreviewLimit] = useState(50);
  const [previewWhere, setPreviewWhere] = useState("");
  const [previewOrderBy, setPreviewOrderBy] = useState("");

  // Parts state
  const [parts, setParts] = useState<ChTablePart[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsActiveOnly, setPartsActiveOnly] = useState(true);

  // Processes state
  const [processes, setProcesses] = useState<ChProcess[]>([]);
  const [procLoading, setProcLoading] = useState(false);
  const [procAutoRefresh, setProcAutoRefresh] = useState(0);
  const [procFilter, setProcFilter] = useState("");

  // Storage & System state
  const [disks, setDisks] = useState<ChDisk[]>([]);
  const [metrics, setMetrics] = useState<ChMetric[]>([]);
  const [asyncMetrics, setAsyncMetrics] = useState<ChMetric[]>([]);
  const [metricsFilter, setMetricsFilter] = useState("");
  const [systemLoading, setSystemLoading] = useState(false);

  // SQL Console state
  const [sqlQuery, setSqlQuery] = useState("SELECT 1");
  const [sqlMaxRows, setSqlMaxRows] = useState(100);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlResult, setSqlResult] = useState<ChQueryResult | null>(null);
  const [sqlError, setSqlError] = useState("");

  // Form states for modals
  const [dbName, setDbName] = useState("");
  const [dbEngine, setDbEngine] = useState("Atomic");
  const [dbComment, setDbComment] = useState("");

  const [tableOptions, setTableOptions] = useState<ChTableOptions | null>(null);
  const [tableOptionsLoading, setTableOptionsLoading] = useState(false);
  const [tableOptionsError, setTableOptionsError] = useState("");

  const [newName, setNewName] = useState("");
  const [colName, setColName] = useState("");
  const [colType, setColType] = useState("String");
  const [colCodec, setColCodec] = useState("");
  const [colDefaultKind, setColDefaultKind] = useState("");
  const [colDefaultExpr, setColDefaultExpr] = useState("");
  const [colTtl, setColTtl] = useState("");
  const [colComment, setColComment] = useState("");
  const [colAfter, setColAfter] = useState("");

  const sqlEditorRef = useRef<HTMLTextAreaElement>(null);

  const copyText = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  }, []);

  const run = useCallback(async (fn: () => Promise<void>, okMessage?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMessage) notify.success(okMessage);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const loadServerInfo = useCallback(async () => {
    try {
      const data = await fetchClickHouseInfo();
      setInfo(data);
      setInfoChecked(true);
      notify.clear();
    } catch (err) {
      setInfo(null);
      setInfoChecked(true);
      notify.error(err instanceof Error ? err.message : String(err));
    }
  }, [notify]);

  const loadDatabases = useCallback(async (preserveSelection = true) => {
    setLoading(true);
    try {
      const list = await listDatabases();
      setDatabases(list);
      setSelectedDb((prev) => {
        if (preserveSelection && prev && list.some((item) => item.name === prev)) {
          return prev;
        }
        const nonSys = list.find((item) => !isSystemDatabase(item.name));
        return nonSys?.name ?? list[0]?.name ?? "";
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadTables = useCallback(async (db: string, preserveSelection = true) => {
    if (!db) {
      setTables([]);
      setSelectedTable(null);
      return;
    }
    setLoading(true);
    try {
      const list = await listTables(db);
      setTables(list);
      setSelectedTable((prev) => {
        if (preserveSelection && prev && list.some((item) => item.name === prev.name)) {
          const updated = list.find((item) => item.name === prev.name) ?? null;
          return updated;
        }
        return list[0] ?? null;
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadTableDetail = useCallback(async (db: string, name: string) => {
    try {
      const full = await fetchTableInfo(db, name);
      setSelectedTable(full);
      setTables((prev) => prev.map((t) => (t.name === name ? full : t)));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    }
  }, [notify]);

  const loadPreview = useCallback(async (db: string, tbl: string) => {
    if (!db || !tbl) return;
    setPreviewLoading(true);
    try {
      const res = await previewTableData({
        database: db,
        table: tbl,
        limit: previewLimit,
        where: previewWhere.trim() || undefined,
        order_by: previewOrderBy.trim() || undefined,
      });
      setPreviewData(res);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  }, [previewLimit, previewWhere, previewOrderBy, notify]);

  const loadParts = useCallback(async (db: string, tbl: string) => {
    if (!db || !tbl) return;
    setPartsLoading(true);
    try {
      const res = await listParts(db, tbl, partsActiveOnly);
      setParts(res);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPartsLoading(false);
    }
  }, [partsActiveOnly, notify]);

  const loadProcesses = useCallback(async () => {
    setProcLoading(true);
    try {
      const list = await listProcesses();
      setProcesses(list);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setProcLoading(false);
    }
  }, [notify]);

  const loadSystem = useCallback(async () => {
    setSystemLoading(true);
    try {
      const [disksList, metricsData] = await Promise.all([listDisks(), getMetrics()]);
      setDisks(disksList);
      setMetrics(metricsData.metrics);
      setAsyncMetrics(metricsData.async_metrics);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSystemLoading(false);
    }
  }, [notify]);

  const loadTableOptions = useCallback(async () => {
    setTableOptionsLoading(true);
    setTableOptionsError("");
    try {
      const opts = await getTableOptions();
      setTableOptions(opts);
    } catch (err) {
      setTableOptionsError(err instanceof Error ? err.message : String(err));
    } finally {
      setTableOptionsLoading(false);
    }
  }, []);

  // Initial load (coalesced at API layer against StrictMode double-mount)
  useEffect(() => {
    void loadServerInfo();
    void loadDatabases(false);
  }, [loadServerInfo, loadDatabases]);

  // Load tables on DB selection
  useEffect(() => {
    if (selectedDb) {
      loadTables(selectedDb, false);
    }
  }, [selectedDb, loadTables]);

  // Load sub-tab data when table detail tab or selected table changes
  useEffect(() => {
    if (selectedDb && selectedTable) {
      if (tableDetailTab === "preview") {
        loadPreview(selectedDb, selectedTable.name);
      } else if (tableDetailTab === "parts") {
        loadParts(selectedDb, selectedTable.name);
      }
    }
  }, [selectedDb, selectedTable?.name, tableDetailTab, loadPreview, loadParts]);

  // Load processes when opening the tab
  useEffect(() => {
    if (activeTab === "processes") {
      loadProcesses();
    }
  }, [activeTab, loadProcesses]);

  // Auto-refresh for processes tab
  useEffect(() => {
    if (activeTab !== "processes" || procAutoRefresh <= 0) return;
    const interval = setInterval(loadProcesses, procAutoRefresh);
    return () => clearInterval(interval);
  }, [activeTab, procAutoRefresh, loadProcesses]);

  // Load system tab data
  useEffect(() => {
    if (activeTab === "system") {
      loadSystem();
    }
  }, [activeTab, loadSystem]);

  // Execute SQL in console
  const runSqlQuery = useCallback(async () => {
    if (!sqlQuery.trim()) return;
    setSqlRunning(true);
    setSqlError("");
    try {
      const res = await executeClickHouseQuery(sqlQuery, sqlMaxRows);
      setSqlResult(res);
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : String(err));
      setSqlResult(null);
    } finally {
      setSqlRunning(false);
    }
  }, [sqlQuery, sqlMaxRows]);

  const handleSqlKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runSqlQuery();
    }
  };

  // Filtered & Sorted Databases
  const filteredDbs = useMemo(() => {
    const q = dbFilter.trim().toLowerCase();
    if (!q) return databases;
    return databases.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.engine.toLowerCase().includes(q) ||
        item.comment.toLowerCase().includes(q),
    );
  }, [databases, dbFilter]);

  // Filtered & Sorted Tables
  const filteredTables = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    let res = tables;
    if (q) {
      res = res.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.engine.toLowerCase().includes(q) ||
          item.comment.toLowerCase().includes(q),
      );
    }
    return [...res].sort((a, b) => {
      if (tableSort === "rows") return (b.total_rows ?? 0) - (a.total_rows ?? 0);
      if (tableSort === "size") return (b.total_bytes ?? 0) - (a.total_bytes ?? 0);
      return a.name.localeCompare(b.name);
    });
  }, [tables, tableFilter, tableSort]);

  // Filtered Processes
  const filteredProcesses = useMemo(() => {
    const q = procFilter.trim().toLowerCase();
    if (!q) return processes;
    return processes.filter(
      (p) =>
        p.query_id.toLowerCase().includes(q) ||
        p.user.toLowerCase().includes(q) ||
        p.query.toLowerCase().includes(q) ||
        p.client_name.toLowerCase().includes(q),
    );
  }, [processes, procFilter]);

  // Filtered Metrics
  const filteredMetrics = useMemo(() => {
    const q = metricsFilter.trim().toLowerCase();
    if (!q) return { metrics, asyncMetrics };
    return {
      metrics: metrics.filter((m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)),
      asyncMetrics: asyncMetrics.filter(
        (m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
      ),
    };
  }, [metrics, asyncMetrics, metricsFilter]);

  const currentDb = databases.find((item) => item.name === selectedDb) ?? null;
  const isSysDb = isSystemDatabase(selectedDb);

  // Compression ratio helper
  const compressionRatio = useMemo(() => {
    if (!selectedTable || !selectedTable.total_bytes || !selectedTable.data_uncompressed_bytes) return null;
    const ratio = selectedTable.data_uncompressed_bytes / selectedTable.total_bytes;
    return ratio > 1 ? `${ratio.toFixed(2)}:1` : null;
  }, [selectedTable]);

  return (
    <div className="ch-panel">
      {/* Header Bar */}
      <header className="ch-header">
        <div className="ch-title-wrap">
          <h1>ClickHouse Studio</h1>
          <div className={`ch-live-indicator ${info ? "" : "is-offline"}`}>
            <span className="dot" />
            {info ? "Online" : infoChecked ? "Offline" : "Connecting..."}
          </div>
        </div>

        {info && (
          <div className="ch-stats-ribbon">
            <span className="ch-chip" title="Версия ClickHouse">
              <span className="label">v</span>
              <strong>{info.version}</strong>
            </span>
            <span className="ch-chip" title="Хост сервера">
              <span className="label">host</span>
              <span>{info.display_name}</span>
            </span>
            <span className="ch-chip" title="Часовой пояс">
              <span className="label">tz</span>
              <span>{info.timezone}</span>
            </span>
            <span className="ch-chip" title="Время непрерывной работы">
              <span className="label">uptime</span>
              <span>{formatUptime(info.uptime_seconds)}</span>
            </span>
            <span
              className="ch-chip is-btn"
              onClick={() => setActiveTab("processes")}
              title="Нажмите для перехода к процессам"
            >
              <span className="label">active queries</span>
              <strong>{processes.length > 0 ? processes.length : "0"}</strong>
            </span>
          </div>
        )}

        <div className="ch-header-actions">
          {/* Main Tabs Navigation */}
          <nav className="ch-nav-tabs">
            <button
              type="button"
              className={`ch-nav-tab ${activeTab === "explorer" ? "is-active" : ""}`}
              onClick={() => setActiveTab("explorer")}
            >
              🗄 Проводник
            </button>
            <button
              type="button"
              className={`ch-nav-tab ${activeTab === "console" ? "is-active" : ""}`}
              onClick={() => setActiveTab("console")}
            >
              ⚡ SQL Консоль
            </button>
            <button
              type="button"
              className={`ch-nav-tab ${activeTab === "processes" ? "is-active" : ""}`}
              onClick={() => setActiveTab("processes")}
            >
              ⏱ Процессы
              {processes.length > 0 && <span className="ch-tab-badge">{processes.length}</span>}
            </button>
            <button
              type="button"
              className={`ch-nav-tab ${activeTab === "system" ? "is-active" : ""}`}
              onClick={() => setActiveTab("system")}
            >
              📊 Диски и Метрики
            </button>
          </nav>

          <button
            type="button"
            className="secondary-btn sm"
            onClick={() => {
              loadServerInfo();
              if (activeTab === "explorer") {
                loadDatabases(true);
                if (selectedDb) loadTables(selectedDb, true);
              } else if (activeTab === "processes") {
                loadProcesses();
              } else if (activeTab === "system") {
                loadSystem();
              }
            }}
            disabled={loading || busy}
            title="Обновить данные"
          >
            🔄 Обновить
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="ch-content">
        {/* ================= TAB 1: EXPLORER ================= */}
        {activeTab === "explorer" && (
          <div className="ch-explorer">
            {/* Column 1: Databases Pane */}
            <section className="ch-pane">
              <div className="ch-pane-header">
                <h3>🗄 Базы ({filteredDbs.length})</h3>
                <button
                  type="button"
                  className="primary-btn sm"
                  onClick={() => {
                    setDbName("");
                    setDbEngine("Atomic");
                    setDbComment("");
                    setDialog({ kind: "create-db" });
                  }}
                  title="Создать новую базу данных"
                >
                  + База
                </button>
              </div>

              <div className="ch-search-box">
                <input
                  type="text"
                  placeholder="Поиск баз..."
                  value={dbFilter}
                  onChange={(e) => setDbFilter(e.target.value)}
                />
                {dbFilter && (
                  <button type="button" className="ch-search-clear" onClick={() => setDbFilter("")}>
                    ✕
                  </button>
                )}
              </div>

              <div className="ch-tree-list">
                {filteredDbs.map((db) => {
                  const isSelected = db.name === selectedDb;
                  const isSys = isSystemDatabase(db.name);
                  return (
                    <div
                      key={db.name}
                      className={`ch-tree-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedDb(db.name);
                        loadTables(db.name, false);
                      }}
                    >
                      <div className="ch-tree-item-main">
                        <span className="ch-tree-name">
                          {isSys ? "🔒" : "📁"} {db.name}
                        </span>
                        <span className={`ch-tag ${db.engine === "Atomic" ? "is-atomic" : ""}`}>
                          {db.engine || "Atomic"}
                        </span>
                      </div>
                      <div className="ch-tree-item-meta">
                        <span>{db.tables_count ?? 0} табл.</span>
                        {db.total_bytes ? <span>• {formatBytes(db.total_bytes)}</span> : null}
                        {db.total_rows ? <span>• {db.total_rows.toLocaleString()} строк</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {currentDb && !isSysDb && (
                <div className="ch-pane-footer">
                  <button
                    type="button"
                    className="danger-btn sm"
                    style={{ width: "100%" }}
                    onClick={() => {
                      setDialog({
                        kind: "confirm-danger",
                        title: `Удаление базы данных ${selectedDb}`,
                        prompt: `Вы действительно хотите удалить базу "${selectedDb}" и ВСЕ её таблицы? Это действие необратимо.`,
                        actionName: "Удалить базу данных",
                        onConfirm: async () => {
                          await dropDatabase(selectedDb);
                          await loadDatabases(false);
                        },
                      });
                    }}
                  >
                    🗑 Удалить базу {selectedDb}
                  </button>
                </div>
              )}
            </section>

            {/* Column 2: Tables Pane */}
            <section className="ch-pane">
              <div className="ch-pane-header">
                <h3>📑 Таблицы ({filteredTables.length})</h3>
                <button
                  type="button"
                  className="primary-btn sm"
                  disabled={!selectedDb || isSysDb}
                  onClick={() => {
                    setDialog({ kind: "create-table" });
                    if (!tableOptions) void loadTableOptions();
                  }}
                  title="Создать новую таблицу в выбранной базе"
                >
                  + Таблица
                </button>
              </div>

              <div style={{ display: "flex", gap: "0.35rem" }}>
                <div className="ch-search-box" style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Поиск таблиц..."
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                  />
                  {tableFilter && (
                    <button type="button" className="ch-search-clear" onClick={() => setTableFilter("")}>
                      ✕
                    </button>
                  )}
                </div>
                <select
                  value={tableSort}
                  onChange={(e) => setTableSort(e.target.value as "name" | "rows" | "size")}
                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
                  title="Сортировка таблиц"
                >
                  <option value="name">Имя (A-Z)</option>
                  <option value="rows">Строки (макс)</option>
                  <option value="size">Размер (макс)</option>
                </select>
              </div>

              <div className="ch-tree-list">
                {filteredTables.length === 0 && (
                  <div className="ch-empty">
                    <span className="icon">📭</span>
                    <span>Таблицы не найдены</span>
                  </div>
                )}
                {filteredTables.map((tbl) => {
                  const isSelected = tbl.name === selectedTable?.name;
                  const engineClass = tbl.engine.includes("Replacing")
                    ? "is-replacing"
                    : tbl.engine.includes("MergeTree")
                    ? "is-mergetree"
                    : tbl.engine === "Memory"
                    ? "is-memory"
                    : "";
                  return (
                    <div
                      key={tbl.name}
                      className={`ch-tree-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedTable(tbl);
                        loadTableDetail(selectedDb, tbl.name);
                      }}
                    >
                      <div className="ch-tree-item-main">
                        <span className="ch-tree-name">{tbl.name}</span>
                        <span className={`ch-tag ${engineClass}`}>{tbl.engine}</span>
                      </div>
                      <div className="ch-tree-item-meta">
                        <span>{tbl.total_rows.toLocaleString()} строк</span>
                        <span>• {formatBytes(tbl.total_bytes)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Column 3: Table Detail Inspector */}
            <section className="ch-table-detail">
              {selectedTable ? (
                <>
                  <div className="ch-detail-hero">
                    <div className="ch-detail-title-bar">
                      <div className="ch-breadcrumbs">
                        <span className="db">{selectedDb}</span>
                        <span className="sep">/</span>
                        <span className="tbl">{selectedTable.name}</span>
                        <span className="ch-tag is-mergetree" style={{ marginLeft: "0.4rem" }}>
                          {selectedTable.engine}
                        </span>
                      </div>

                      <div className="ch-detail-actions">
                        <button
                          type="button"
                          className="secondary-btn sm"
                          onClick={() => {
                            setTableDetailTab("preview");
                            loadPreview(selectedDb, selectedTable.name);
                          }}
                          title="Просмотреть данные"
                        >
                          🔍 Данные
                        </button>
                        {!isSysDb && (
                          <>
                            <button
                              type="button"
                              className="secondary-btn sm"
                              onClick={() => {
                                setDialog({
                                  kind: "confirm-danger",
                                  title: `Оптимизация таблицы ${selectedTable.name}`,
                                  prompt: `Запустить OPTIMIZE TABLE FINAL для ${selectedTable.name}? Это объединит все куски данных.`,
                                  actionName: "Оптимизировать (OPTIMIZE FINAL)",
                                  onConfirm: async () => {
                                    await optimizeTable(selectedDb, selectedTable.name, { final: true });
                                    await loadTableDetail(selectedDb, selectedTable.name);
                                  },
                                });
                              }}
                              title="Выполнить OPTIMIZE TABLE FINAL"
                            >
                              ⚡ Optimize
                            </button>
                            <button
                              type="button"
                              className="secondary-btn sm"
                              onClick={() => {
                                setNewName(selectedTable.name);
                                setDialog({ kind: "rename-table" });
                              }}
                              title="Переименовать таблицу"
                            >
                              ✏️ Rename
                            </button>
                            <button
                              type="button"
                              className="danger-btn sm"
                              onClick={() => {
                                setDialog({
                                  kind: "confirm-danger",
                                  title: `Очистка таблицы ${selectedTable.name}`,
                                  prompt: `Вы действительно хотите очистить (TRUNCATE) таблицу "${selectedTable.name}"? Все данные будут удалены.`,
                                  actionName: "Очистить таблицу (TRUNCATE)",
                                  onConfirm: async () => {
                                    await truncateTable(selectedDb, selectedTable.name);
                                    await loadTableDetail(selectedDb, selectedTable.name);
                                  },
                                });
                              }}
                              title="Очистить все данные в таблице"
                            >
                              🧹 Truncate
                            </button>
                            <button
                              type="button"
                              className="danger-btn sm"
                              onClick={() => {
                                setDialog({
                                  kind: "confirm-danger",
                                  title: `Удаление таблицы ${selectedTable.name}`,
                                  prompt: `Вы действительно хотите удалить (DROP) таблицу "${selectedTable.name}"? Это действие необратимо.`,
                                  actionName: "Удалить таблицу (DROP)",
                                  onConfirm: async () => {
                                    await dropTable(selectedDb, selectedTable.name);
                                    await loadTables(selectedDb, false);
                                  },
                                });
                              }}
                              title="Удалить таблицу"
                            >
                              🗑 Drop
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="ch-stats-grid">
                      <div className="ch-stat-card">
                        <span className="lbl">Всего строк</span>
                        <span className="val">{selectedTable.total_rows.toLocaleString()}</span>
                      </div>
                      <div className="ch-stat-card">
                        <span className="lbl">Размер на диске</span>
                        <span className="val">{formatBytes(selectedTable.total_bytes)}</span>
                      </div>
                      {selectedTable.data_uncompressed_bytes ? (
                        <div className="ch-stat-card">
                          <span className="lbl">Без сжатия</span>
                          <span className="val">{formatBytes(selectedTable.data_uncompressed_bytes)}</span>
                        </div>
                      ) : null}
                      {compressionRatio && (
                        <div className="ch-stat-card">
                          <span className="lbl">Сжатие</span>
                          <span className="val" style={{ color: "#7bf1ad" }}>
                            {compressionRatio}
                          </span>
                        </div>
                      )}
                      {selectedTable.parts_count != null && (
                        <div className="ch-stat-card">
                          <span className="lbl">Кусков (Parts)</span>
                          <span className="val">{selectedTable.parts_count}</span>
                        </div>
                      )}
                      {selectedTable.sorting_key && (
                        <div className="ch-stat-card">
                          <span className="lbl">Sorting Key</span>
                          <span className="val" title={selectedTable.sorting_key}>
                            {selectedTable.sorting_key}
                          </span>
                        </div>
                      )}
                      {selectedTable.partition_key && (
                        <div className="ch-stat-card">
                          <span className="lbl">Partition Key</span>
                          <span className="val" title={selectedTable.partition_key}>
                            {selectedTable.partition_key}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sub-nav inside table view */}
                  <div className="ch-sub-nav">
                    <button
                      type="button"
                      className={`ch-sub-tab ${tableDetailTab === "columns" ? "is-active" : ""}`}
                      onClick={() => setTableDetailTab("columns")}
                    >
                      📋 Структура ({selectedTable.columns?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      className={`ch-sub-tab ${tableDetailTab === "preview" ? "is-active" : ""}`}
                      onClick={() => {
                        setTableDetailTab("preview");
                        loadPreview(selectedDb, selectedTable.name);
                      }}
                    >
                      🔍 Превью данных
                    </button>
                    <button
                      type="button"
                      className={`ch-sub-tab ${tableDetailTab === "parts" ? "is-active" : ""}`}
                      onClick={() => {
                        setTableDetailTab("parts");
                        loadParts(selectedDb, selectedTable.name);
                      }}
                    >
                      📦 Партиции {parts.length > 0 ? `(${parts.length})` : ""}
                    </button>
                    <button
                      type="button"
                      className={`ch-sub-tab ${tableDetailTab === "ddl" ? "is-active" : ""}`}
                      onClick={() => setTableDetailTab("ddl")}
                    >
                      📜 DDL Схема
                    </button>
                  </div>

                  {/* Sub-view Area */}
                  <div className="ch-sub-view">
                    {/* Sub-tab 1: Columns */}
                    {tableDetailTab === "columns" && (
                      <div className="ch-schema-wrap">
                        <div className="ch-schema-toolbar">
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            Колонки и типы данных таблицы
                          </span>
                          {!isSysDb && (
                            <button
                              type="button"
                              className="primary-btn sm"
                              onClick={() => {
                                setColName("");
                                setColType("String");
                                setColCodec("");
                                setColDefaultKind("");
                                setColDefaultExpr("");
                                setColTtl("");
                                setColComment("");
                                setColAfter("");
                                setDialog({ kind: "add-column" });
                              }}
                            >
                              + Добавить колонку
                            </button>
                          )}
                        </div>

                        <div className="table-scroll">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th style={{ width: "3rem" }}>#</th>
                                <th>Имя колонки</th>
                                <th>Тип</th>
                                <th>Кодек</th>
                                <th>По умолчанию</th>
                                <th>TTL</th>
                                <th>Комментарий</th>
                                {!isSysDb && <th style={{ width: "8rem" }}>Действия</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedTable.columns?.map((col, idx) => (
                                <tr key={col.name}>
                                  <td className="muted">{idx + 1}</td>
                                  <td>
                                    <strong>{col.name}</strong>
                                  </td>
                                  <td>
                                    <span className={`type-pill ${classifyType(col.type)}`}>{col.type}</span>
                                  </td>
                                  <td className="mono muted">{col.codec || "—"}</td>
                                  <td className="mono">
                                    {col.default_kind ? (
                                      <span>
                                        <strong className="muted">{col.default_kind}</strong> {col.default_expression}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="mono muted">{col.ttl || "—"}</td>
                                  <td>{col.comment || "—"}</td>
                                  {!isSysDb && (
                                    <td>
                                      <div style={{ display: "flex", gap: "0.3rem" }}>
                                        <button
                                          type="button"
                                          className="secondary-btn sm"
                                          onClick={() => {
                                            setColName(col.name);
                                            setColType(col.type);
                                            setColCodec(col.codec);
                                            setColDefaultExpr(col.default_expression);
                                            setColTtl(col.ttl);
                                            setColComment(col.comment);
                                            setDialog({ kind: "modify-column", column: col });
                                          }}
                                          title="Изменить тип или параметры колонки"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          type="button"
                                          className="secondary-btn sm"
                                          onClick={() => {
                                            setNewName(col.name);
                                            setDialog({ kind: "rename-column", column: col });
                                          }}
                                          title="Переименовать колонку"
                                        >
                                          🏷
                                        </button>
                                        <button
                                          type="button"
                                          className="danger-btn sm"
                                          onClick={() => {
                                            setDialog({
                                              kind: "confirm-danger",
                                              title: `Удаление колонки ${col.name}`,
                                              prompt: `Удалить колонку "${col.name}" из таблицы "${selectedTable.name}"?`,
                                              actionName: "Удалить колонку",
                                              onConfirm: async () => {
                                                await dropColumn(selectedDb, selectedTable.name, col.name);
                                                await loadTableDetail(selectedDb, selectedTable.name);
                                              },
                                            });
                                          }}
                                          title="Удалить колонку"
                                        >
                                          🗑
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 2: Preview Data */}
                    {tableDetailTab === "preview" && (
                      <div className="ch-preview-wrap">
                        <div className="ch-preview-controls">
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Лимит:</span>
                          <select
                            value={previewLimit}
                            onChange={(e) => setPreviewLimit(Number(e.target.value))}
                            style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
                          >
                            <option value="25">25 строк</option>
                            <option value="50">50 строк</option>
                            <option value="100">100 строк</option>
                            <option value="200">200 строк</option>
                          </select>

                          <input
                            type="text"
                            placeholder="WHERE (например: price > 100)"
                            value={previewWhere}
                            onChange={(e) => setPreviewWhere(e.target.value)}
                            style={{ flex: 1, minWidth: "10rem" }}
                          />

                          <input
                            type="text"
                            placeholder="ORDER BY (например: timestamp DESC)"
                            value={previewOrderBy}
                            onChange={(e) => setPreviewOrderBy(e.target.value)}
                            style={{ width: "12rem" }}
                          />

                          <button
                            type="button"
                            className="primary-btn sm"
                            onClick={() => loadPreview(selectedDb, selectedTable.name)}
                            disabled={previewLoading}
                          >
                            {previewLoading ? "Загрузка..." : "Применить"}
                          </button>

                          {previewData && previewData.rows.length > 0 && (
                            <>
                              <button
                                type="button"
                                className="secondary-btn sm"
                                onClick={() => exportCsv(previewData.columns, previewData.rows, selectedTable.name)}
                              >
                                📥 CSV
                              </button>
                              <button
                                type="button"
                                className="secondary-btn sm"
                                onClick={() => exportJson(previewData.columns, previewData.rows, selectedTable.name)}
                              >
                                📥 JSON
                              </button>
                            </>
                          )}
                        </div>

                        {["NATS", "Kafka", "RabbitMQ", "FileLog", "AzureQueue", "S3Queue"].includes(
                          selectedTable.engine,
                        ) && (
                          <p className="ch-hint">
                            Движок {selectedTable.engine}: превью включает
                            stream_like_engine_allow_direct_select=1. Чтение обычно удаляет сообщения из
                            очереди.
                          </p>
                        )}

                        <div className="ch-preview-grid">
                          {previewLoading ? (
                            <div className="ch-empty">
                              <span>Загрузка выборки данных...</span>
                            </div>
                          ) : previewData && previewData.rows.length > 0 ? (
                            <QueryResultTable
                              columns={previewData.columns}
                              types={previewData.types}
                              rows={previewData.rows}
                            />
                          ) : (
                            <div className="ch-empty">
                              <span className="icon">📭</span>
                              <span>Нет строк по заданным условиям</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 3: Parts */}
                    {tableDetailTab === "parts" && (
                      <div className="ch-preview-wrap">
                        <div className="ch-preview-controls">
                          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
                            <input
                              type="checkbox"
                              checked={partsActiveOnly}
                              onChange={(e) => setPartsActiveOnly(e.target.checked)}
                            />
                            Только активные куски
                          </label>

                          <button
                            type="button"
                            className="secondary-btn sm"
                            onClick={() => loadParts(selectedDb, selectedTable.name)}
                            disabled={partsLoading}
                          >
                            🔄 Обновить
                          </button>
                        </div>

                        <div className="table-scroll">
                          {partsLoading ? (
                            <div className="ch-empty">
                              <span>Загрузка партиций...</span>
                            </div>
                          ) : parts.length > 0 ? (
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Партиция</th>
                                  <th>Имя куска</th>
                                  <th>Строк</th>
                                  <th>Размер на диске</th>
                                  <th>Без сжатия</th>
                                  <th>Диск</th>
                                  <th>Изменен</th>
                                  <th>Мин / Макс дата</th>
                                  {!isSysDb && <th>Действия</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {parts.map((p) => (
                                  <tr key={p.name}>
                                    <td className="mono">
                                      <strong>{p.partition || "all"}</strong>
                                    </td>
                                    <td className="mono muted">{p.name}</td>
                                    <td>{p.rows.toLocaleString()}</td>
                                    <td>{formatBytes(p.bytes_on_disk)}</td>
                                    <td>{formatBytes(p.data_uncompressed_bytes)}</td>
                                    <td>{p.disk_name || "default"}</td>
                                    <td className="muted">{p.modification_time}</td>
                                    <td className="muted">
                                      {p.min_date} .. {p.max_date}
                                    </td>
                                    {!isSysDb && (
                                      <td>
                                        <button
                                          type="button"
                                          className="danger-btn sm"
                                          onClick={() => {
                                            setDialog({
                                              kind: "confirm-danger",
                                              title: `Удаление партиции ${p.partition}`,
                                              prompt: `Удалить партицию "${p.partition}" из таблицы "${selectedTable.name}"? Все строки в этой партиции будут стёрты.`,
                                              actionName: "Удалить партицию (DROP PARTITION)",
                                              onConfirm: async () => {
                                                await dropPartition(selectedDb, selectedTable.name, p.partition, false);
                                                await loadParts(selectedDb, selectedTable.name);
                                              },
                                            });
                                          }}
                                        >
                                          🗑 Drop
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="ch-empty">
                              <span className="icon">📦</span>
                              <span>Партиции не найдены</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 4: DDL */}
                    {tableDetailTab === "ddl" && (
                      <div className="ch-ddl-wrap">
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="secondary-btn sm"
                            onClick={() =>
                              copyText(
                                "ddl",
                                formatClickHouseDdl(selectedTable.create_table_query) ||
                                  selectedTable.create_table_query,
                              )
                            }
                          >
                            {copiedKey === "ddl" ? "✓ Скопировано!" : "📋 Копировать DDL"}
                          </button>
                        </div>
                        <pre className="ch-ddl-box">
                          {selectedTable.create_table_query
                            ? formatClickHouseDdl(selectedTable.create_table_query)
                            : "DDL недоступен"}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="ch-empty">
                  <span className="icon">👈</span>
                  <span>Выберите таблицу для просмотра схемы и данных</span>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================= TAB 2: SQL CONSOLE ================= */}
        {activeTab === "console" && (
          <div className="ch-console-layout">
            <div className="ch-console-top">
              <div className="ch-console-toolbar">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "600" }}>SQL Запрос:</span>
                  <select
                    value={sqlMaxRows}
                    onChange={(e) => setSqlMaxRows(Number(e.target.value))}
                    style={{ fontSize: "0.78rem" }}
                  >
                    <option value="50">Лимит: 50</option>
                    <option value="100">Лимит: 100</option>
                    <option value="250">Лимит: 250</option>
                    <option value="500">Лимит: 500</option>
                    <option value="1000">Лимит: 1000</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        setSqlQuery(e.target.value);
                      }
                    }}
                    defaultValue=""
                    style={{ fontSize: "0.78rem", maxWidth: "14rem" }}
                  >
                    <option value="" disabled>
                      ⚡ Шаблоны запросов...
                    </option>
                    {SQL_PRESETS.map((p) => (
                      <option key={p.name} value={p.sql}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="secondary-btn sm"
                    onClick={() => setSqlQuery("")}
                    disabled={sqlRunning}
                  >
                    Очистить
                  </button>
                  <button
                    type="button"
                    className="primary-btn sm"
                    onClick={runSqlQuery}
                    disabled={sqlRunning || !sqlQuery.trim()}
                  >
                    {sqlRunning ? "Выполняется..." : "▶ Выполнить (Ctrl+Enter)"}
                  </button>
                </div>
              </div>

              <div className="ch-editor-area">
                <textarea
                  ref={sqlEditorRef}
                  className="ch-sql-textarea"
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  onKeyDown={handleSqlKeyDown}
                  placeholder="Введите SQL запрос (например, SELECT * FROM system.tables LIMIT 20)..."
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="ch-console-results">
              <div className="ch-results-meta">
                {sqlResult ? (
                  <div style={{ display: "flex", gap: "0.8rem", color: "var(--muted)" }}>
                    <span>
                      Строк: <strong style={{ color: "var(--text)" }}>{sqlResult.rows.length}</strong>{" "}
                      {sqlResult.total_rows > sqlResult.rows.length ? `(из ${sqlResult.total_rows})` : ""}
                    </span>
                    <span>
                      Время:{" "}
                      <strong style={{ color: "#7bf1ad" }}>
                        {(sqlResult.elapsed_seconds * 1000).toFixed(1)} ms
                      </strong>
                    </span>
                    {sqlResult.bytes_read > 0 && (
                      <span>Прочитано: {formatBytes(sqlResult.bytes_read)}</span>
                    )}
                  </div>
                ) : sqlError ? (
                  <span style={{ color: "#ffb4b4" }}>⚠️ Ошибка выполнения запроса</span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>Результат выполнения запроса появится здесь</span>
                )}

                {sqlResult && sqlResult.rows.length > 0 && (
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      className="secondary-btn sm"
                      onClick={() => exportCsv(sqlResult.columns, sqlResult.rows, "query_result")}
                    >
                      📥 CSV
                    </button>
                    <button
                      type="button"
                      className="secondary-btn sm"
                      onClick={() => exportJson(sqlResult.columns, sqlResult.rows, "query_result")}
                    >
                      📥 JSON
                    </button>
                  </div>
                )}
              </div>

              <div className="ch-preview-grid">
                {sqlError ? (
                  <div className="ch-empty" style={{ color: "#ffb4b4" }}>
                    <span className="icon">⚠️</span>
                    <pre style={{ textAlign: "left", whiteSpace: "pre-wrap" }}>{sqlError}</pre>
                  </div>
                ) : sqlResult && sqlResult.rows.length > 0 ? (
                  <QueryResultTable
                    columns={sqlResult.columns}
                    types={sqlResult.types}
                    rows={sqlResult.rows}
                  />
                ) : (
                  <div className="ch-empty">
                    <span className="icon">⌨️</span>
                    <span>Нажмите «Выполнить» или Ctrl+Enter для запуска запроса</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: PROCESSES ================= */}
        {activeTab === "processes" && (
          <div className="ch-processes-layout">
            <div className="ch-proc-toolbar">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontWeight: "600", fontSize: "0.95rem" }}>
                  Активные запросы ({filteredProcesses.length})
                </span>
                <select
                  value={procAutoRefresh}
                  onChange={(e) => setProcAutoRefresh(Number(e.target.value))}
                  style={{ fontSize: "0.78rem" }}
                >
                  <option value="0">Автообновление: Выкл</option>
                  <option value="2000">Каждые 2 сек</option>
                  <option value="5000">Каждые 5 сек</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div className="ch-search-box">
                  <input
                    type="text"
                    placeholder="Фильтр по запросу, пользователю..."
                    value={procFilter}
                    onChange={(e) => setProcFilter(e.target.value)}
                    style={{ width: "16rem" }}
                  />
                  {procFilter && (
                    <button type="button" className="ch-search-clear" onClick={() => setProcFilter("")}>
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={loadProcesses}
                  disabled={procLoading}
                >
                  🔄 Обновить
                </button>
              </div>
            </div>

            <div className="table-scroll">
              {procLoading && processes.length === 0 ? (
                <div className="ch-empty">
                  <span>Загрузка активных процессов...</span>
                </div>
              ) : filteredProcesses.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Query ID</th>
                      <th>Пользователь / Клиент</th>
                      <th>Длительность</th>
                      <th>Память</th>
                      <th>Строк прочитано</th>
                      <th>Запрос</th>
                      <th style={{ width: "6rem" }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcesses.map((proc) => {
                      const isSlow = proc.elapsed_seconds > 5;
                      return (
                        <tr key={proc.query_id}>
                          <td className="mono" style={{ fontSize: "0.75rem" }}>
                            {proc.query_id}
                          </td>
                          <td>
                            <strong>{proc.user}</strong>{" "}
                            <span className="muted" style={{ fontSize: "0.7rem" }}>
                              ({proc.client_name || proc.os_user || "client"})
                            </span>
                          </td>
                          <td
                            className="mono"
                            style={{ color: isSlow ? "#ffb4b4" : "#7bf1ad", fontWeight: "600" }}
                          >
                            {proc.elapsed_seconds.toFixed(2)}s
                          </td>
                          <td>{formatBytes(proc.memory_usage)}</td>
                          <td>{proc.rows_read.toLocaleString()}</td>
                          <td
                            className="mono"
                            style={{
                              maxWidth: "24rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                            }}
                            onClick={() => setDialog({ kind: "view-process-query", proc })}
                            title="Нажмите для просмотра полного текста запроса"
                          >
                            {proc.query}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="danger-btn sm"
                              onClick={() => {
                                setDialog({
                                  kind: "confirm-danger",
                                  title: `Остановка запроса ${proc.query_id}`,
                                  prompt: `Остановить выполнение запроса пользователя "${proc.user}"?`,
                                  actionName: "Остановить (KILL QUERY)",
                                  onConfirm: async () => {
                                    await killProcess(proc.query_id);
                                    await loadProcesses();
                                  },
                                });
                              }}
                            >
                              ⛔ Kill
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="ch-empty">
                  <span className="icon">💤</span>
                  <span>Нет активных фоновых запросов</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: SYSTEM & STORAGE ================= */}
        {activeTab === "system" && (
          <div className="ch-system-layout">
            {/* Left: Storage Disks */}
            <div className="ch-pane">
              <div className="ch-pane-header">
                <h3>💾 Хранилище и Диски ({disks.length})</h3>
                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={loadSystem}
                  disabled={systemLoading}
                >
                  🔄
                </button>
              </div>

              <div style={{ overflowY: "auto" }}>
                {disks.map((d) => {
                  const used = d.total_space > d.free_space ? d.total_space - d.free_space : 0;
                  const pct = d.total_space > 0 ? Math.round((used / d.total_space) * 100) : 0;
                  const barClass = pct > 90 ? "is-crit" : pct > 75 ? "is-warn" : "";
                  return (
                    <div key={d.name} className="ch-disk-card">
                      <div className="ch-disk-header">
                        <span className="ch-disk-name">{d.name}</span>
                        <span className="ch-tag">{d.type}</span>
                      </div>
                      <div className="ch-disk-path">{d.path}</div>

                      <div className="ch-progress-bar-wrap">
                        <div
                          className={`ch-progress-bar-fill ${barClass}`}
                          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                        />
                      </div>

                      <div className="ch-disk-stats-row">
                        <span>Занято: {pct}% ({formatBytes(used)})</span>
                        <span>Свободно: {formatBytes(d.free_space)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Key Server Metrics */}
            <div className="ch-pane">
              <div className="ch-pane-header">
                <h3>📊 Метрики сервера ClickHouse</h3>
                <div className="ch-search-box">
                  <input
                    type="text"
                    placeholder="Фильтр метрик..."
                    value={metricsFilter}
                    onChange={(e) => setMetricsFilter(e.target.value)}
                    style={{ width: "14rem" }}
                  />
                  {metricsFilter && (
                    <button type="button" className="ch-search-clear" onClick={() => setMetricsFilter("")}>
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Метрика</th>
                      <th style={{ width: "8rem" }}>Значение</th>
                      <th>Описание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMetrics.metrics.map((m) => (
                      <tr key={m.name}>
                        <td className="mono">
                          <strong>{m.name}</strong>
                        </td>
                        <td className="mono" style={{ color: "#7bf1ad", fontWeight: "600" }}>
                          {m.value.toLocaleString()}
                        </td>
                        <td className="muted">{m.description || "—"}</td>
                      </tr>
                    ))}
                    {filteredMetrics.asyncMetrics.map((m) => (
                      <tr key={`async-${m.name}`}>
                        <td className="mono">
                          <span className="muted">async.</span> {m.name}
                        </td>
                        <td className="mono">{m.value.toLocaleString()}</td>
                        <td className="muted">{m.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================= MODALS & DIALOGS ================= */}

      {/* 1. Create Database Modal */}
      {dialog?.kind === "create-db" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="ch-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="ch-modal-head">
              <h3>Создание базы данных</h3>
              <button type="button" className="ch-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await createDatabase({
                    name: dbName,
                    engine: dbEngine,
                    comment: dbComment,
                    if_not_exists: true,
                  });
                  setDialog(null);
                  await loadDatabases(true);
                }, `База данных "${dbName}" успешно создана`);
              }}
            >
              <div className="ch-modal-body">
                <div className="field">
                  <label>Имя базы данных *</label>
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                    placeholder="my_database"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Движок базы (Engine)</label>
                  <select value={dbEngine} onChange={(e) => setDbEngine(e.target.value)}>
                    <option value="Atomic">Atomic (по умолчанию)</option>
                    <option value="Lazy">Lazy</option>
                    <option value="Memory">Memory</option>
                  </select>
                </div>
                <div className="field">
                  <label>Комментарий (опционально)</label>
                  <input
                    type="text"
                    placeholder="Описание назначения базы"
                    value={dbComment}
                    onChange={(e) => setDbComment(e.target.value)}
                  />
                </div>
              </div>
              <div className="ch-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn" disabled={busy || !dbName.trim()}>
                  {busy ? "Создание..." : "Создать базу"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 2. Create Table Modal */}
      {dialog?.kind === "create-table" && (
        <CreateTableModal
          database={selectedDb}
          busy={busy}
          options={tableOptions}
          metaLoading={tableOptionsLoading}
          metaError={tableOptionsError}
          onClose={() => setDialog(null)}
          onSubmit={async (spec) => {
            setBusy(true);
            try {
              await createTable(spec);
              setDialog(null);
              notify.success(`Таблица "${spec.name}" успешно создана`);
              await loadTables(selectedDb, true);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {/* 3. Add Column Modal */}
      {dialog?.kind === "add-column" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="ch-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="ch-modal-head">
              <h3>Добавить колонку в {selectedTable.name}</h3>
              <button type="button" className="ch-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await addColumn(
                    selectedDb,
                    selectedTable.name,
                    {
                      name: colName,
                      type: colType,
                      codec: colCodec.trim() || undefined,
                      default_kind: colDefaultKind.trim() || undefined,
                      default_expression: colDefaultExpr.trim() || undefined,
                      ttl: colTtl.trim() || undefined,
                      comment: colComment.trim() || undefined,
                    },
                    {
                      after: colAfter.trim() || undefined,
                      if_not_exists: true,
                    },
                  );
                  setDialog(null);
                  await loadTableDetail(selectedDb, selectedTable.name);
                }, `Колонка "${colName}" добавлена`);
              }}
            >
              <div className="ch-modal-body">
                <div className="field">
                  <label>Имя колонки *</label>
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                    placeholder="volume"
                    value={colName}
                    onChange={(e) => setColName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Тип данных *</label>
                  <input
                    type="text"
                    list="types-list"
                    required
                    placeholder="Float64"
                    value={colType}
                    onChange={(e) => setColType(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Кодек сжатия</label>
                  <select value={colCodec} onChange={(e) => setColCodec(e.target.value)}>
                    <option value="">По умолчанию</option>
                    {(tableOptions?.codecs ?? []).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Разместить после колонки (опционально)</label>
                  <select value={colAfter} onChange={(e) => setColAfter(e.target.value)}>
                    <option value="">В конец таблицы</option>
                    <option value="FIRST">В самое начало (FIRST)</option>
                    {selectedTable.columns?.map((c) => (
                      <option key={c.name} value={c.name}>
                        После {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="ch-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn" disabled={busy || !colName.trim()}>
                  {busy ? "Добавление..." : "Добавить колонку"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 4. Modify Column Modal */}
      {dialog?.kind === "modify-column" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="ch-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="ch-modal-head">
              <h3>Изменить колонку {dialog.column.name}</h3>
              <button type="button" className="ch-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await modifyColumn(selectedDb, selectedTable.name, {
                    name: dialog.column.name,
                    type: colType,
                    codec: colCodec.trim() || undefined,
                    default_expression: colDefaultExpr.trim() || undefined,
                    ttl: colTtl.trim() || undefined,
                    comment: colComment.trim() || undefined,
                  });
                  setDialog(null);
                  await loadTableDetail(selectedDb, selectedTable.name);
                }, `Колонка "${dialog.column.name}" изменена`);
              }}
            >
              <div className="ch-modal-body">
                <div className="field">
                  <label>Новый тип данных *</label>
                  <input
                    type="text"
                    list="types-list"
                    required
                    value={colType}
                    onChange={(e) => setColType(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Кодек сжатия</label>
                  <input
                    type="text"
                    placeholder="ZSTD(1) или DoubleDelta, LZ4"
                    value={colCodec}
                    onChange={(e) => setColCodec(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>TTL выражение</label>
                  <input
                    type="text"
                    placeholder="timestamp + INTERVAL 30 DAY"
                    value={colTtl}
                    onChange={(e) => setColTtl(e.target.value)}
                  />
                </div>
              </div>
              <div className="ch-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn" disabled={busy || !colType.trim()}>
                  {busy ? "Сохранение..." : "Сохранить изменения"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 5. Rename Table Modal */}
      {dialog?.kind === "rename-table" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="ch-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="ch-modal-head">
              <h3>Переименовать таблицу {selectedTable.name}</h3>
              <button type="button" className="ch-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await renameTable(selectedDb, selectedTable.name, newName);
                  setDialog(null);
                  await loadTables(selectedDb, true);
                }, `Таблица переименована в "${newName}"`);
              }}
            >
              <div className="ch-modal-body">
                <div className="field">
                  <label>Новое имя таблицы *</label>
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="ch-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn" disabled={busy || !newName.trim()}>
                  {busy ? "Переименование..." : "Переименовать"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 6. Rename Column Modal */}
      {dialog?.kind === "rename-column" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="ch-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="ch-modal-head">
              <h3>Переименовать колонку {dialog.column.name}</h3>
              <button type="button" className="ch-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await renameColumn(selectedDb, selectedTable.name, dialog.column.name, newName);
                  setDialog(null);
                  await loadTableDetail(selectedDb, selectedTable.name);
                }, `Колонка переименована в "${newName}"`);
              }}
            >
              <div className="ch-modal-body">
                <div className="field">
                  <label>Новое имя колонки *</label>
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="ch-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn" disabled={busy || !newName.trim()}>
                  {busy ? "Переименование..." : "Переименовать"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 7. Confirm Danger Dialog */}
      {dialog?.kind === "confirm-danger" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="ch-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="ch-modal-head">
              <h3 style={{ color: "#ff8c8c" }}>⚠️ {dialog.title}</h3>
              <button type="button" className="ch-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <div className="ch-modal-body">
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: "1.5" }}>{dialog.prompt}</p>
            </div>
            <div className="ch-modal-foot">
              <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="danger-btn"
                disabled={busy}
                onClick={() => {
                  run(async () => {
                    await dialog.onConfirm();
                    setDialog(null);
                  });
                }}
              >
                {busy ? "Выполнение..." : dialog.actionName}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* 8. View Process Query Modal */}
      {dialog?.kind === "view-process-query" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="ch-modal-window is-large" onClick={(e) => e.stopPropagation()}>
            <div className="ch-modal-head">
              <h3>SQL запрос процесса {dialog.proc.query_id}</h3>
              <button type="button" className="ch-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <div className="ch-modal-body">
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                <span>Пользователь: <strong>{dialog.proc.user}</strong></span>
                <span>Длительность: <strong>{dialog.proc.elapsed_seconds.toFixed(2)}s</strong></span>
                <span>Память: <strong>{formatBytes(dialog.proc.memory_usage)}</strong></span>
              </div>
              <pre className="ch-ddl-box">{dialog.proc.query}</pre>
            </div>
            <div className="ch-modal-foot">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => copyText("proc_sql", dialog.proc.query)}
              >
                {copiedKey === "proc_sql" ? "✓ Скопировано!" : "📋 Копировать"}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setSqlQuery(dialog.proc.query);
                  setActiveTab("console");
                  setDialog(null);
                }}
              >
                Открыть в SQL Консоли
              </button>
              <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      <datalist id="types-list">
        {(tableOptions?.data_types ?? []).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
