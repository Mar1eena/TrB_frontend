import { wrapRpcError } from "../common/errors";
import { formatTimestamp } from "../common/converters";
import type { DbConnection } from "../common/connection";
import { getPostgresConnection } from "../common/connection";
import { pgAdminPb, postgresqlAdminClient } from "./client";

export * from "./client";

export type PgDatabase = {
  name: string;
  owner: string;
  encoding: string;
  collation: string;
  ctype: string;
  size_bytes: number;
  connection_limit: number;
  num_backends: number;
  allow_connections: boolean;
  tablespace: string;
};

export type PgSchema = {
  database: string;
  name: string;
  owner: string;
  tables_count: number;
  total_bytes: number;
};

export type PgColumn = {
  name: string;
  type: string;
  nullable: boolean;
  default_expression: string;
  is_identity: boolean;
  identity_generation: string;
  generated_expression: string;
  collation: string;
  comment: string;
  primary_key: boolean;
  unique: boolean;
};

export type PgColumnWrite = {
  name: string;
  type: string;
  nullable?: boolean;
  default_expression?: string;
  is_identity?: boolean;
  identity_generation?: string;
  generated_expression?: string;
  collation?: string;
  comment?: string;
  primary_key?: boolean;
  unique?: boolean;
};

export type PgTable = {
  database: string;
  schema: string;
  name: string;
  kind: string;
  owner: string;
  total_rows: number;
  total_bytes: number;
  index_bytes: number;
  toast_bytes: number;
  live_tuples: number;
  dead_tuples: number;
  comment: string;
  create_table_query: string;
  tablespace: string;
  persistence: string;
  last_vacuum?: string;
  last_analyze?: string;
  last_autovacuum?: string;
  last_autoanalyze?: string;
  columns: PgColumn[];
};

export type PgIndex = {
  database: string;
  schema: string;
  table: string;
  name: string;
  method: string;
  unique: boolean;
  primary: boolean;
  valid: boolean;
  columns: string[];
  definition: string;
  size_bytes: number;
  tablespace: string;
};

export type PgTablePartition = {
  schema: string;
  name: string;
  expression: string;
  total_rows: number;
  total_bytes: number;
};

export type PgProcess = {
  pid: number;
  user: string;
  database: string;
  application_name: string;
  client_addr: string;
  state: string;
  wait_event_type: string;
  wait_event: string;
  query: string;
  backend_start?: string;
  query_start?: string;
  state_change?: string;
  backend_type: string;
};

export type PgLock = {
  pid: number;
  locktype: string;
  database: string;
  relation: string;
  mode: string;
  granted: boolean;
  fastpath: boolean;
  query: string;
};

export type PgTablespace = {
  name: string;
  owner: string;
  location: string;
  size_bytes: number;
};

export type PgMetric = {
  name: string;
  value: number;
  description: string;
};

export type PgQueryResult = {
  columns: string[];
  types: string[];
  rows: string[][];
  total_rows: number;
  elapsed_seconds: number;
  rows_affected: number;
};

export type PgServerInfo = {
  version: string;
  version_num: number;
  server_encoding: string;
  timezone: string;
  max_connections: number;
  uptime_seconds: number;
  current_database: string;
  currentUser: string;
  data_directory: string;
  cluster_name: string;
};

export type PgTableOptions = {
  data_types: string[];
  index_methods: string[];
  collations: string[];
  tablespaces: string[];
};

function grpcError(err: unknown, fallback: string): Error {
  const wrapped = wrapRpcError(err);
  if (wrapped.message) return wrapped;
  return new Error(fallback);
}

/** Coalesce identical in-flight RPCs (e.g. React StrictMode double-mount). */
const inflight = new Map<string, Promise<unknown>>();

function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const scoped = `${getPostgresConnection() || "_"}:${key}`;
  const existing = inflight.get(scoped);
  if (existing) return existing as Promise<T>;
  const pending = run().finally(() => {
    if (inflight.get(scoped) === pending) inflight.delete(scoped);
  });
  inflight.set(scoped, pending);
  return pending;
}

function columnFromPb(col: InstanceType<typeof pgAdminPb.Column>): PgColumn {
  return {
    name: col.getName(),
    type: col.getType(),
    nullable: col.getNullable(),
    default_expression: col.getDefaultExpression(),
    is_identity: col.getIsIdentity(),
    identity_generation: col.getIdentityGeneration(),
    generated_expression: col.getGeneratedExpression(),
    collation: col.getCollation(),
    comment: col.getComment(),
    primary_key: col.getPrimaryKey(),
    unique: col.getUnique(),
  };
}

function columnToPb(src: PgColumnWrite): InstanceType<typeof pgAdminPb.Column> {
  const col = new pgAdminPb.Column();
  col.setName(src.name.trim());
  col.setType(src.type.trim());
  if (src.nullable != null) col.setNullable(src.nullable);
  if (src.default_expression != null) col.setDefaultExpression(src.default_expression.trim());
  if (src.is_identity != null) col.setIsIdentity(src.is_identity);
  if (src.identity_generation != null) col.setIdentityGeneration(src.identity_generation.trim());
  if (src.generated_expression != null) col.setGeneratedExpression(src.generated_expression.trim());
  if (src.collation != null) col.setCollation(src.collation.trim());
  if (src.comment != null) col.setComment(src.comment.trim());
  if (src.primary_key != null) col.setPrimaryKey(src.primary_key);
  if (src.unique != null) col.setUnique(src.unique);
  return col;
}

function tableFromPb(item: InstanceType<typeof pgAdminPb.Table>): PgTable {
  return {
    database: item.getDatabase(),
    schema: item.getSchema(),
    name: item.getName(),
    kind: item.getKind(),
    owner: item.getOwner(),
    total_rows: item.getTotalRows(),
    total_bytes: item.getTotalBytes(),
    index_bytes: item.getIndexBytes(),
    toast_bytes: item.getToastBytes(),
    live_tuples: item.getLiveTuples(),
    dead_tuples: item.getDeadTuples(),
    comment: item.getComment(),
    create_table_query: item.getCreateTableQuery(),
    tablespace: item.getTablespace(),
    persistence: item.getPersistence(),
    last_vacuum: formatTimestamp(item.getLastVacuum()) || "",
    last_analyze: formatTimestamp(item.getLastAnalyze()) || "",
    last_autovacuum: formatTimestamp(item.getLastAutovacuum()) || "",
    last_autoanalyze: formatTimestamp(item.getLastAutoanalyze()) || "",
    columns: item.getColumnsList().map(columnFromPb),
  };
}

export async function listPostgresConnections(): Promise<DbConnection[]> {
  try {
    const resp = await postgresqlAdminClient.listConnections(new pgAdminPb.ListConnectionsRequest());
    return resp.getItemsList().map((item) => ({
      name: item.getName(),
      host: item.getHost(),
      database: item.getDatabase(),
      is_default: item.getIsDefault(),
    }));
  } catch {
    return [];
  }
}

export async function pingPostgres() {
  try {
    const resp = await postgresqlAdminClient.ping(new pgAdminPb.PingRequest());
    return { ok: resp.getOk(), version: resp.getVersion() };
  } catch (err) {
    throw grpcError(err, "Не удалось выполнить ping PostgreSQL");
  }
}

export async function fetchPostgresInfo(): Promise<PgServerInfo> {
  return coalesce("PgServerInfo", async () => {
    try {
      const resp = await postgresqlAdminClient.serverInfo(new pgAdminPb.ServerInfoRequest());
      return {
        version: resp.getVersion(),
        version_num: resp.getVersionNum(),
        server_encoding: resp.getServerEncoding(),
        timezone: resp.getTimezone(),
        max_connections: resp.getMaxConnections(),
        uptime_seconds: resp.getUptimeSeconds(),
        current_database: resp.getCurrentDatabase(),
        currentUser: resp.getCurrentUser(),
        data_directory: resp.getDataDirectory(),
        cluster_name: resp.getClusterName(),
      };
    } catch (err) {
      throw grpcError(err, "Не удалось получить информацию о сервере PostgreSQL");
    }
  });
}

export async function listDatabases(like = ""): Promise<PgDatabase[]> {
  const key = `PgListDatabases:${like.trim()}`;
  return coalesce(key, async () => {
    const req = new pgAdminPb.ListDatabasesRequest();
    if (like.trim()) req.setLike(like.trim());
    try {
      const resp = await postgresqlAdminClient.listDatabases(req);
      return resp.getItemsList().map((item) => ({
        name: item.getName(),
        owner: item.getOwner(),
        encoding: item.getEncoding(),
        collation: item.getCollation(),
        ctype: item.getCtype(),
        size_bytes: item.getSizeBytes(),
        connection_limit: item.getConnectionLimit(),
        num_backends: item.getNumBackends(),
        allow_connections: item.getAllowConnections(),
        tablespace: item.getTablespace(),
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить список баз данных PostgreSQL");
    }
  });
}

export async function fetchDatabaseInfo(name: string): Promise<PgDatabase> {
  const req = new pgAdminPb.DatabaseName();
  req.setName(name.trim());
  try {
    const item = await postgresqlAdminClient.databaseInfo(req);
    return {
      name: item.getName(),
      owner: item.getOwner(),
      encoding: item.getEncoding(),
      collation: item.getCollation(),
      ctype: item.getCtype(),
      size_bytes: item.getSizeBytes(),
      connection_limit: item.getConnectionLimit(),
      num_backends: item.getNumBackends(),
      allow_connections: item.getAllowConnections(),
      tablespace: item.getTablespace(),
    };
  } catch (err) {
    throw grpcError(err, "Не удалось получить информацию о базе данных");
  }
}

export async function createDatabase(spec: {
  name: string;
  owner?: string;
  encoding?: string;
  collation?: string;
  ctype?: string;
  template?: string;
  tablespace?: string;
  connection_limit?: number;
  if_not_exists?: boolean;
}) {
  const req = new pgAdminPb.DatabaseSpec();
  req.setName(spec.name.trim());
  if (spec.owner) req.setOwner(spec.owner.trim());
  if (spec.encoding) req.setEncoding(spec.encoding.trim());
  if (spec.collation) req.setCollation(spec.collation.trim());
  if (spec.ctype) req.setCtype(spec.ctype.trim());
  if (spec.template) req.setTemplate(spec.template.trim());
  if (spec.tablespace) req.setTablespace(spec.tablespace.trim());
  if (spec.connection_limit != null) req.setConnectionLimit(spec.connection_limit);
  if (spec.if_not_exists) req.setIfNotExists(true);
  try {
    const resp = await postgresqlAdminClient.createDatabase(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось создать базу данных");
  } catch (err) {
    throw grpcError(err, "Не удалось создать базу данных");
  }
}

export async function dropDatabase(name: string, opts?: { if_exists?: boolean; force?: boolean }) {
  const req = new pgAdminPb.DatabaseName();
  req.setName(name.trim());
  if (opts?.if_exists) req.setIfExists(true);
  if (opts?.force) req.setForce(true);
  try {
    const resp = await postgresqlAdminClient.dropDatabase(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить базу данных");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить базу данных");
  }
}

export async function listSchemas(params: {
  database: string;
  like?: string;
  include_system?: boolean;
}): Promise<PgSchema[]> {
  const req = new pgAdminPb.ListSchemasRequest();
  req.setDatabase(params.database.trim());
  if (params.like?.trim()) req.setLike(params.like.trim());
  if (params.include_system) req.setIncludeSystem(true);
  try {
    const resp = await postgresqlAdminClient.listSchemas(req);
    return resp.getItemsList().map((item) => ({
      database: item.getDatabase(),
      name: item.getName(),
      owner: item.getOwner(),
      tables_count: item.getTablesCount(),
      total_bytes: item.getTotalBytes(),
    }));
  } catch (err) {
    throw grpcError(err, "Не удалось загрузить список схем PostgreSQL");
  }
}

export async function fetchSchemaInfo(database: string, name: string): Promise<PgSchema> {
  const req = new pgAdminPb.SchemaName();
  req.setDatabase(database.trim());
  req.setName(name.trim());
  try {
    const item = await postgresqlAdminClient.schemaInfo(req);
    return {
      database: item.getDatabase(),
      name: item.getName(),
      owner: item.getOwner(),
      tables_count: item.getTablesCount(),
      total_bytes: item.getTotalBytes(),
    };
  } catch (err) {
    throw grpcError(err, "Не удалось получить информацию о схеме");
  }
}

export async function createSchema(spec: {
  database: string;
  name: string;
  owner?: string;
  if_not_exists?: boolean;
}) {
  const req = new pgAdminPb.SchemaSpec();
  req.setDatabase(spec.database.trim());
  req.setName(spec.name.trim());
  if (spec.owner) req.setOwner(spec.owner.trim());
  if (spec.if_not_exists) req.setIfNotExists(true);
  try {
    const resp = await postgresqlAdminClient.createSchema(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось создать схему");
  } catch (err) {
    throw grpcError(err, "Не удалось создать схему");
  }
}

export async function dropSchema(
  database: string,
  name: string,
  opts?: { if_exists?: boolean; cascade?: boolean },
) {
  const req = new pgAdminPb.SchemaName();
  req.setDatabase(database.trim());
  req.setName(name.trim());
  if (opts?.if_exists) req.setIfExists(true);
  if (opts?.cascade) req.setCascade(true);
  try {
    const resp = await postgresqlAdminClient.dropSchema(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить схему");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить схему");
  }
}

export async function listTables(params: {
  database: string;
  schema?: string;
  like?: string;
  kind?: string;
}): Promise<PgTable[]> {
  const req = new pgAdminPb.ListTablesRequest();
  req.setDatabase(params.database.trim());
  if (params.schema?.trim()) req.setSchema(params.schema.trim());
  if (params.like?.trim()) req.setLike(params.like.trim());
  if (params.kind?.trim()) req.setKind(params.kind.trim());
  try {
    const resp = await postgresqlAdminClient.listTables(req);
    return resp.getItemsList().map(tableFromPb);
  } catch (err) {
    throw grpcError(err, "Не удалось загрузить список таблиц PostgreSQL");
  }
}

export async function fetchTableInfo(
  database: string,
  schema: string,
  name: string,
): Promise<PgTable> {
  const req = new pgAdminPb.TableName();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setName(name.trim());
  try {
    return tableFromPb(await postgresqlAdminClient.tableInfo(req));
  } catch (err) {
    throw grpcError(err, "Не удалось получить информацию о таблице");
  }
}

export async function createTable(spec: {
  database: string;
  schema: string;
  name: string;
  columns: PgColumnWrite[];
  primary_keys?: string[];
  comment?: string;
  if_not_exists?: boolean;
  unlogged?: boolean;
  tablespace?: string;
  partition_by?: string;
  temporary?: boolean;
}) {
  const req = new pgAdminPb.TableSpec();
  req.setDatabase(spec.database.trim());
  req.setSchema(spec.schema.trim());
  req.setName(spec.name.trim());
  for (const col of spec.columns) req.addColumns(columnToPb(col));
  if (spec.primary_keys?.length) req.setPrimaryKeyList(spec.primary_keys);
  if (spec.comment) req.setComment(spec.comment.trim());
  if (spec.if_not_exists) req.setIfNotExists(true);
  if (spec.unlogged) req.setUnlogged(true);
  if (spec.tablespace) req.setTablespace(spec.tablespace.trim());
  if (spec.partition_by) req.setPartitionBy(spec.partition_by.trim());
  if (spec.temporary) req.setTemporary(true);
  try {
    const resp = await postgresqlAdminClient.createTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось создать таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось создать таблицу");
  }
}

export async function dropTable(
  database: string,
  schema: string,
  name: string,
  opts?: { if_exists?: boolean; cascade?: boolean; restart_identity?: boolean },
) {
  const req = new pgAdminPb.TableName();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setName(name.trim());
  if (opts?.if_exists) req.setIfExists(true);
  if (opts?.cascade) req.setCascade(true);
  if (opts?.restart_identity) req.setRestartIdentity(true);
  try {
    const resp = await postgresqlAdminClient.dropTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить таблицу");
  }
}

export async function truncateTable(
  database: string,
  schema: string,
  name: string,
  opts?: { cascade?: boolean; restart_identity?: boolean },
) {
  const req = new pgAdminPb.TableName();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setName(name.trim());
  if (opts?.cascade) req.setCascade(true);
  if (opts?.restart_identity) req.setRestartIdentity(true);
  try {
    const resp = await postgresqlAdminClient.truncateTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось очистить таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось очистить таблицу");
  }
}

export async function renameTable(params: {
  database: string;
  schema: string;
  name: string;
  new_schema?: string;
  new_name: string;
}) {
  const req = new pgAdminPb.RenameTableRequest();
  req.setDatabase(params.database.trim());
  req.setSchema(params.schema.trim());
  req.setName(params.name.trim());
  if (params.new_schema?.trim()) req.setNewSchema(params.new_schema.trim());
  req.setNewName(params.new_name.trim());
  try {
    const resp = await postgresqlAdminClient.renameTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось переименовать таблицу");
  } catch (err) {
    throw grpcError(err, "Не удалось переименовать таблицу");
  }
}

export async function vacuumTable(params: {
  database: string;
  schema: string;
  name: string;
  full?: boolean;
  analyze?: boolean;
  freeze?: boolean;
}) {
  const req = new pgAdminPb.VacuumTableRequest();
  req.setDatabase(params.database.trim());
  req.setSchema(params.schema.trim());
  req.setName(params.name.trim());
  if (params.full) req.setFull(true);
  if (params.analyze) req.setAnalyze(true);
  if (params.freeze) req.setFreeze(true);
  try {
    const resp = await postgresqlAdminClient.vacuumTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось выполнить vacuum таблицы");
  } catch (err) {
    throw grpcError(err, "Не удалось выполнить vacuum таблицы");
  }
}

export async function analyzeTable(database: string, schema: string, name: string) {
  const req = new pgAdminPb.AnalyzeTableRequest();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setName(name.trim());
  try {
    const resp = await postgresqlAdminClient.analyzeTable(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось выполнить analyze таблицы");
  } catch (err) {
    throw grpcError(err, "Не удалось выполнить analyze таблицы");
  }
}

export async function addColumn(params: {
  database: string;
  schema: string;
  table: string;
  column: PgColumnWrite;
  if_not_exists?: boolean;
}) {
  const req = new pgAdminPb.AddColumnRequest();
  req.setDatabase(params.database.trim());
  req.setSchema(params.schema.trim());
  req.setTable(params.table.trim());
  req.setColumn(columnToPb(params.column));
  if (params.if_not_exists) req.setIfNotExists(true);
  try {
    const resp = await postgresqlAdminClient.addColumn(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось добавить колонку");
  } catch (err) {
    throw grpcError(err, "Не удалось добавить колонку");
  }
}

export async function dropColumn(
  database: string,
  schema: string,
  table: string,
  name: string,
  opts?: { if_exists?: boolean; cascade?: boolean },
) {
  const req = new pgAdminPb.DropColumnRequest();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setTable(table.trim());
  req.setName(name.trim());
  if (opts?.if_exists) req.setIfExists(true);
  if (opts?.cascade) req.setCascade(true);
  try {
    const resp = await postgresqlAdminClient.dropColumn(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить колонку");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить колонку");
  }
}

export async function renameColumn(
  database: string,
  schema: string,
  table: string,
  name: string,
  newName: string,
) {
  const req = new pgAdminPb.RenameColumnRequest();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setTable(table.trim());
  req.setName(name.trim());
  req.setNewName(newName.trim());
  try {
    const resp = await postgresqlAdminClient.renameColumn(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось переименовать колонку");
  } catch (err) {
    throw grpcError(err, "Не удалось переименовать колонку");
  }
}

export async function modifyColumn(
  database: string,
  schema: string,
  table: string,
  column: PgColumnWrite,
) {
  const req = new pgAdminPb.ModifyColumnRequest();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setTable(table.trim());
  req.setColumn(columnToPb(column));
  try {
    const resp = await postgresqlAdminClient.modifyColumn(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось изменить колонку");
  } catch (err) {
    throw grpcError(err, "Не удалось изменить колонку");
  }
}

export async function listIndexes(
  database: string,
  schema: string,
  table: string,
): Promise<PgIndex[]> {
  const req = new pgAdminPb.ListIndexesRequest();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setTable(table.trim());
  try {
    const resp = await postgresqlAdminClient.listIndexes(req);
    return resp.getItemsList().map((idx) => ({
      database: idx.getDatabase(),
      schema: idx.getSchema(),
      table: idx.getTable(),
      name: idx.getName(),
      method: idx.getMethod(),
      unique: idx.getUnique(),
      primary: idx.getPrimary(),
      valid: idx.getValid(),
      columns: idx.getColumnsList(),
      definition: idx.getDefinition(),
      size_bytes: idx.getSizeBytes(),
      tablespace: idx.getTablespace(),
    }));
  } catch (err) {
    throw grpcError(err, "Не удалось загрузить список индексов");
  }
}

export async function createIndex(spec: {
  database: string;
  schema: string;
  table: string;
  name: string;
  columns: string[];
  method?: string;
  unique?: boolean;
  concurrently?: boolean;
  where?: string;
  if_not_exists?: boolean;
  tablespace?: string;
  include?: string;
}) {
  const req = new pgAdminPb.IndexSpec();
  req.setDatabase(spec.database.trim());
  req.setSchema(spec.schema.trim());
  req.setTable(spec.table.trim());
  req.setName(spec.name.trim());
  req.setColumnsList(spec.columns);
  if (spec.method) req.setMethod(spec.method.trim());
  if (spec.unique) req.setUnique(true);
  if (spec.concurrently) req.setConcurrently(true);
  if (spec.where) req.setWhere(spec.where.trim());
  if (spec.if_not_exists) req.setIfNotExists(true);
  if (spec.tablespace) req.setTablespace(spec.tablespace.trim());
  if (spec.include) req.setInclude(spec.include.trim());
  try {
    const resp = await postgresqlAdminClient.createIndex(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось создать индекс");
  } catch (err) {
    throw grpcError(err, "Не удалось создать индекс");
  }
}

export async function dropIndex(
  database: string,
  schema: string,
  name: string,
  opts?: { if_exists?: boolean; concurrently?: boolean; cascade?: boolean },
) {
  const req = new pgAdminPb.IndexName();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setName(name.trim());
  if (opts?.if_exists) req.setIfExists(true);
  if (opts?.concurrently) req.setConcurrently(true);
  if (opts?.cascade) req.setCascade(true);
  try {
    const resp = await postgresqlAdminClient.dropIndex(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить индекс");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить индекс");
  }
}

export async function reindex(params: {
  database: string;
  schema: string;
  table?: string;
  name?: string;
  concurrently?: boolean;
}) {
  const req = new pgAdminPb.ReindexRequest();
  req.setDatabase(params.database.trim());
  req.setSchema(params.schema.trim());
  if (params.table) req.setTable(params.table.trim());
  if (params.name) req.setName(params.name.trim());
  if (params.concurrently) req.setConcurrently(true);
  try {
    const resp = await postgresqlAdminClient.reindex(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось переиндексировать");
  } catch (err) {
    throw grpcError(err, "Не удалось переиндексировать");
  }
}

export async function executePostgresQuery(
  query: string,
  maxRows = 100,
  database?: string,
): Promise<PgQueryResult> {
  const req = new pgAdminPb.ExecuteQueryRequest();
  req.setQuery(query.trim());
  if (maxRows > 0) req.setMaxRows(maxRows);
  if (database?.trim()) req.setDatabase(database.trim());
  try {
    const resp = await postgresqlAdminClient.executeQuery(req);
    return {
      columns: resp.getColumnsList(),
      types: resp.getTypesList(),
      rows: resp.getRowsList().map((r) => r.getValuesList()),
      total_rows: resp.getTotalRows(),
      elapsed_seconds: resp.getElapsedSeconds(),
      rows_affected: resp.getRowsAffected(),
    };
  } catch (err) {
    throw grpcError(err, "Не удалось выполнить запрос PostgreSQL");
  }
}

export async function previewTableData(params: {
  database: string;
  schema: string;
  table: string;
  limit?: number;
  offset?: number;
  order_by?: string;
  where?: string;
}): Promise<PgQueryResult> {
  const req = new pgAdminPb.PreviewTableDataRequest();
  req.setDatabase(params.database.trim());
  req.setSchema(params.schema.trim());
  req.setTable(params.table.trim());
  if (params.limit) req.setLimit(params.limit);
  if (params.offset) req.setOffset(params.offset);
  if (params.order_by) req.setOrderBy(params.order_by.trim());
  if (params.where) req.setWhere(params.where.trim());
  try {
    const resp = await postgresqlAdminClient.previewTableData(req);
    return {
      columns: resp.getColumnsList(),
      types: resp.getTypesList(),
      rows: resp.getRowsList().map((r) => r.getValuesList()),
      total_rows: resp.getTotalRows(),
      elapsed_seconds: resp.getElapsedSeconds(),
      rows_affected: resp.getRowsAffected(),
    };
  } catch (err) {
    throw grpcError(err, "Не удалось получить превью данных таблицы");
  }
}

export async function listPartitions(
  database: string,
  schema: string,
  table: string,
): Promise<PgTablePartition[]> {
  const req = new pgAdminPb.ListPartitionsRequest();
  req.setDatabase(database.trim());
  req.setSchema(schema.trim());
  req.setTable(table.trim());
  try {
    const resp = await postgresqlAdminClient.listPartitions(req);
    return resp.getItemsList().map((p) => ({
      schema: p.getSchema(),
      name: p.getName(),
      expression: p.getExpression(),
      total_rows: p.getTotalRows(),
      total_bytes: p.getTotalBytes(),
    }));
  } catch (err) {
    throw grpcError(err, "Не удалось получить список партиций");
  }
}

export async function dropPartition(params: {
  database: string;
  schema: string;
  table: string;
  name: string;
  detach?: boolean;
  concurrently?: boolean;
  cascade?: boolean;
}) {
  const req = new pgAdminPb.DropPartitionRequest();
  req.setDatabase(params.database.trim());
  req.setSchema(params.schema.trim());
  req.setTable(params.table.trim());
  req.setName(params.name.trim());
  if (params.detach) req.setDetach(true);
  if (params.concurrently) req.setConcurrently(true);
  if (params.cascade) req.setCascade(true);
  try {
    const resp = await postgresqlAdminClient.dropPartition(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось удалить партицию");
  } catch (err) {
    throw grpcError(err, "Не удалось удалить партицию");
  }
}

export async function listProcesses(database?: string, activeOnly = false): Promise<PgProcess[]> {
  const key = `PgListProcesses:${database || ""}:${activeOnly}`;
  return coalesce(key, async () => {
    const req = new pgAdminPb.ListProcessesRequest();
    if (database?.trim()) req.setDatabase(database.trim());
    if (activeOnly) req.setActiveOnly(true);
    try {
      const resp = await postgresqlAdminClient.listProcesses(req);
      return resp.getItemsList().map((p) => ({
        pid: p.getPid(),
        user: p.getUser(),
        database: p.getDatabase(),
        application_name: p.getApplicationName(),
        client_addr: p.getClientAddr(),
        state: p.getState(),
        wait_event_type: p.getWaitEventType(),
        wait_event: p.getWaitEvent(),
        query: p.getQuery(),
        backend_start: formatTimestamp(p.getBackendStart()) || "",
        query_start: formatTimestamp(p.getQueryStart()) || "",
        state_change: formatTimestamp(p.getStateChange()) || "",
        backend_type: p.getBackendType(),
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить список процессов PostgreSQL");
    }
  });
}

export async function killProcess(pid: number, terminate = false) {
  const req = new pgAdminPb.KillProcessRequest();
  req.setPid(pid);
  if (terminate) req.setTerminate(true);
  try {
    const resp = await postgresqlAdminClient.killProcess(req);
    if (!resp.getSuccess()) throw new Error(resp.getMessage() || "не удалось завершить процесс");
  } catch (err) {
    throw grpcError(err, "Не удалось завершить процесс");
  }
}

export async function listLocks(database?: string, grantedOnly = false): Promise<PgLock[]> {
  const key = `PgListLocks:${database || ""}:${grantedOnly}`;
  return coalesce(key, async () => {
    const req = new pgAdminPb.ListLocksRequest();
    if (database?.trim()) req.setDatabase(database.trim());
    if (grantedOnly) req.setGrantedOnly(true);
    try {
      const resp = await postgresqlAdminClient.listLocks(req);
      return resp.getItemsList().map((l) => ({
        pid: l.getPid(),
        locktype: l.getLocktype(),
        database: l.getDatabase(),
        relation: l.getRelation(),
        mode: l.getMode(),
        granted: l.getGranted(),
        fastpath: l.getFastpath(),
        query: l.getQuery(),
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить информацию о блокировках");
    }
  });
}

export async function listTablespaces(): Promise<PgTablespace[]> {
  return coalesce("PgListTablespaces", async () => {
    const req = new pgAdminPb.ListTablespacesRequest();
    try {
      const resp = await postgresqlAdminClient.listTablespaces(req);
      return resp.getItemsList().map((t) => ({
        name: t.getName(),
        owner: t.getOwner(),
        location: t.getLocation(),
        size_bytes: t.getSizeBytes(),
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить список tablespaces");
    }
  });
}

export async function getMetrics(database?: string): Promise<PgMetric[]> {
  const key = `PgGetMetrics:${database || ""}`;
  return coalesce(key, async () => {
    const req = new pgAdminPb.GetMetricsRequest();
    if (database?.trim()) req.setDatabase(database.trim());
    try {
      const resp = await postgresqlAdminClient.getMetrics(req);
      return resp.getMetricsList().map((m) => ({
        name: m.getName(),
        value: m.getValue(),
        description: m.getDescription(),
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить метрики PostgreSQL");
    }
  });
}

export async function getTableOptions(): Promise<PgTableOptions> {
  return coalesce("PgGetTableOptions", async () => {
    try {
      const resp = await postgresqlAdminClient.getTableOptions(
        new pgAdminPb.TableOptionsRequest(),
      );
      return {
        data_types: resp.getDataTypesList(),
        index_methods: resp.getIndexMethodsList(),
        collations: resp.getCollationsList(),
        tablespaces: resp.getTablespacesList(),
      };
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить каталоги типов/методов из PostgreSQL");
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
  return n === "postgres" || n === "template0" || n === "template1";
}

export function isSystemSchema(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === "pg_catalog" ||
    n === "information_schema" ||
    n === "pg_toast" ||
    n.startsWith("pg_temp_") ||
    n.startsWith("pg_toast_")
  );
}
