import { wrapRpcError } from "../common/errors";
import { formatTimestamp } from "../common/converters";
import { chAdminPb, clickhouseAdminClient } from "./client";

export * from "./client";

export type ChDatabase = {
  name: string;
  engine: string;
  comment: string;
  tables_count?: number;
  total_bytes?: number;
  total_rows?: number;
};

export type ChColumn = {
  name: string;
  type: string;
  default_kind: string;
  default_expression: string;
  codec: string;
  ttl: string;
  comment: string;
};

export type ChTable = {
  database: string;
  name: string;
  engine: string;
  total_rows: number;
  total_bytes: number;
  partition_key: string;
  sorting_key: string;
  primary_key: string;
  comment: string;
  create_table_query: string;
  metadata_modification_time: string;
  columns: ChColumn[];
  parts_count?: number;
  data_uncompressed_bytes?: number;
};

export type ChTablePart = {
  partition: string;
  name: string;
  active: boolean;
  rows: number;
  bytes_on_disk: number;
  data_uncompressed_bytes: number;
  modification_time: string;
  disk_name: string;
  min_date: string;
  max_date: string;
};

export type ChProcess = {
  query_id: string;
  user: string;
  elapsed_seconds: number;
  rows_read: number;
  bytes_read: number;
  memory_usage: number;
  query: string;
  client_name: string;
  os_user: string;
  is_cancelled: boolean;
};

export type ChDisk = {
  name: string;
  path: string;
  free_space: number;
  total_space: number;
  unreserved_space: number;
  type: string;
};

export type ChMetric = {
  name: string;
  value: number;
  description: string;
};

export type ChQueryResult = {
  columns: string[];
  types: string[];
  rows: string[][];
  total_rows: number;
  elapsed_seconds: number;
  bytes_read: number;
  rows_read: number;
};

export type ChServerInfo = {
  version: string;
  display_name: string;
  revision: number;
  timezone: string;
  uptime_seconds: number;
};

export type ChColumnWrite = {
  name: string;
  type: string;
  default_kind?: string;
  default_expression?: string;
  codec?: string;
  ttl?: string;
  comment?: string;
};

function grpcError(err: unknown, fallback: string): Error {
  const wrapped = wrapRpcError(err);
  if (wrapped.message) return wrapped;
  return new Error(fallback);
}

/** Coalesce identical in-flight RPCs (e.g. React StrictMode double-mount). */
const inflight = new Map<string, Promise<unknown>>();

function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = run().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

function columnFromPb(col: InstanceType<typeof chAdminPb.Column>): ChColumn {
  return {
    name: col.getName(),
    type: col.getType(),
    default_kind: col.getDefaultKind(),
    default_expression: col.getDefaultExpression(),
    codec: col.getCodec(),
    ttl: col.getTtl(),
    comment: col.getComment(),
  };
}

function tableFromPb(item: InstanceType<typeof chAdminPb.Table>): ChTable {
  return {
    database: item.getDatabase(),
    name: item.getName(),
    engine: item.getEngine(),
    total_rows: item.getTotalRows(),
    total_bytes: item.getTotalBytes(),
    partition_key: item.getPartitionKey(),
    sorting_key: item.getSortingKey(),
    primary_key: item.getPrimaryKey(),
    comment: item.getComment(),
    create_table_query: item.getCreateTableQuery(),
    metadata_modification_time: formatTimestamp(item.getMetadataModificationTime()) || "",
    columns: item.getColumnsList().map(columnFromPb),
    parts_count: item.getPartsCount(),
    data_uncompressed_bytes: item.getDataUncompressedBytes(),
  };
}

function columnToPb(src: ChColumnWrite) {
  const col = new chAdminPb.Column();
  col.setName(src.name.trim());
  col.setType(src.type.trim());
  if (src.default_kind) col.setDefaultKind(src.default_kind.trim());
  if (src.default_expression) col.setDefaultExpression(src.default_expression.trim());
  if (src.codec) col.setCodec(src.codec.trim());
  if (src.ttl) col.setTtl(src.ttl.trim());
  if (src.comment) col.setComment(src.comment.trim());
  return col;
}

export async function pingClickHouse() {
  try {
    const resp = await clickhouseAdminClient.ping(new chAdminPb.PingRequest());
    return { ok: resp.getOk(), version: resp.getVersion() };
  } catch (err) {
    throw grpcError(err, "Не удалось выполнить ping ClickHouse");
  }
}

export async function fetchClickHouseInfo(): Promise<ChServerInfo> {
  return coalesce("ServerInfo", async () => {
    try {
      const resp = await clickhouseAdminClient.serverInfo(new chAdminPb.ServerInfoRequest());
      return {
        version: resp.getVersion(),
        display_name: resp.getDisplayName(),
        revision: resp.getRevision(),
        timezone: resp.getTimezone(),
        uptime_seconds: resp.getUptimeSeconds(),
      };
    } catch (err) {
      throw grpcError(err, "Не удалось получить информацию о сервере ClickHouse");
    }
  });
}

export async function listDatabases(like = ""): Promise<ChDatabase[]> {
  const key = `ListDatabases:${like.trim()}`;
  return coalesce(key, async () => {
    const req = new chAdminPb.ListDatabasesRequest();
    if (like.trim()) req.setLike(like.trim());
    try {
      const resp = await clickhouseAdminClient.listDatabases(req);
      return resp.getItemsList().map((item) => ({
        name: item.getName(),
        engine: item.getEngine(),
        comment: item.getComment(),
        tables_count: item.getTablesCount(),
        total_bytes: item.getTotalBytes(),
        total_rows: item.getTotalRows(),
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить список баз");
    }
  });
}

export async function createDatabase(spec: {
  name: string;
  engine?: string;
  comment?: string;
  if_not_exists?: boolean;
}) {
  const req = new chAdminPb.DatabaseSpec();
  req.setName(spec.name.trim());
  if (spec.engine) req.setEngine(spec.engine.trim());
  if (spec.comment) req.setComment(spec.comment.trim());
  if (spec.if_not_exists) req.setIfNotExists(true);
  try {
    const resp = await clickhouseAdminClient.createDatabase(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось создать базу");
  } catch (err) {
    throw grpcError(err, "Не удалось создать базу");
  }
}

export async function dropDatabase(name: string, opts?: { if_exists?: boolean; sync?: boolean }) {
  const req = new chAdminPb.DatabaseName();
  req.setName(name.trim());
  if (opts?.if_exists) req.setIfExists(true);
  if (opts?.sync) req.setSync(true);
  try {
    const resp = await clickhouseAdminClient.dropDatabase(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить базу");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить базу");
  }
}

export async function listTables(database: string, like = ""): Promise<ChTable[]> {
  const req = new chAdminPb.ListTablesRequest();
  req.setDatabase(database.trim());
  if (like.trim()) req.setLike(like.trim());
  try {
    const resp = await clickhouseAdminClient.listTables(req);
    return resp.getItemsList().map(tableFromPb);
  } catch (err) {
    throw grpcError(err, "Не удалось загрузить список таблиц");
  }
}

export async function fetchTableInfo(database: string, name: string): Promise<ChTable> {
  const req = new chAdminPb.TableName();
  req.setDatabase(database.trim());
  req.setName(name.trim());
  try {
    return tableFromPb(await clickhouseAdminClient.tableInfo(req));
  } catch (err) {
    throw grpcError(err, "Не удалось получить таблицу");
  }
}

export async function createTable(spec: {
  database: string;
  name: string;
  columns: ChColumnWrite[];
  engine: string;
  engine_params?: string[];
  order_by?: string;
  partition_by?: string;
  primary_key?: string;
  sample_by?: string;
  ttl?: string;
  comment?: string;
  settings?: Record<string, string>;
  if_not_exists?: boolean;
}) {
  const req = new chAdminPb.TableSpec();
  req.setDatabase(spec.database.trim());
  req.setName(spec.name.trim());
  for (const col of spec.columns) req.addColumns(columnToPb(col));
  const engine = new chAdminPb.TableEngine();
  engine.setName(spec.engine.trim());
  if (spec.engine_params?.length) engine.setParamsList(spec.engine_params);
  req.setEngine(engine);
  if (spec.order_by) req.setOrderBy(spec.order_by.trim());
  if (spec.partition_by) req.setPartitionBy(spec.partition_by.trim());
  if (spec.primary_key) req.setPrimaryKey(spec.primary_key.trim());
  if (spec.sample_by) req.setSampleBy(spec.sample_by.trim());
  if (spec.ttl) req.setTtl(spec.ttl.trim());
  if (spec.comment) req.setComment(spec.comment.trim());
  if (spec.settings && Object.keys(spec.settings).length > 0) {
    const map = req.getSettingsMap();
    for (const [k, v] of Object.entries(spec.settings)) {
      if (k.trim() && v.trim()) map.set(k.trim(), v.trim());
    }
  }
  if (spec.if_not_exists) req.setIfNotExists(true);
  try {
    const resp = await clickhouseAdminClient.createTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось создать таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось создать таблицу");
  }
}

export async function dropTable(database: string, name: string, opts?: { if_exists?: boolean; sync?: boolean }) {
  const req = new chAdminPb.TableName();
  req.setDatabase(database.trim());
  req.setName(name.trim());
  if (opts?.if_exists) req.setIfExists(true);
  if (opts?.sync) req.setSync(true);
  try {
    const resp = await clickhouseAdminClient.dropTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить таблицу");
  }
}

export async function truncateTable(database: string, name: string) {
  const req = new chAdminPb.TableName();
  req.setDatabase(database.trim());
  req.setName(name.trim());
  try {
    const resp = await clickhouseAdminClient.truncateTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось очистить таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось очистить таблицу");
  }
}

export async function renameTable(database: string, name: string, newName: string, newDatabase?: string) {
  const req = new chAdminPb.RenameTableRequest();
  req.setDatabase(database.trim());
  req.setName(name.trim());
  req.setNewName(newName.trim());
  if (newDatabase?.trim()) req.setNewDatabase(newDatabase.trim());
  try {
    const resp = await clickhouseAdminClient.renameTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось переименовать таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось переименовать таблицу");
  }
}

export async function optimizeTable(database: string, name: string, opts?: { partition?: string; final?: boolean; deduplicate?: boolean }) {
  const req = new chAdminPb.OptimizeTableRequest();
  req.setDatabase(database.trim());
  req.setName(name.trim());
  if (opts?.partition) req.setPartition(opts.partition.trim());
  if (opts?.final) req.setFinal(true);
  if (opts?.deduplicate) req.setDeduplicate(true);
  try {
    const resp = await clickhouseAdminClient.optimizeTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось оптимизировать таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось оптимизировать таблицу");
  }
}

export async function addColumn(
  database: string,
  table: string,
  column: ChColumnWrite,
  opts?: { after?: string; if_not_exists?: boolean },
) {
  const req = new chAdminPb.AddColumnRequest();
  req.setDatabase(database.trim());
  req.setTable(table.trim());
  req.setColumn(columnToPb(column));
  if (opts?.after) req.setAfter(opts.after.trim());
  if (opts?.if_not_exists) req.setIfNotExists(true);
  try {
    const resp = await clickhouseAdminClient.addColumn(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось добавить колонку");
  } catch (err) {
    throw grpcError(err, "Не удалось добавить колонку");
  }
}

export async function dropColumn(database: string, table: string, name: string, opts?: { if_exists?: boolean }) {
  const req = new chAdminPb.DropColumnRequest();
  req.setDatabase(database.trim());
  req.setTable(table.trim());
  req.setName(name.trim());
  if (opts?.if_exists) req.setIfExists(true);
  try {
    const resp = await clickhouseAdminClient.dropColumn(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить колонку");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить колонку");
  }
}

export async function renameColumn(database: string, table: string, name: string, newName: string) {
  const req = new chAdminPb.RenameColumnRequest();
  req.setDatabase(database.trim());
  req.setTable(table.trim());
  req.setName(name.trim());
  req.setNewName(newName.trim());
  try {
    const resp = await clickhouseAdminClient.renameColumn(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось переименовать колонку");
  } catch (err) {
    throw grpcError(err, "Не удалось переименовать колонку");
  }
}

export async function modifyColumn(database: string, table: string, column: ChColumnWrite) {
  const req = new chAdminPb.ModifyColumnRequest();
  req.setDatabase(database.trim());
  req.setTable(table.trim());
  req.setColumn(columnToPb(column));
  try {
    const resp = await clickhouseAdminClient.modifyColumn(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось изменить колонку");
  } catch (err) {
    throw grpcError(err, "Не удалось изменить колонку");
  }
}

export async function executeClickHouseQuery(query: string, maxRows = 100, database?: string): Promise<ChQueryResult> {
  const req = new chAdminPb.ExecuteQueryRequest();
  req.setQuery(query.trim());
  if (maxRows > 0) req.setMaxRows(maxRows);
  if (database?.trim()) req.setDatabase(database.trim());
  try {
    const resp = await clickhouseAdminClient.executeQuery(req);
    return {
      columns: resp.getColumnsList(),
      types: resp.getTypesList(),
      rows: resp.getRowsList().map((r) => r.getValuesList()),
      total_rows: resp.getTotalRows(),
      elapsed_seconds: resp.getElapsedSeconds(),
      bytes_read: resp.getBytesRead(),
      rows_read: resp.getRowsRead(),
    };
  } catch (err) {
    throw grpcError(err, "Не удалось выполнить запрос");
  }
}

export async function previewTableData(params: {
  database: string;
  table: string;
  limit?: number;
  offset?: number;
  order_by?: string;
  where?: string;
}): Promise<ChQueryResult> {
  const req = new chAdminPb.PreviewTableDataRequest();
  req.setDatabase(params.database.trim());
  req.setTable(params.table.trim());
  if (params.limit) req.setLimit(params.limit);
  if (params.offset) req.setOffset(params.offset);
  if (params.order_by) req.setOrderBy(params.order_by.trim());
  if (params.where) req.setWhere(params.where.trim());
  try {
    const resp = await clickhouseAdminClient.previewTableData(req);
    return {
      columns: resp.getColumnsList(),
      types: resp.getTypesList(),
      rows: resp.getRowsList().map((r) => r.getValuesList()),
      total_rows: resp.getTotalRows(),
      elapsed_seconds: resp.getElapsedSeconds(),
      bytes_read: resp.getBytesRead(),
      rows_read: resp.getRowsRead(),
    };
  } catch (err) {
    throw grpcError(err, "Не удалось получить превью данных таблицы");
  }
}

export async function listParts(database: string, table: string, activeOnly = true): Promise<ChTablePart[]> {
  const req = new chAdminPb.ListPartsRequest();
  req.setDatabase(database.trim());
  req.setTable(table.trim());
  req.setActiveOnly(activeOnly);
  try {
    const resp = await clickhouseAdminClient.listParts(req);
    return resp.getItemsList().map((p) => ({
      partition: p.getPartition(),
      name: p.getName(),
      active: p.getActive(),
      rows: p.getRows(),
      bytes_on_disk: p.getBytesOnDisk(),
      data_uncompressed_bytes: p.getDataUncompressedBytes(),
      modification_time: formatTimestamp(p.getModificationTime()) || "",
      disk_name: p.getDiskName(),
      min_date: p.getMinDate(),
      max_date: p.getMaxDate(),
    }));
  } catch (err) {
    throw grpcError(err, "Не удалось получить список партиций");
  }
}

export async function dropPartition(database: string, table: string, partition: string, detach = false) {
  const req = new chAdminPb.DropPartitionRequest();
  req.setDatabase(database.trim());
  req.setTable(table.trim());
  req.setPartition(partition.trim());
  if (detach) req.setDetach(true);
  try {
    const resp = await clickhouseAdminClient.dropPartition(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось выполнить операцию с партицией");
  } catch (err) {
    throw grpcError(err, "Не удалось выполнить операцию с партицией");
  }
}

export async function listProcesses(): Promise<ChProcess[]> {
  return coalesce("ListProcesses", async () => {
    const req = new chAdminPb.ListProcessesRequest();
    try {
      const resp = await clickhouseAdminClient.listProcesses(req);
      return resp.getItemsList().map((p) => ({
        query_id: p.getQueryId(),
        user: p.getUser(),
        elapsed_seconds: p.getElapsedSeconds(),
        rows_read: p.getRowsRead(),
        bytes_read: p.getBytesRead(),
        memory_usage: p.getMemoryUsage(),
        query: p.getQuery(),
        client_name: p.getClientName(),
        os_user: p.getOsUser(),
        is_cancelled: p.getIsCancelled(),
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить список процессов");
    }
  });
}

export async function killProcess(queryId: string) {
  const req = new chAdminPb.KillProcessRequest();
  req.setQueryId(queryId.trim());
  try {
    const resp = await clickhouseAdminClient.killProcess(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось завершить процесс");
  } catch (err) {
    throw grpcError(err, "Не удалось завершить процесс");
  }
}

export async function listDisks(): Promise<ChDisk[]> {
  return coalesce("ListDisks", async () => {
    const req = new chAdminPb.ListDisksRequest();
    try {
      const resp = await clickhouseAdminClient.listDisks(req);
      return resp.getItemsList().map((d) => ({
        name: d.getName(),
        path: d.getPath(),
        free_space: d.getFreeSpace(),
        total_space: d.getTotalSpace(),
        unreserved_space: d.getUnreservedSpace(),
        type: d.getType(),
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить информацию о дисках");
    }
  });
}

export async function getMetrics(): Promise<{ metrics: ChMetric[]; async_metrics: ChMetric[] }> {
  return coalesce("GetMetrics", async () => {
    const req = new chAdminPb.GetMetricsRequest();
    try {
      const resp = await clickhouseAdminClient.getMetrics(req);
      const mapMetric = (m: InstanceType<typeof chAdminPb.MetricItem>) => ({
        name: m.getName(),
        value: m.getValue(),
        description: m.getDescription(),
      });
      return {
        metrics: resp.getMetricsList().map(mapMetric),
        async_metrics: resp.getAsyncMetricsList().map(mapMetric),
      };
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить метрики ClickHouse");
    }
  });
}

export type ChTableOptions = {
  engines: string[];
  data_types: string[];
  merge_tree_settings: string[];
  codecs: string[];
};

export async function getTableOptions(): Promise<ChTableOptions> {
  return coalesce("GetTableOptions", async () => {
    try {
      const resp = await clickhouseAdminClient.getTableOptions(new chAdminPb.TableOptionsRequest());
      return {
        engines: resp.getEnginesList(),
        data_types: resp.getDataTypesList(),
        merge_tree_settings: resp.getMergeTreeSettingsList(),
        codecs: resp.getCodecsList(),
      };
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить каталоги движков/типов/settings из ClickHouse");
    }
  });
}

export function formatBytes(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = value / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatUptime(seconds?: number | null): string {
  const sec = Math.max(0, Math.floor(seconds ?? 0));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

export function isSystemDatabase(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "system" || n === "information_schema";
}
