import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addColumn,
  analyzeTable,
  createDatabase,
  createIndex,
  createSchema,
  createTable,
  dropColumn,
  dropDatabase,
  dropIndex,
  dropPartition,
  dropSchema,
  dropTable,
  executePostgresQuery,
  fetchPostgresInfo,
  fetchTableInfo,
  formatBytes,
  formatUptime,
  getMetrics,
  getTableOptions,
  isSystemDatabase,
  isSystemSchema,
  killProcess,
  listDatabases,
  listIndexes,
  listLocks,
  listPartitions,
  listProcesses,
  listSchemas,
  listTables,
  listTablespaces,
  modifyColumn,
  previewTableData,
  reindex,
  renameColumn,
  renameTable,
  truncateTable,
  vacuumTable,
  type PgColumn,
  type PgDatabase,
  type PgIndex,
  type PgLock,
  type PgMetric,
  type PgProcess,
  type PgQueryResult,
  type PgSchema,
  type PgServerInfo,
  type PgTable,
  type PgTableOptions,
  type PgTablePartition,
  type PgTablespace,
} from "../../api/postgresql";
import "../../styles/tables.css";
import "../SchedulerPanel/SchedulerPanel.css";
import "./PostgresManagerPanel.css";
import PostgresCreateTableModal from "./PostgresCreateTableModal";
import { useNotify } from "../../notifications";

type MainTab = "explorer" | "console" | "processes" | "system";
type TableDetailTab = "columns" | "preview" | "indexes" | "partitions" | "ddl";

type Dialog =
  | { kind: "create-db" }
  | { kind: "create-schema" }
  | { kind: "create-table" }
  | { kind: "rename-table" }
  | { kind: "vacuum-table" }
  | { kind: "add-column" }
  | { kind: "rename-column"; column: PgColumn }
  | { kind: "modify-column"; column: PgColumn }
  | { kind: "create-index" }
  | {
      kind: "confirm-danger";
      title: string;
      prompt: string;
      actionName: string;
      onConfirm: () => Promise<void>;
    }
  | { kind: "view-process-query"; proc: PgProcess };

const PG_SQL_PRESETS = [
  {
    name: "Топ-10 самых больших таблиц",
    sql: `SELECT schemaname || '.' || relname AS table,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       pg_size_pretty(pg_relation_size(relid)) AS data_size,
       pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
       n_live_tup AS live_rows,
       n_dead_tup AS dead_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;`,
  },
  {
    name: "Размер всех баз данных",
    sql: `SELECT datname AS database_name,
       pg_size_pretty(pg_database_size(datname)) AS size,
       numbackends AS active_connections
FROM pg_stat_database
WHERE datistemplate = false
ORDER BY pg_database_size(datname) DESC;`,
  },
  {
    name: "Активность и долгие запросы",
    sql: `SELECT pid, usename, client_addr, state,
       now() - query_start AS duration,
       wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE state != 'idle' AND pid != pg_backend_pid()
ORDER BY query_start ASC;`,
  },
  {
    name: "Размеры и использование индексов",
    sql: `SELECT schemaname || '.' || relname AS table_name,
       indexrelname AS index_name,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
       idx_scan AS number_of_scans,
       idx_tup_read AS tuples_read,
       idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;`,
  },
  {
    name: "Коэффициент попадания в кэш (Cache Hit Ratio)",
    sql: `SELECT sum(heap_blks_read) as heap_read,
       sum(heap_blks_hit)  as heap_hit,
       round(sum(heap_blks_hit)::numeric / (sum(heap_blks_hit) + sum(heap_blks_read) + 0.0001) * 100, 2) as hit_ratio_pct
FROM pg_statio_user_tables;`,
  },
  {
    name: "Таблицы с наибольшим числом мертвых строк (Bloat)",
    sql: `SELECT schemaname || '.' || relname AS table_name,
       n_live_tup AS live_tuples,
       n_dead_tup AS dead_tuples,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio_pct,
       last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 20;`,
  },
];

function classifyType(t: string): "is-number" | "is-string" | "is-date" | "is-complex" {
  const low = t.toLowerCase();
  if (
    low.includes("int") ||
    low.includes("numeric") ||
    low.includes("decimal") ||
    low.includes("real") ||
    low.includes("double") ||
    low.includes("float") ||
    low.includes("serial")
  ) {
    return "is-number";
  }
  if (low.includes("date") || low.includes("time") || low.includes("timestamp") || low.includes("interval")) {
    return "is-date";
  }
  if (
    low.includes("json") ||
    low.includes("array") ||
    low.includes("[]") ||
    low.includes("uuid") ||
    low.includes("bytea") ||
    low.includes("record")
  ) {
    return "is-complex";
  }
  return "is-string";
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
    <div className="table-scroll table-scroll-fill pg-result-scroll">
      <table className="data-table pg-result-table">
        <thead>
          <tr>
            <th className="sticky-col pg-row-num">#</th>
            {columns.map((col, idx) => (
              <th
                key={`${col}-${idx}`}
                className="pg-col-head"
                title={types?.[idx] ? `${col}: ${types[idx]}` : col}
              >
                <span className="pg-col-name">{col}</span>
                {types?.[idx] ? <span className="pg-col-type">{types[idx]}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx}>
              <td className="sticky-col pg-row-num muted">{rIdx + 1}</td>
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="mono pg-cell"
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
      className="pg-modal-backdrop"
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

export default function PostgresManagerPanel() {
  const notify = useNotify();
  const [info, setInfo] = useState<PgServerInfo | null>(null);
  const [infoChecked, setInfoChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("explorer");

  // Explorer state
  const [databases, setDatabases] = useState<PgDatabase[]>([]);
  const [schemas, setSchemas] = useState<PgSchema[]>([]);
  const [tables, setTables] = useState<PgTable[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [selectedSchema, setSelectedSchema] = useState("");
  const [selectedTable, setSelectedTable] = useState<PgTable | null>(null);
  const [tableDetailTab, setTableDetailTab] = useState<TableDetailTab>("columns");

  // Filters & search
  const [dbFilter, setDbFilter] = useState("");
  const [schemaFilter, setSchemaFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [tableKindFilter, setTableKindFilter] = useState("all");
  const [tableSort, setTableSort] = useState<"name" | "rows" | "size">("name");
  const [includeSystemSchemas, setIncludeSystemSchemas] = useState(false);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Preview state
  const [previewData, setPreviewData] = useState<PgQueryResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLimit, setPreviewLimit] = useState(50);
  const [previewWhere, setPreviewWhere] = useState("");
  const [previewOrderBy, setPreviewOrderBy] = useState("");

  // Indexes state
  const [indexes, setIndexes] = useState<PgIndex[]>([]);
  const [indexesLoading, setIndexesLoading] = useState(false);

  // Partitions state
  const [partitions, setPartitions] = useState<PgTablePartition[]>([]);
  const [partitionsLoading, setPartitionsLoading] = useState(false);

  // Processes & Locks state
  const [procTab, setProcTab] = useState<"activity" | "locks">("activity");
  const [processes, setProcesses] = useState<PgProcess[]>([]);
  const [locks, setLocks] = useState<PgLock[]>([]);
  const [procLoading, setProcLoading] = useState(false);
  const [procAutoRefresh, setProcAutoRefresh] = useState(0);
  const [procFilter, setProcFilter] = useState("");
  const [locksFilter, setLocksFilter] = useState("");

  // Storage & System state
  const [tablespaces, setTablespaces] = useState<PgTablespace[]>([]);
  const [metrics, setMetrics] = useState<PgMetric[]>([]);
  const [metricsFilter, setMetricsFilter] = useState("");
  const [systemLoading, setSystemLoading] = useState(false);

  // SQL Console state
  const [sqlQuery, setSqlQuery] = useState("SELECT 1;");
  const [sqlMaxRows, setSqlMaxRows] = useState(100);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlResult, setSqlResult] = useState<PgQueryResult | null>(null);
  const [sqlError, setSqlError] = useState("");

  // Modals form state
  const [dbName, setDbName] = useState("");
  const [dbOwner, setDbOwner] = useState("");
  const [dbEncoding, setDbEncoding] = useState("UTF8");
  const [dbTablespace, setDbTablespace] = useState("");

  const [schemaName, setSchemaName] = useState("");
  const [schemaOwner, setSchemaOwner] = useState("");

  const [tableOptions, setTableOptions] = useState<PgTableOptions | null>(null);
  const [tableOptionsLoading, setTableOptionsLoading] = useState(false);
  const [tableOptionsError, setTableOptionsError] = useState("");

  const [newName, setNewName] = useState("");
  const [newSchema, setNewSchema] = useState("");

  const [colName, setColName] = useState("");
  const [colType, setColType] = useState("text");
  const [colNullable, setColNullable] = useState(true);
  const [colDefaultExpr, setColDefaultExpr] = useState("");
  const [colIsIdentity, setColIsIdentity] = useState(false);
  const [colIdentityGen, setColIdentityGen] = useState("BY DEFAULT");
  const [colPrimaryKey, setColPrimaryKey] = useState(false);
  const [colUnique, setColUnique] = useState(false);
  const [colComment, setColComment] = useState("");

  const [indexName, setIndexName] = useState("");
  const [indexCols, setIndexCols] = useState<string[]>([]);
  const [indexMethod, setIndexMethod] = useState("btree");
  const [indexUnique, setIndexUnique] = useState(false);
  const [indexConcurrently, setIndexConcurrently] = useState(false);
  const [indexWhere, setIndexWhere] = useState("");
  const [indexTablespace, setIndexTablespace] = useState("");

  const [vacuumFull, setVacuumFull] = useState(false);
  const [vacuumAnalyze, setVacuumAnalyze] = useState(true);
  const [vacuumFreeze, setVacuumFreeze] = useState(false);

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
      const data = await fetchPostgresInfo();
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

  const loadSchemas = useCallback(async (db: string, preserveSelection = true) => {
    if (!db) {
      setSchemas([]);
      setSelectedSchema("");
      return;
    }
    setLoading(true);
    try {
      const list = await listSchemas({ database: db, include_system: includeSystemSchemas });
      setSchemas(list);
      setSelectedSchema((prev) => {
        if (preserveSelection && prev && list.some((item) => item.name === prev)) {
          return prev;
        }
        const publicSchema = list.find((item) => item.name === "public");
        const nonSys = list.find((item) => !isSystemSchema(item.name));
        return publicSchema?.name ?? nonSys?.name ?? list[0]?.name ?? "";
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [includeSystemSchemas, notify]);

  const loadTables = useCallback(async (db: string, schema: string, preserveSelection = true) => {
    if (!db || !schema) {
      setTables([]);
      setSelectedTable(null);
      return;
    }
    setLoading(true);
    try {
      const list = await listTables({ database: db, schema });
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

  const loadTableDetail = useCallback(async (db: string, schema: string, name: string) => {
    try {
      const full = await fetchTableInfo(db, schema, name);
      setSelectedTable(full);
      setTables((prev) => prev.map((t) => (t.name === name ? full : t)));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    }
  }, [notify]);

  const loadPreview = useCallback(async (db: string, schema: string, tbl: string) => {
    if (!db || !schema || !tbl) return;
    setPreviewLoading(true);
    try {
      const res = await previewTableData({
        database: db,
        schema,
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

  const loadIndexes = useCallback(async (db: string, schema: string, tbl: string) => {
    if (!db || !schema || !tbl) return;
    setIndexesLoading(true);
    try {
      const list = await listIndexes(db, schema, tbl);
      setIndexes(list);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIndexesLoading(false);
    }
  }, [notify]);

  const loadPartitions = useCallback(async (db: string, schema: string, tbl: string) => {
    if (!db || !schema || !tbl) return;
    setPartitionsLoading(true);
    try {
      const list = await listPartitions(db, schema, tbl);
      setPartitions(list);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPartitionsLoading(false);
    }
  }, [notify]);

  const loadProcessesAndLocks = useCallback(async () => {
    setProcLoading(true);
    try {
      const [pList, lList] = await Promise.all([
        listProcesses(selectedDb || undefined),
        listLocks(selectedDb || undefined),
      ]);
      setProcesses(pList);
      setLocks(lList);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setProcLoading(false);
    }
  }, [selectedDb, notify]);

  const loadSystem = useCallback(async () => {
    setSystemLoading(true);
    try {
      const [tsList, mList] = await Promise.all([
        listTablespaces(),
        getMetrics(selectedDb || undefined),
      ]);
      setTablespaces(tsList);
      setMetrics(mList);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSystemLoading(false);
    }
  }, [selectedDb, notify]);

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

  // Initial load
  useEffect(() => {
    void loadServerInfo();
    void loadDatabases(false);
  }, [loadServerInfo, loadDatabases]);

  // Load schemas on database change
  useEffect(() => {
    if (selectedDb) {
      loadSchemas(selectedDb, false);
    }
  }, [selectedDb, loadSchemas]);

  // Load tables on schema change
  useEffect(() => {
    if (selectedDb && selectedSchema) {
      loadTables(selectedDb, selectedSchema, false);
    }
  }, [selectedDb, selectedSchema, loadTables]);

  // Load sub-tab data when sub-tab or table selection changes
  useEffect(() => {
    if (selectedDb && selectedSchema && selectedTable) {
      if (tableDetailTab === "preview") {
        loadPreview(selectedDb, selectedSchema, selectedTable.name);
      } else if (tableDetailTab === "indexes") {
        loadIndexes(selectedDb, selectedSchema, selectedTable.name);
      } else if (tableDetailTab === "partitions") {
        loadPartitions(selectedDb, selectedSchema, selectedTable.name);
      }
    }
  }, [selectedDb, selectedSchema, selectedTable?.name, tableDetailTab, loadPreview, loadIndexes, loadPartitions]);

  // Processes tab load
  useEffect(() => {
    if (activeTab === "processes") {
      loadProcessesAndLocks();
    }
  }, [activeTab, loadProcessesAndLocks]);

  // Auto-refresh for processes tab
  useEffect(() => {
    if (activeTab !== "processes" || procAutoRefresh <= 0) return;
    const interval = setInterval(loadProcessesAndLocks, procAutoRefresh);
    return () => clearInterval(interval);
  }, [activeTab, procAutoRefresh, loadProcessesAndLocks]);

  // System tab load
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
      const res = await executePostgresQuery(sqlQuery, sqlMaxRows, selectedDb || undefined);
      setSqlResult(res);
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : String(err));
      setSqlResult(null);
    } finally {
      setSqlRunning(false);
    }
  }, [sqlQuery, sqlMaxRows, selectedDb]);

  const handleSqlKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runSqlQuery();
    }
  };

  // Filtered databases
  const filteredDbs = useMemo(() => {
    const q = dbFilter.trim().toLowerCase();
    if (!q) return databases;
    return databases.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.owner.toLowerCase().includes(q) ||
        item.encoding.toLowerCase().includes(q),
    );
  }, [databases, dbFilter]);

  // Filtered schemas
  const filteredSchemas = useMemo(() => {
    const q = schemaFilter.trim().toLowerCase();
    if (!q) return schemas;
    return schemas.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || item.owner.toLowerCase().includes(q),
    );
  }, [schemas, schemaFilter]);

  // Filtered & sorted tables
  const filteredTables = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    let res = tables;
    if (q) {
      res = res.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.owner.toLowerCase().includes(q) ||
          item.comment.toLowerCase().includes(q),
      );
    }
    if (tableKindFilter !== "all") {
      res = res.filter((item) => item.kind === tableKindFilter);
    }
    return [...res].sort((a, b) => {
      if (tableSort === "rows") return (b.total_rows ?? 0) - (a.total_rows ?? 0);
      if (tableSort === "size") return (b.total_bytes ?? 0) - (a.total_bytes ?? 0);
      return a.name.localeCompare(b.name);
    });
  }, [tables, tableFilter, tableKindFilter, tableSort]);

  // Filtered processes
  const filteredProcesses = useMemo(() => {
    const q = procFilter.trim().toLowerCase();
    if (!q) return processes;
    return processes.filter(
      (p) =>
        String(p.pid).includes(q) ||
        p.user.toLowerCase().includes(q) ||
        p.query.toLowerCase().includes(q) ||
        p.application_name.toLowerCase().includes(q),
    );
  }, [processes, procFilter]);

  // Filtered locks
  const filteredLocks = useMemo(() => {
    const q = locksFilter.trim().toLowerCase();
    if (!q) return locks;
    return locks.filter(
      (l) =>
        String(l.pid).includes(q) ||
        l.locktype.toLowerCase().includes(q) ||
        l.relation.toLowerCase().includes(q) ||
        l.mode.toLowerCase().includes(q) ||
        l.query.toLowerCase().includes(q),
    );
  }, [locks, locksFilter]);

  // Filtered metrics
  const filteredMetrics = useMemo(() => {
    const q = metricsFilter.trim().toLowerCase();
    if (!q) return metrics;
    return metrics.filter(
      (m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
    );
  }, [metrics, metricsFilter]);

  const currentDb = databases.find((item) => item.name === selectedDb) ?? null;
  const currentSchema = schemas.find((item) => item.name === selectedSchema) ?? null;
  const isSysDb = isSystemDatabase(selectedDb);
  const isSysSchema = isSystemSchema(selectedSchema);

  return (
    <div className="pg-panel">
      {/* Header Bar */}
      <header className="pg-header">
        <div className="pg-title-wrap">
          <h1>PostgreSQL Studio</h1>
          <div className={`pg-live-indicator ${info ? "" : "is-offline"}`}>
            <span className="dot" />
            {info ? "Online" : infoChecked ? "Offline" : "Connecting..."}
          </div>
        </div>

        {info && (
          <div className="pg-stats-ribbon">
            <span className="pg-chip" title="Версия PostgreSQL">
              <span className="label">v</span>
              <strong>{info.version}</strong>
            </span>
            <span className="pg-chip" title="База по умолчанию">
              <span className="label">db</span>
              <span>{info.current_database}</span>
            </span>
            <span className="pg-chip" title="Пользователь">
              <span className="label">user</span>
              <span>{info.currentUser}</span>
            </span>
            <span className="pg-chip" title="Кодировка">
              <span className="label">enc</span>
              <span>{info.server_encoding}</span>
            </span>
            <span className="pg-chip" title="Часовой пояс">
              <span className="label">tz</span>
              <span>{info.timezone}</span>
            </span>
            <span className="pg-chip" title="Время непрерывной работы">
              <span className="label">uptime</span>
              <span>{formatUptime(info.uptime_seconds)}</span>
            </span>
            <span
              className="pg-chip is-btn"
              onClick={() => setActiveTab("processes")}
              title="Нажмите для перехода к процессам"
            >
              <span className="label">active backends</span>
              <strong>{processes.length > 0 ? processes.length : "0"}</strong>
            </span>
          </div>
        )}

        <div className="pg-header-actions">
          {/* Main Navigation Tabs */}
          <nav className="pg-nav-tabs">
            <button
              type="button"
              className={`pg-nav-tab ${activeTab === "explorer" ? "is-active" : ""}`}
              onClick={() => setActiveTab("explorer")}
            >
              🗄 Проводник
            </button>
            <button
              type="button"
              className={`pg-nav-tab ${activeTab === "console" ? "is-active" : ""}`}
              onClick={() => setActiveTab("console")}
            >
              ⚡ SQL Консоль
            </button>
            <button
              type="button"
              className={`pg-nav-tab ${activeTab === "processes" ? "is-active" : ""}`}
              onClick={() => setActiveTab("processes")}
            >
              ⏱ Процессы и Блокировки
              {processes.length > 0 && <span className="pg-tab-badge">{processes.length}</span>}
            </button>
            <button
              type="button"
              className={`pg-nav-tab ${activeTab === "system" ? "is-active" : ""}`}
              onClick={() => setActiveTab("system")}
            >
              📊 Хранилище и Метрики
            </button>
          </nav>

          <button
            type="button"
            className="secondary-btn sm"
            onClick={() => {
              loadServerInfo();
              if (activeTab === "explorer") {
                loadDatabases(true);
                if (selectedDb) loadSchemas(selectedDb, true);
                if (selectedDb && selectedSchema) loadTables(selectedDb, selectedSchema, true);
              } else if (activeTab === "processes") {
                loadProcessesAndLocks();
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
      <main className="pg-content">
        {/* ================= TAB 1: EXPLORER ================= */}
        {activeTab === "explorer" && (
          <div className="pg-explorer">
            {/* Column 1: Databases & Schemas Pane */}
            <section className="pg-pane">
              <div className="pg-pane-header">
                <h3>🗄 Базы данных ({filteredDbs.length})</h3>
                <button
                  type="button"
                  className="primary-btn sm"
                  onClick={() => {
                    setDbName("");
                    setDbOwner("");
                    setDbEncoding("UTF8");
                    setDbTablespace("");
                    setDialog({ kind: "create-db" });
                  }}
                  title="Создать новую базу данных"
                >
                  + База
                </button>
              </div>

              <div className="pg-search-box">
                <input
                  type="text"
                  placeholder="Поиск баз..."
                  value={dbFilter}
                  onChange={(e) => setDbFilter(e.target.value)}
                />
                {dbFilter && (
                  <button type="button" className="pg-search-clear" onClick={() => setDbFilter("")}>
                    ✕
                  </button>
                )}
              </div>

              <div className="pg-tree-list" style={{ maxHeight: "40%" }}>
                {filteredDbs.map((db) => {
                  const isSelected = db.name === selectedDb;
                  const isSys = isSystemDatabase(db.name);
                  return (
                    <div
                      key={db.name}
                      className={`pg-tree-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedDb(db.name);
                        loadSchemas(db.name, false);
                      }}
                    >
                      <div className="pg-tree-item-main">
                        <span className="pg-tree-name">
                          {isSys ? "🔒" : "📁"} {db.name}
                        </span>
                        <span className="pg-tag">{db.encoding || "UTF8"}</span>
                      </div>
                      <div className="pg-tree-item-meta">
                        <span>{formatBytes(db.size_bytes)}</span>
                        {db.num_backends > 0 ? <span>• {db.num_backends} соед.</span> : null}
                        {!isSys && (
                          <button
                            type="button"
                            className="danger-btn icon-only sm"
                            style={{ marginLeft: "auto", padding: "0.1rem 0.35rem", fontSize: "0.7rem", lineHeight: 1 }}
                            title={`Удалить базу данных ${db.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDialog({
                                kind: "confirm-danger",
                                title: `Удаление базы ${db.name}`,
                                prompt: `Вы действительно хотите удалить базу данных "${db.name}"? Это действие необратимо!`,
                                actionName: "Удалить базу (DROP DATABASE)",
                                onConfirm: async () => {
                                  await dropDatabase(db.name, { if_exists: true, force: true });
                                  if (selectedDb === db.name) setSelectedDb("");
                                  await loadDatabases(false);
                                },
                              });
                            }}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Schemas List in Selected DB */}
              <div className="pg-pane-header" style={{ marginTop: "0.5rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "0.5rem" }}>
                <h3>📂 Схемы ({filteredSchemas.length}){currentDb ? ` (${currentDb.name})` : ""}</h3>
                <button
                  type="button"
                  className="primary-btn sm"
                  disabled={!selectedDb || isSysDb}
                  onClick={() => {
                    setSchemaName("");
                    setSchemaOwner("");
                    setDialog({ kind: "create-schema" });
                  }}
                  title="Создать новую схему в выбранной базе"
                >
                  + Схема
                </button>
              </div>

              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <div className="pg-search-box" style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Поиск схем..."
                    value={schemaFilter}
                    onChange={(e) => setSchemaFilter(e.target.value)}
                  />
                  {schemaFilter && (
                    <button type="button" className="pg-search-clear" onClick={() => setSchemaFilter("")}>
                      ✕
                    </button>
                  )}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.7rem", cursor: "pointer" }} title="Показывать системные схемы pg_catalog, pg_toast, etc.">
                  <input
                    type="checkbox"
                    checked={includeSystemSchemas}
                    onChange={(e) => {
                      setIncludeSystemSchemas(e.target.checked);
                      if (selectedDb) {
                        listSchemas({ database: selectedDb, include_system: e.target.checked }).then(setSchemas);
                      }
                    }}
                  />
                  Sys
                </label>
              </div>

              <div className="pg-tree-list">
                {filteredSchemas.map((sch) => {
                  const isSelected = sch.name === selectedSchema;
                  const isSys = isSystemSchema(sch.name);
                  return (
                    <div
                      key={sch.name}
                      className={`pg-tree-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedSchema(sch.name);
                        loadTables(selectedDb, sch.name, false);
                      }}
                    >
                      <div className="pg-tree-item-main">
                        <span className="pg-tree-name">
                          {isSys ? "⚙️" : "📂"} {sch.name}
                        </span>
                        <span className="pg-tag">{sch.owner || "postgres"}</span>
                      </div>
                      <div className="pg-tree-item-meta">
                        <span>{sch.tables_count ?? 0} табл.</span>
                        {sch.total_bytes ? <span>• {formatBytes(sch.total_bytes)}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {currentSchema && !isSysSchema && !isSysDb && (
                <div className="pg-pane-footer">
                  <button
                    type="button"
                    className="danger-btn sm"
                    style={{ width: "100%" }}
                    onClick={() => {
                      setDialog({
                        kind: "confirm-danger",
                        title: `Удаление схемы ${selectedSchema}`,
                        prompt: `Вы действительно хотите удалить схему "${selectedSchema}" в базе "${selectedDb}"? Все её таблицы будут удалены (CASCADE).`,
                        actionName: "Удалить схему",
                        onConfirm: async () => {
                          await dropSchema(selectedDb, selectedSchema, { cascade: true });
                          await loadSchemas(selectedDb, false);
                        },
                      });
                    }}
                  >
                    🗑 Удалить схему {selectedSchema}
                  </button>
                </div>
              )}
            </section>

            {/* Column 2: Tables Pane */}
            <section className="pg-pane">
              <div className="pg-pane-header">
                <h3>📑 Таблицы ({filteredTables.length})</h3>
                <button
                  type="button"
                  className="primary-btn sm"
                  disabled={!selectedDb || !selectedSchema || isSysSchema}
                  onClick={() => {
                    setDialog({ kind: "create-table" });
                    if (!tableOptions) void loadTableOptions();
                  }}
                  title="Создать новую таблицу в выбранной схеме"
                >
                  + Таблица
                </button>
              </div>

              <div style={{ display: "flex", gap: "0.35rem" }}>
                <div className="pg-search-box" style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Поиск таблиц..."
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                  />
                  {tableFilter && (
                    <button type="button" className="pg-search-clear" onClick={() => setTableFilter("")}>
                      ✕
                    </button>
                  )}
                </div>
                <select
                  value={tableSort}
                  onChange={(e) => setTableSort(e.target.value as "name" | "rows" | "size")}
                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
                  title="Сортировка"
                >
                  <option value="name">Имя</option>
                  <option value="rows">Строки</option>
                  <option value="size">Размер</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "0.3rem" }}>
                <select
                  value={tableKindFilter}
                  onChange={(e) => setTableKindFilter(e.target.value)}
                  style={{ fontSize: "0.75rem", width: "100%" }}
                  title="Фильтр по типу объекта"
                >
                  <option value="all">Все типы объектов</option>
                  <option value="r">Таблицы (ordinary)</option>
                  <option value="v">Представления (views)</option>
                  <option value="m">Мат. представления (matviews)</option>
                  <option value="p">Секционированные (partitioned)</option>
                  <option value="f">Внешние таблицы (foreign)</option>
                </select>
              </div>

              <div className="pg-tree-list">
                {filteredTables.length === 0 && (
                  <div className="pg-empty">
                    <span className="icon">📭</span>
                    <span>Таблицы не найдены</span>
                  </div>
                )}
                {filteredTables.map((tbl) => {
                  const isSelected = tbl.name === selectedTable?.name;
                  const kindLabel =
                    tbl.kind === "v"
                      ? "VIEW"
                      : tbl.kind === "m"
                      ? "MATVIEW"
                      : tbl.kind === "p"
                      ? "PARTITIONED"
                      : tbl.kind === "f"
                      ? "FOREIGN"
                      : "TABLE";
                  const kindClass =
                    tbl.kind === "v"
                      ? "is-view"
                      : tbl.kind === "m"
                      ? "is-matview"
                      : tbl.kind === "p"
                      ? "is-partitioned"
                      : "";
                  return (
                    <div
                      key={tbl.name}
                      className={`pg-tree-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedTable(tbl);
                        loadTableDetail(selectedDb, selectedSchema, tbl.name);
                      }}
                    >
                      <div className="pg-tree-item-main">
                        <span className="pg-tree-name">{tbl.name}</span>
                        <span className={`pg-tag ${kindClass}`}>{kindLabel}</span>
                      </div>
                      <div className="pg-tree-item-meta">
                        <span>{tbl.total_rows.toLocaleString()} строк</span>
                        <span>• {formatBytes(tbl.total_bytes)}</span>
                        {tbl.persistence === "u" ? <span className="pg-tag is-unlogged">UNLOGGED</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Column 3: Table Detail Inspector */}
            <section className="pg-table-detail">
              {selectedTable ? (
                <>
                  <div className="pg-detail-hero">
                    <div className="pg-detail-title-bar">
                      <div className="pg-breadcrumbs">
                        <span className="db">{selectedDb}</span>
                        <span className="sep">/</span>
                        <span className="schema">{selectedTable.schema}</span>
                        <span className="sep">/</span>
                        <span className="tbl">{selectedTable.name}</span>
                        <span className="pg-tag is-partitioned" style={{ marginLeft: "0.4rem" }}>
                          {selectedTable.kind === "v"
                            ? "VIEW"
                            : selectedTable.kind === "m"
                            ? "MATVIEW"
                            : selectedTable.kind === "p"
                            ? "PARTITIONED TABLE"
                            : "TABLE"}
                        </span>
                        {selectedTable.persistence === "u" && (
                          <span className="pg-tag is-unlogged">UNLOGGED</span>
                        )}
                      </div>

                      <div className="pg-detail-actions">
                        <button
                          type="button"
                          className="secondary-btn sm"
                          onClick={() => {
                            setTableDetailTab("preview");
                            loadPreview(selectedDb, selectedTable.schema, selectedTable.name);
                          }}
                          title="Просмотреть данные"
                        >
                          🔍 Данные
                        </button>
                        {!isSysSchema && (
                          <>
                            <button
                              type="button"
                              className="secondary-btn sm"
                              onClick={() => {
                                setVacuumFull(false);
                                setVacuumAnalyze(true);
                                setVacuumFreeze(false);
                                setDialog({ kind: "vacuum-table" });
                              }}
                              title="Выполнить VACUUM таблицы"
                            >
                              ⚡ Vacuum
                            </button>
                            <button
                              type="button"
                              className="secondary-btn sm"
                              onClick={() => {
                                run(async () => {
                                  await analyzeTable(selectedDb, selectedTable.schema, selectedTable.name);
                                  await loadTableDetail(selectedDb, selectedTable.schema, selectedTable.name);
                                }, `ANALYZE для "${selectedTable.name}" успешно выполнен`);
                              }}
                              title="Собрать статистику (ANALYZE)"
                            >
                              📊 Analyze
                            </button>
                            <button
                              type="button"
                              className="secondary-btn sm"
                              onClick={() => {
                                setNewName(selectedTable.name);
                                setNewSchema(selectedTable.schema);
                                setDialog({ kind: "rename-table" });
                              }}
                              title="Переименовать таблицу или сменить схему"
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
                                  prompt: `Вы действительно хотите очистить (TRUNCATE) таблицу "${selectedTable.schema}.${selectedTable.name}"? Все данные будут удалены.`,
                                  actionName: "Очистить таблицу (TRUNCATE)",
                                  onConfirm: async () => {
                                    await truncateTable(selectedDb, selectedTable.schema, selectedTable.name, {
                                      restart_identity: true,
                                      cascade: true,
                                    });
                                    await loadTableDetail(selectedDb, selectedTable.schema, selectedTable.name);
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
                                  prompt: `Вы действительно хотите удалить (DROP) таблицу "${selectedTable.schema}.${selectedTable.name}"? Это действие необратимо.`,
                                  actionName: "Удалить таблицу (DROP)",
                                  onConfirm: async () => {
                                    await dropTable(selectedDb, selectedTable.schema, selectedTable.name, {
                                      cascade: true,
                                    });
                                    await loadTables(selectedDb, selectedSchema, false);
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

                    <div className="pg-stats-grid">
                      <div className="pg-stat-card">
                        <span className="lbl">Всего строк</span>
                        <span className="val">{selectedTable.total_rows.toLocaleString()}</span>
                      </div>
                      <div className="pg-stat-card">
                        <span className="lbl">Живых кортежей</span>
                        <span className="val">{selectedTable.live_tuples.toLocaleString()}</span>
                      </div>
                      <div className="pg-stat-card">
                        <span className="lbl">Мёртвых кортежей</span>
                        <span className="val" style={{ color: selectedTable.dead_tuples > 1000 ? "#ffb4b4" : undefined }}>
                          {selectedTable.dead_tuples.toLocaleString()}
                        </span>
                      </div>
                      <div className="pg-stat-card">
                        <span className="lbl">Размер данных</span>
                        <span className="val">{formatBytes(selectedTable.total_bytes)}</span>
                      </div>
                      <div className="pg-stat-card">
                        <span className="lbl">Размер индексов</span>
                        <span className="val">{formatBytes(selectedTable.index_bytes)}</span>
                      </div>
                      {selectedTable.toast_bytes > 0 && (
                        <div className="pg-stat-card">
                          <span className="lbl">TOAST размер</span>
                          <span className="val">{formatBytes(selectedTable.toast_bytes)}</span>
                        </div>
                      )}
                      {selectedTable.tablespace && (
                        <div className="pg-stat-card">
                          <span className="lbl">Tablespace</span>
                          <span className="val">{selectedTable.tablespace}</span>
                        </div>
                      )}
                      {selectedTable.last_vacuum && (
                        <div className="pg-stat-card">
                          <span className="lbl">Last Vacuum</span>
                          <span className="val" style={{ fontSize: "0.72rem" }}>{selectedTable.last_vacuum}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sub-nav inside table view */}
                  <div className="pg-sub-nav">
                    <button
                      type="button"
                      className={`pg-sub-tab ${tableDetailTab === "columns" ? "is-active" : ""}`}
                      onClick={() => setTableDetailTab("columns")}
                    >
                      📋 Структура ({selectedTable.columns?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      className={`pg-sub-tab ${tableDetailTab === "preview" ? "is-active" : ""}`}
                      onClick={() => {
                        setTableDetailTab("preview");
                        loadPreview(selectedDb, selectedTable.schema, selectedTable.name);
                      }}
                    >
                      🔍 Превью данных
                    </button>
                    <button
                      type="button"
                      className={`pg-sub-tab ${tableDetailTab === "indexes" ? "is-active" : ""}`}
                      onClick={() => {
                        setTableDetailTab("indexes");
                        loadIndexes(selectedDb, selectedTable.schema, selectedTable.name);
                      }}
                    >
                      ⚡ Индексы {indexes.length > 0 ? `(${indexes.length})` : ""}
                    </button>
                    <button
                      type="button"
                      className={`pg-sub-tab ${tableDetailTab === "partitions" ? "is-active" : ""}`}
                      onClick={() => {
                        setTableDetailTab("partitions");
                        loadPartitions(selectedDb, selectedTable.schema, selectedTable.name);
                      }}
                    >
                      📦 Партиции {partitions.length > 0 ? `(${partitions.length})` : ""}
                    </button>
                    <button
                      type="button"
                      className={`pg-sub-tab ${tableDetailTab === "ddl" ? "is-active" : ""}`}
                      onClick={() => setTableDetailTab("ddl")}
                    >
                      📜 DDL Схема
                    </button>
                  </div>

                  {/* Sub-view Area */}
                  <div className="pg-sub-view">
                    {/* Sub-tab 1: Columns */}
                    {tableDetailTab === "columns" && (
                      <div className="pg-schema-wrap">
                        <div className="pg-schema-toolbar">
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            Колонки и типы данных таблицы
                          </span>
                          {!isSysSchema && (
                            <button
                              type="button"
                              className="primary-btn sm"
                              onClick={() => {
                                setColName("");
                                setColType("text");
                                setColNullable(true);
                                setColDefaultExpr("");
                                setColIsIdentity(false);
                                setColPrimaryKey(false);
                                setColUnique(false);
                                setColComment("");
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
                                <th>Nullable</th>
                                <th>По умолчанию / Identity</th>
                                <th>Ключи</th>
                                <th>Комментарий</th>
                                {!isSysSchema && <th style={{ width: "7.5rem" }}>Действия</th>}
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
                                  <td>
                                    {col.nullable ? <span className="muted">YES</span> : <strong>NOT NULL</strong>}
                                  </td>
                                  <td className="mono">
                                    {col.is_identity ? (
                                      <span>
                                        <strong className="muted">IDENTITY</strong> ({col.identity_generation})
                                      </span>
                                    ) : col.default_expression ? (
                                      col.default_expression
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td>
                                    {col.primary_key && <span className="pg-tag" style={{ background: "rgba(255, 215, 0, 0.2)", color: "#ffd700" }}>PK</span>}
                                    {col.unique && !col.primary_key && <span className="pg-tag">UQ</span>}
                                    {!col.primary_key && !col.unique && "—"}
                                  </td>
                                  <td>{col.comment || "—"}</td>
                                  {!isSysSchema && (
                                    <td>
                                      <div style={{ display: "flex", gap: "0.3rem" }}>
                                        <button
                                          type="button"
                                          className="secondary-btn sm"
                                          onClick={() => {
                                            setColName(col.name);
                                            setColType(col.type);
                                            setColNullable(col.nullable);
                                            setColDefaultExpr(col.default_expression);
                                            setColComment(col.comment);
                                            setDialog({ kind: "modify-column", column: col });
                                          }}
                                          title="Изменить колонку"
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
                                                await dropColumn(selectedDb, selectedTable.schema, selectedTable.name, col.name, { cascade: true });
                                                await loadTableDetail(selectedDb, selectedTable.schema, selectedTable.name);
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
                      <div className="pg-preview-wrap">
                        <div className="pg-preview-controls">
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
                            placeholder="WHERE (например: id > 100)"
                            value={previewWhere}
                            onChange={(e) => setPreviewWhere(e.target.value)}
                            style={{ flex: 1, minWidth: "10rem" }}
                          />

                          <input
                            type="text"
                            placeholder="ORDER BY (например: id DESC)"
                            value={previewOrderBy}
                            onChange={(e) => setPreviewOrderBy(e.target.value)}
                            style={{ width: "12rem" }}
                          />

                          <button
                            type="button"
                            className="primary-btn sm"
                            onClick={() => loadPreview(selectedDb, selectedTable.schema, selectedTable.name)}
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

                        <div className="pg-preview-grid">
                          {previewLoading ? (
                            <div className="pg-empty">
                              <span>Загрузка выборки данных...</span>
                            </div>
                          ) : previewData && previewData.rows.length > 0 ? (
                            <QueryResultTable
                              columns={previewData.columns}
                              types={previewData.types}
                              rows={previewData.rows}
                            />
                          ) : (
                            <div className="pg-empty">
                              <span className="icon">📭</span>
                              <span>Нет строк по заданным условиям</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 3: Indexes */}
                    {tableDetailTab === "indexes" && (
                      <div className="pg-preview-wrap">
                        <div className="pg-preview-controls">
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            Индексы таблицы ({indexes.length})
                          </span>
                          <div style={{ display: "flex", gap: "0.4rem" }}>
                            <button
                              type="button"
                              className="secondary-btn sm"
                              onClick={() => loadIndexes(selectedDb, selectedTable.schema, selectedTable.name)}
                              disabled={indexesLoading}
                            >
                              🔄 Обновить
                            </button>
                            {!isSysSchema && (
                              <button
                                type="button"
                                className="primary-btn sm"
                                onClick={() => {
                                  setIndexName("");
                                  setIndexCols([selectedTable.columns[0]?.name || ""]);
                                  setIndexMethod("btree");
                                  setIndexUnique(false);
                                  setIndexConcurrently(true);
                                  setIndexWhere("");
                                  setIndexTablespace("");
                                  setDialog({ kind: "create-index" });
                                  if (!tableOptions) void loadTableOptions();
                                }}
                              >
                                + Создать индекс
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="table-scroll">
                          {indexesLoading ? (
                            <div className="pg-empty">
                              <span>Загрузка индексов...</span>
                            </div>
                          ) : indexes.length > 0 ? (
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Имя индекса</th>
                                  <th>Метод</th>
                                  <th>Колонки</th>
                                  <th>Размер</th>
                                  <th>Свойства</th>
                                  <th>Определение (DDL)</th>
                                  {!isSysSchema && <th style={{ width: "8rem" }}>Действия</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {indexes.map((idx) => (
                                  <tr key={idx.name}>
                                    <td className="mono">
                                      <strong>{idx.name}</strong>
                                    </td>
                                    <td>
                                      <span className="pg-tag">{idx.method}</span>
                                    </td>
                                    <td className="mono">{idx.columns.join(", ")}</td>
                                    <td>{formatBytes(idx.size_bytes)}</td>
                                    <td>
                                      {idx.primary && <span className="pg-tag" style={{ background: "rgba(255, 215, 0, 0.2)", color: "#ffd700" }}>PRIMARY</span>}
                                      {idx.unique && !idx.primary && <span className="pg-tag">UNIQUE</span>}
                                      {!idx.valid && <span className="pg-tag is-unlogged">INVALID</span>}
                                    </td>
                                    <td className="mono muted" style={{ maxWidth: "16rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={idx.definition}>
                                      {idx.definition}
                                    </td>
                                    {!isSysSchema && (
                                      <td>
                                        <div style={{ display: "flex", gap: "0.3rem" }}>
                                          <button
                                            type="button"
                                            className="secondary-btn sm"
                                            onClick={() => {
                                              run(async () => {
                                                await reindex({
                                                  database: selectedDb,
                                                  schema: selectedTable.schema,
                                                  name: idx.name,
                                                  concurrently: true,
                                                });
                                                await loadIndexes(selectedDb, selectedTable.schema, selectedTable.name);
                                              }, `Индекс "${idx.name}" переиндексирован`);
                                            }}
                                            title="Переиндексировать (REINDEX)"
                                          >
                                            ⚡ Reindex
                                          </button>
                                          {!idx.primary && (
                                            <button
                                              type="button"
                                              className="danger-btn sm"
                                              onClick={() => {
                                                setDialog({
                                                  kind: "confirm-danger",
                                                  title: `Удаление индекса ${idx.name}`,
                                                  prompt: `Удалить индекс "${idx.name}"?`,
                                                  actionName: "Удалить индекс (DROP INDEX)",
                                                  onConfirm: async () => {
                                                    await dropIndex(selectedDb, selectedTable.schema, idx.name, { concurrently: true });
                                                    await loadIndexes(selectedDb, selectedTable.schema, selectedTable.name);
                                                  },
                                                });
                                              }}
                                              title="Удалить индекс"
                                            >
                                              🗑
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="pg-empty">
                              <span className="icon">⚡</span>
                              <span>Индексы не найдены</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 4: Partitions */}
                    {tableDetailTab === "partitions" && (
                      <div className="pg-preview-wrap">
                        <div className="pg-preview-controls">
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            Секции / Партиции таблицы ({partitions.length})
                          </span>
                          <button
                            type="button"
                            className="secondary-btn sm"
                            onClick={() => loadPartitions(selectedDb, selectedTable.schema, selectedTable.name)}
                            disabled={partitionsLoading}
                          >
                            🔄 Обновить
                          </button>
                        </div>

                        <div className="table-scroll">
                          {partitionsLoading ? (
                            <div className="pg-empty">
                              <span>Загрузка партиций...</span>
                            </div>
                          ) : partitions.length > 0 ? (
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Схема</th>
                                  <th>Имя партиции</th>
                                  <th>Выражение (Bounds)</th>
                                  <th>Строк</th>
                                  <th>Размер</th>
                                  {!isSysSchema && <th>Действия</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {partitions.map((p) => (
                                  <tr key={p.name}>
                                    <td>{p.schema}</td>
                                    <td className="mono">
                                      <strong>{p.name}</strong>
                                    </td>
                                    <td className="mono muted">{p.expression || "—"}</td>
                                    <td>{p.total_rows.toLocaleString()}</td>
                                    <td>{formatBytes(p.total_bytes)}</td>
                                    {!isSysSchema && (
                                      <td>
                                        <button
                                          type="button"
                                          className="danger-btn sm"
                                          onClick={() => {
                                            setDialog({
                                              kind: "confirm-danger",
                                              title: `Удаление партиции ${p.name}`,
                                              prompt: `Удалить партицию "${p.name}" из таблицы "${selectedTable.name}"? Все строки в ней будут удалены.`,
                                              actionName: "Удалить партицию",
                                              onConfirm: async () => {
                                                await dropPartition({
                                                  database: selectedDb,
                                                  schema: selectedTable.schema,
                                                  table: selectedTable.name,
                                                  name: p.name,
                                                  cascade: true,
                                                });
                                                await loadPartitions(selectedDb, selectedTable.schema, selectedTable.name);
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
                            <div className="pg-empty">
                              <span className="icon">📦</span>
                              <span>Партиции не найдены (таблица не секционирована)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 5: DDL */}
                    {tableDetailTab === "ddl" && (
                      <div className="pg-ddl-wrap">
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="secondary-btn sm"
                            onClick={() => copyText("ddl", selectedTable.create_table_query)}
                          >
                            {copiedKey === "ddl" ? "✓ Скопировано!" : "📋 Копировать DDL"}
                          </button>
                        </div>
                        <pre className="pg-ddl-box">
                          {selectedTable.create_table_query || "DDL схема недоступна"}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="pg-empty">
                  <span className="icon">👈</span>
                  <span>Выберите таблицу для просмотра структуры и данных</span>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================= TAB 2: SQL CONSOLE ================= */}
        {activeTab === "console" && (
          <div className="pg-console-layout">
            <div className="pg-console-top">
              <div className="pg-console-toolbar">
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
                    style={{ fontSize: "0.78rem", maxWidth: "16rem" }}
                  >
                    <option value="" disabled>
                      ⚡ Шаблоны запросов PostgreSQL...
                    </option>
                    {PG_SQL_PRESETS.map((p) => (
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

              <div className="pg-editor-area">
                <textarea
                  ref={sqlEditorRef}
                  className="pg-sql-textarea"
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  onKeyDown={handleSqlKeyDown}
                  placeholder="Введите SQL запрос (например: SELECT * FROM pg_stat_activity)..."
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="pg-console-results">
              <div className="pg-results-meta">
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
                    {sqlResult.rows_affected > 0 && (
                      <span>Изменено строк: {sqlResult.rows_affected}</span>
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
                      onClick={() => exportCsv(sqlResult.columns, sqlResult.rows, "pg_query_result")}
                    >
                      📥 CSV
                    </button>
                    <button
                      type="button"
                      className="secondary-btn sm"
                      onClick={() => exportJson(sqlResult.columns, sqlResult.rows, "pg_query_result")}
                    >
                      📥 JSON
                    </button>
                  </div>
                )}
              </div>

              <div className="pg-preview-grid">
                {sqlError ? (
                  <div className="pg-empty" style={{ color: "#ffb4b4" }}>
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
                  <div className="pg-empty">
                    <span className="icon">⌨️</span>
                    <span>Нажмите «Выполнить» или Ctrl+Enter для запуска запроса</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: PROCESSES & LOCKS ================= */}
        {activeTab === "processes" && (
          <div className="pg-processes-layout">
            <div className="pg-proc-toolbar">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div className="pg-nav-tabs">
                  <button
                    type="button"
                    className={`pg-nav-tab ${procTab === "activity" ? "is-active" : ""}`}
                    onClick={() => setProcTab("activity")}
                  >
                    ⚡ Активность ({filteredProcesses.length})
                  </button>
                  <button
                    type="button"
                    className={`pg-nav-tab ${procTab === "locks" ? "is-active" : ""}`}
                    onClick={() => setProcTab("locks")}
                  >
                    🔒 Блокировки ({filteredLocks.length})
                  </button>
                </div>

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
                <div className="pg-search-box">
                  <input
                    type="text"
                    placeholder="Фильтр..."
                    value={procTab === "activity" ? procFilter : locksFilter}
                    onChange={(e) =>
                      procTab === "activity"
                        ? setProcFilter(e.target.value)
                        : setLocksFilter(e.target.value)
                    }
                    style={{ width: "16rem" }}
                  />
                  {(procTab === "activity" ? procFilter : locksFilter) && (
                    <button
                      type="button"
                      className="pg-search-clear"
                      onClick={() =>
                        procTab === "activity" ? setProcFilter("") : setLocksFilter("")
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={loadProcessesAndLocks}
                  disabled={procLoading}
                >
                  🔄 Обновить
                </button>
              </div>
            </div>

            <div className="table-scroll">
              {procTab === "activity" ? (
                filteredProcesses.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>PID</th>
                        <th>Пользователь</th>
                        <th>База</th>
                        <th>Приложение / Клиент</th>
                        <th>Состояние (State)</th>
                        <th>Ожидание (Wait Event)</th>
                        <th>Запрос</th>
                        <th style={{ width: "8rem" }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProcesses.map((proc) => {
                        const isIdle = proc.state === "idle";
                        return (
                          <tr key={proc.pid}>
                            <td className="mono" style={{ fontSize: "0.75rem" }}>
                              {proc.pid}
                            </td>
                            <td>
                              <strong>{proc.user}</strong>
                            </td>
                            <td>{proc.database}</td>
                            <td>
                              <span>{proc.application_name || "—"}</span>
                              {proc.client_addr && <span className="muted"> ({proc.client_addr})</span>}
                            </td>
                            <td>
                              <span className={`pg-tag ${isIdle ? "" : "is-view"}`}>
                                {proc.state || "active"}
                              </span>
                            </td>
                            <td className="muted">
                              {proc.wait_event ? `${proc.wait_event_type}: ${proc.wait_event}` : "—"}
                            </td>
                            <td
                              className="mono"
                              style={{
                                maxWidth: "20rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                cursor: "pointer",
                              }}
                              onClick={() => setDialog({ kind: "view-process-query", proc })}
                              title="Нажмите для просмотра полного текста запроса"
                            >
                              {proc.query || "—"}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "0.3rem" }}>
                                <button
                                  type="button"
                                  className="secondary-btn sm"
                                  onClick={() => {
                                    run(async () => {
                                      await killProcess(proc.pid, false);
                                      await loadProcessesAndLocks();
                                    }, `Запрос PID ${proc.pid} отменен`);
                                  }}
                                  title="Отменить запрос (pg_cancel_backend)"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="danger-btn sm"
                                  onClick={() => {
                                    setDialog({
                                      kind: "confirm-danger",
                                      title: `Принудительное завершение процесса ${proc.pid}`,
                                      prompt: `Завершить процесс (pg_terminate_backend) PID ${proc.pid}? Соединение клиента будет разорвано.`,
                                      actionName: "Завершить процесс (Terminate)",
                                      onConfirm: async () => {
                                        await killProcess(proc.pid, true);
                                        await loadProcessesAndLocks();
                                      },
                                    });
                                  }}
                                  title="Разорвать соединение (pg_terminate_backend)"
                                >
                                  Kill
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="pg-empty">
                    <span className="icon">💤</span>
                    <span>Нет активных процессов</span>
                  </div>
                )
              ) : filteredLocks.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>PID</th>
                      <th>Тип блокировки</th>
                      <th>База</th>
                      <th>Объект (Relation)</th>
                      <th>Режим (Mode)</th>
                      <th>Статус</th>
                      <th>Запрос</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLocks.map((l, i) => (
                      <tr key={`${l.pid}-${i}`}>
                        <td className="mono">{l.pid}</td>
                        <td>
                          <span className="pg-tag">{l.locktype}</span>
                        </td>
                        <td>{l.database || "—"}</td>
                        <td>
                          <strong>{l.relation || "—"}</strong>
                        </td>
                        <td className="mono">{l.mode}</td>
                        <td>
                          {l.granted ? (
                            <span className="pg-tag" style={{ background: "rgba(123, 241, 173, 0.2)", color: "#7bf1ad" }}>
                              GRANTED
                            </span>
                          ) : (
                            <span className="pg-tag is-unlogged">WAITING</span>
                          )}
                        </td>
                        <td className="mono muted" style={{ maxWidth: "20rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.query || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="pg-empty">
                  <span className="icon">🔓</span>
                  <span>Нет активных блокировок</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: SYSTEM & STORAGE ================= */}
        {activeTab === "system" && (
          <div className="pg-system-layout">
            {/* Left: Tablespaces */}
            <div className="pg-pane">
              <div className="pg-pane-header">
                <h3>💾 Табличные пространства (Tablespaces) ({tablespaces.length})</h3>
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
                {tablespaces.map((ts) => (
                  <div key={ts.name} className="pg-tablespace-card">
                    <div className="pg-tablespace-header">
                      <span className="pg-tablespace-name">{ts.name}</span>
                      <span className="pg-tag">{ts.owner || "postgres"}</span>
                    </div>
                    <div className="pg-tablespace-path">{ts.location || "default (PGDATA)"}</div>
                    <div className="pg-tablespace-stats">
                      <span>Размер: <strong>{formatBytes(ts.size_bytes)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Metrics */}
            <div className="pg-pane">
              <div className="pg-pane-header">
                <h3>📊 Метрики сервера PostgreSQL</h3>
                <div className="pg-search-box">
                  <input
                    type="text"
                    placeholder="Фильтр метрик..."
                    value={metricsFilter}
                    onChange={(e) => setMetricsFilter(e.target.value)}
                    style={{ width: "14rem" }}
                  />
                  {metricsFilter && (
                    <button type="button" className="pg-search-clear" onClick={() => setMetricsFilter("")}>
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
                      <th style={{ width: "9rem" }}>Значение</th>
                      <th>Описание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMetrics.map((m) => (
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
          <div className="pg-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>Создание базы данных PostgreSQL</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await createDatabase({
                    name: dbName,
                    owner: dbOwner.trim() || undefined,
                    encoding: dbEncoding.trim() || undefined,
                    tablespace: dbTablespace.trim() || undefined,
                    if_not_exists: true,
                  });
                  setDialog(null);
                  await loadDatabases(true);
                }, `База данных "${dbName}" создана`);
              }}
            >
              <div className="pg-modal-body">
                <div className="field">
                  <label>Имя базы данных *</label>
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                    placeholder="app_production"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Владелец (Owner, опционально)</label>
                  <input
                    type="text"
                    placeholder="postgres"
                    value={dbOwner}
                    onChange={(e) => setDbOwner(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Кодировка (Encoding)</label>
                  <select value={dbEncoding} onChange={(e) => setDbEncoding(e.target.value)}>
                    <option value="UTF8">UTF8 (рекомендуется)</option>
                    <option value="LATIN1">LATIN1</option>
                    <option value="WIN1251">WIN1251</option>
                  </select>
                </div>
                <div className="field">
                  <label>Табличное пространство (Tablespace, опционально)</label>
                  <input
                    type="text"
                    placeholder="pg_default"
                    value={dbTablespace}
                    onChange={(e) => setDbTablespace(e.target.value)}
                  />
                </div>
              </div>
              <div className="pg-modal-foot">
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

      {/* 2. Create Schema Modal */}
      {dialog?.kind === "create-schema" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>Создание схемы в базе {selectedDb}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await createSchema({
                    database: selectedDb,
                    name: schemaName,
                    owner: schemaOwner.trim() || undefined,
                    if_not_exists: true,
                  });
                  setDialog(null);
                  await loadSchemas(selectedDb, true);
                }, `Схема "${schemaName}" создана`);
              }}
            >
              <div className="pg-modal-body">
                <div className="field">
                  <label>Имя схемы *</label>
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                    placeholder="analytics"
                    value={schemaName}
                    onChange={(e) => setSchemaName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Владелец (Owner, опционально)</label>
                  <input
                    type="text"
                    placeholder="postgres"
                    value={schemaOwner}
                    onChange={(e) => setSchemaOwner(e.target.value)}
                  />
                </div>
              </div>
              <div className="pg-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn" disabled={busy || !schemaName.trim()}>
                  {busy ? "Создание..." : "Создать схему"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 3. Create Table Modal */}
      {dialog?.kind === "create-table" && (
        <PostgresCreateTableModal
          database={selectedDb}
          schema={selectedSchema}
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
              await loadTables(selectedDb, selectedSchema, true);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {/* 4. Add Column Modal */}
      {dialog?.kind === "add-column" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>Добавить колонку в {selectedTable.name}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await addColumn({
                    database: selectedDb,
                    schema: selectedTable.schema,
                    table: selectedTable.name,
                    column: {
                      name: colName,
                      type: colType,
                      nullable: colPrimaryKey ? false : colNullable,
                      default_expression: colDefaultExpr.trim() || undefined,
                      is_identity: colIsIdentity || undefined,
                      identity_generation: colIsIdentity ? colIdentityGen : undefined,
                      primary_key: colPrimaryKey || undefined,
                      unique: colUnique || undefined,
                      comment: colComment.trim() || undefined,
                    },
                    if_not_exists: true,
                  });
                  setDialog(null);
                  await loadTableDetail(selectedDb, selectedTable.schema, selectedTable.name);
                }, `Колонка "${colName}" добавлена`);
              }}
            >
              <div className="pg-modal-body">
                <div className="field">
                  <label>Имя колонки *</label>
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                    placeholder="status"
                    value={colName}
                    onChange={(e) => setColName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Тип данных *</label>
                  <input
                    type="text"
                    required
                    placeholder="text, bigint, jsonb..."
                    value={colType}
                    onChange={(e) => setColType(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={colNullable}
                      disabled={colPrimaryKey}
                      onChange={(e) => setColNullable(e.target.checked)}
                    />
                    Nullable (NULL)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={colPrimaryKey}
                      onChange={(e) => {
                        setColPrimaryKey(e.target.checked);
                        if (e.target.checked) setColNullable(false);
                      }}
                    />
                    PRIMARY KEY
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={colUnique}
                      onChange={(e) => setColUnique(e.target.checked)}
                    />
                    UNIQUE
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={colIsIdentity}
                      onChange={(e) => setColIsIdentity(e.target.checked)}
                    />
                    IDENTITY
                  </label>
                  {colIsIdentity && (
                    <select
                      value={colIdentityGen}
                      onChange={(e) => setColIdentityGen(e.target.value)}
                      style={{ fontSize: "0.8rem", padding: "0.15rem 0.35rem" }}
                    >
                      <option value="BY DEFAULT">BY DEFAULT</option>
                      <option value="ALWAYS">ALWAYS</option>
                    </select>
                  )}
                </div>
                <div className="field">
                  <label>Значение по умолчанию (DEFAULT expression)</label>
                  <input
                    type="text"
                    placeholder="now(), 'pending', 0"
                    value={colDefaultExpr}
                    onChange={(e) => setColDefaultExpr(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Комментарий (COMMENT)</label>
                  <input
                    type="text"
                    placeholder="Описание колонки"
                    value={colComment}
                    onChange={(e) => setColComment(e.target.value)}
                  />
                </div>
              </div>
              <div className="pg-modal-foot">
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

      {/* 5. Modify Column Modal */}
      {dialog?.kind === "modify-column" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>Изменить колонку {dialog.column.name}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await modifyColumn(selectedDb, selectedTable.schema, selectedTable.name, {
                    name: dialog.column.name,
                    type: colType,
                    nullable: colNullable,
                    default_expression: colDefaultExpr.trim() || undefined,
                    comment: colComment.trim() || undefined,
                  });
                  setDialog(null);
                  await loadTableDetail(selectedDb, selectedTable.schema, selectedTable.name);
                }, `Колонка "${dialog.column.name}" изменена`);
              }}
            >
              <div className="pg-modal-body">
                <div className="field">
                  <label>Тип данных *</label>
                  <input
                    type="text"
                    required
                    value={colType}
                    onChange={(e) => setColType(e.target.value)}
                    autoFocus
                  />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={colNullable}
                    onChange={(e) => setColNullable(e.target.checked)}
                  />
                  Nullable (NULL)
                </label>
                <div className="field">
                  <label>Значение по умолчанию (DEFAULT expression)</label>
                  <input
                    type="text"
                    value={colDefaultExpr}
                    onChange={(e) => setColDefaultExpr(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Комментарий</label>
                  <input
                    type="text"
                    value={colComment}
                    onChange={(e) => setColComment(e.target.value)}
                  />
                </div>
              </div>
              <div className="pg-modal-foot">
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

      {/* 6. Rename Column Modal */}
      {dialog?.kind === "rename-column" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>Переименовать колонку {dialog.column.name}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await renameColumn(
                    selectedDb,
                    selectedTable.schema,
                    selectedTable.name,
                    dialog.column.name,
                    newName,
                  );
                  setDialog(null);
                  await loadTableDetail(selectedDb, selectedTable.schema, selectedTable.name);
                }, `Колонка переименована в "${newName}"`);
              }}
            >
              <div className="pg-modal-body">
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
              <div className="pg-modal-foot">
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

      {/* 7. Rename Table Modal */}
      {dialog?.kind === "rename-table" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>Переименовать таблицу {selectedTable.name}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await renameTable({
                    database: selectedDb,
                    schema: selectedTable.schema,
                    name: selectedTable.name,
                    new_schema: newSchema.trim() || undefined,
                    new_name: newName.trim(),
                  });
                  setDialog(null);
                  await loadTables(selectedDb, newSchema.trim() || selectedSchema, true);
                }, `Таблица переименована в "${newName}"`);
              }}
            >
              <div className="pg-modal-body">
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
                <div className="field">
                  <label>Переместить в схему (опционально)</label>
                  <input
                    type="text"
                    placeholder={selectedTable.schema}
                    value={newSchema}
                    onChange={(e) => setNewSchema(e.target.value)}
                  />
                </div>
              </div>
              <div className="pg-modal-foot">
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

      {/* 8. Vacuum Table Modal */}
      {dialog?.kind === "vacuum-table" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>VACUUM таблицы {selectedTable.name}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await vacuumTable({
                    database: selectedDb,
                    schema: selectedTable.schema,
                    name: selectedTable.name,
                    full: vacuumFull,
                    analyze: vacuumAnalyze,
                    freeze: vacuumFreeze,
                  });
                  setDialog(null);
                  await loadTableDetail(selectedDb, selectedTable.schema, selectedTable.name);
                }, `VACUUM для "${selectedTable.name}" успешно выполнен`);
              }}
            >
              <div className="pg-modal-body">
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={vacuumAnalyze}
                    onChange={(e) => setVacuumAnalyze(e.target.checked)}
                  />
                  <strong>ANALYZE</strong> (обновить статистику для планировщика)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={vacuumFull}
                    onChange={(e) => setVacuumFull(e.target.checked)}
                  />
                  <strong>FULL</strong> (полная перезапись таблицы и сжатие, требует эксклюзивной блокировки)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={vacuumFreeze}
                    onChange={(e) => setVacuumFreeze(e.target.checked)}
                  />
                  <strong>FREEZE</strong> (заморозка старых транзакций XID)
                </label>
              </div>
              <div className="pg-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn" disabled={busy}>
                  {busy ? "Выполнение..." : "Запустить VACUUM"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 9. Create Index Modal */}
      {dialog?.kind === "create-index" && selectedTable && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window is-large" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>Создание индекса для {selectedTable.name}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await createIndex({
                    database: selectedDb,
                    schema: selectedTable.schema,
                    table: selectedTable.name,
                    name: indexName.trim(),
                    columns: indexCols.filter(Boolean),
                    method: indexMethod,
                    unique: indexUnique,
                    concurrently: indexConcurrently,
                    where: indexWhere.trim() || undefined,
                    tablespace: indexTablespace.trim() || undefined,
                    if_not_exists: true,
                  });
                  setDialog(null);
                  await loadIndexes(selectedDb, selectedTable.schema, selectedTable.name);
                }, `Индекс "${indexName}" успешно создан`);
              }}
            >
              <div className="pg-modal-body">
                <div className="field">
                  <label>Имя индекса *</label>
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                    placeholder={`idx_${selectedTable.name}_col`}
                    value={indexName}
                    onChange={(e) => setIndexName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
                  <div className="field">
                    <label>Метод индексирования *</label>
                    <select value={indexMethod} onChange={(e) => setIndexMethod(e.target.value)}>
                      <option value="btree">btree (по умолчанию)</option>
                      <option value="hash">hash</option>
                      <option value="gin">gin (для JSONB, массивов, FTS)</option>
                      <option value="gist">gist (для гео, диапазонов, ltree)</option>
                      <option value="brin">brin (для больших упорядоченных таблиц)</option>
                      <option value="spgist">spgist</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Колонка(и) для индекса</label>
                    <select
                      value={indexCols[0] || ""}
                      onChange={(e) => setIndexCols([e.target.value])}
                    >
                      {selectedTable.columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.82rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={indexUnique}
                      onChange={(e) => setIndexUnique(e.target.checked)}
                    />
                    <strong>UNIQUE</strong> (уникальный индекс)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.82rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={indexConcurrently}
                      onChange={(e) => setIndexConcurrently(e.target.checked)}
                    />
                    <strong>CONCURRENTLY</strong> (без блокировки на запись)
                  </label>
                </div>

                <div className="field">
                  <label>Условие частичного индекса (WHERE, опционально)</label>
                  <input
                    type="text"
                    placeholder="status = 'active' AND deleted_at IS NULL"
                    value={indexWhere}
                    onChange={(e) => setIndexWhere(e.target.value)}
                  />
                </div>
              </div>
              <div className="pg-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn" disabled={busy || !indexName.trim()}>
                  {busy ? "Создание..." : "Создать индекс"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 10. Confirm Danger Dialog */}
      {dialog?.kind === "confirm-danger" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3 style={{ color: "#ff8c8c" }}>⚠️ {dialog.title}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <div className="pg-modal-body">
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: "1.5" }}>{dialog.prompt}</p>
            </div>
            <div className="pg-modal-foot">
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

      {/* 11. View Process Query Modal */}
      {dialog?.kind === "view-process-query" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="pg-modal-window is-large" onClick={(e) => e.stopPropagation()}>
            <div className="pg-modal-head">
              <h3>SQL запрос процесса PID {dialog.proc.pid}</h3>
              <button type="button" className="pg-modal-close" onClick={() => setDialog(null)}>
                ✕
              </button>
            </div>
            <div className="pg-modal-body">
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                <span>Пользователь: <strong>{dialog.proc.user}</strong></span>
                <span>База: <strong>{dialog.proc.database}</strong></span>
                <span>Состояние: <strong>{dialog.proc.state}</strong></span>
              </div>
              <pre className="pg-ddl-box">{dialog.proc.query}</pre>
            </div>
            <div className="pg-modal-foot">
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
    </div>
  );
}
