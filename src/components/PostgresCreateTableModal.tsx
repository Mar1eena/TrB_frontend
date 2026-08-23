import { memo, useCallback, useMemo, useRef, useState } from "react";
import { type PgColumnWrite, type PgTableOptions } from "../api/postgresql";

type ColumnRow = {
  name: string;
  type: string;
  nullable: boolean;
  default_expression: string;
  is_identity: boolean;
  identity_generation: string;
  primary_key: boolean;
  unique: boolean;
  comment: string;
};

function emptyColumnRow(): ColumnRow {
  return {
    name: "",
    type: "text",
    nullable: true,
    default_expression: "",
    is_identity: false,
    identity_generation: "BY DEFAULT",
    primary_key: false,
    unique: false,
    comment: "",
  };
}

export type CreateTableSubmit = {
  database: string;
  schema: string;
  name: string;
  columns: PgColumnWrite[];
  primary_keys?: string[];
  comment?: string;
  unlogged?: boolean;
  temporary?: boolean;
  tablespace?: string;
  partition_by?: string;
  if_not_exists?: boolean;
};

type Props = {
  database: string;
  schema: string;
  busy: boolean;
  options: PgTableOptions | null;
  metaLoading: boolean;
  metaError: string;
  onClose: () => void;
  onSubmit: (spec: CreateTableSubmit) => Promise<void>;
};

function PostgresCreateTableModal({
  database,
  schema,
  busy,
  options,
  metaLoading,
  metaError,
  onClose,
  onSubmit,
}: Props) {
  const [tableName, setTableName] = useState("");
  const [tableSchema, setTableSchema] = useState(schema || "public");
  const [unlogged, setUnlogged] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [tablespace, setTablespace] = useState("");
  const [partitionBy, setPartitionBy] = useState("");
  const [tableComment, setTableComment] = useState("");
  const [columnRows, setColumnRows] = useState<ColumnRow[]>(() => [
    {
      name: "id",
      type: "bigint",
      nullable: false,
      default_expression: "",
      is_identity: true,
      identity_generation: "ALWAYS",
      primary_key: true,
      unique: true,
      comment: "Первичный ключ",
    },
    emptyColumnRow(),
  ]);
  const [formError, setFormError] = useState("");
  const backdropPressed = useRef(false);

  const types = useMemo(() => {
    const list = options?.data_types ?? [];
    if (list.length > 0) return list;
    return [
      "bigint",
      "integer",
      "smallint",
      "text",
      "varchar",
      "boolean",
      "timestamp with time zone",
      "timestamp without time zone",
      "date",
      "time",
      "numeric",
      "double precision",
      "real",
      "jsonb",
      "json",
      "uuid",
      "bytea",
      "inet",
    ];
  }, [options?.data_types]);

  const tablespaces = options?.tablespaces ?? [];

  const updateColumn = useCallback((idx: number, patch: Partial<ColumnRow>) => {
    setColumnRows((prev) => {
      const next = prev.slice();
      const updated = { ...next[idx], ...patch };
      // If primary_key is checked, ensure not nullable
      if (patch.primary_key === true) {
        updated.nullable = false;
      }
      next[idx] = updated;
      return next;
    });
  }, []);

  return (
    <div
      className="pg-modal-backdrop"
      onMouseDown={(e) => {
        backdropPressed.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPressed.current && e.target === e.currentTarget) onClose();
        backdropPressed.current = false;
      }}
    >
      <div className="pg-modal-window is-xlarge" onClick={(e) => e.stopPropagation()}>
        <div className="pg-modal-head">
          <h3>Создание таблицы в {database}.{tableSchema}</h3>
          <button type="button" className="pg-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError("");
            const validCols = columnRows.filter((r) => r.name.trim());
            if (validCols.length === 0) {
              setFormError("Добавьте хотя бы одну колонку");
              return;
            }

            const pks = validCols.filter((r) => r.primary_key).map((r) => r.name.trim());

            const cols: PgColumnWrite[] = validCols.map((r) => ({
              name: r.name.trim(),
              type: r.type.trim(),
              nullable: r.primary_key ? false : r.nullable,
              default_expression: r.default_expression.trim() || undefined,
              is_identity: r.is_identity || undefined,
              identity_generation: r.is_identity ? r.identity_generation : undefined,
              primary_key: r.primary_key || undefined,
              unique: r.unique || undefined,
              comment: r.comment.trim() || undefined,
            }));

            void onSubmit({
              database,
              schema: tableSchema.trim() || "public",
              name: tableName.trim(),
              columns: cols,
              primary_keys: pks.length > 0 ? pks : undefined,
              comment: tableComment.trim() || undefined,
              unlogged,
              temporary,
              tablespace: tablespace.trim() || undefined,
              partition_by: partitionBy.trim() || undefined,
              if_not_exists: true,
            }).catch((err) => {
              setFormError(err instanceof Error ? err.message : String(err));
            });
          }}
        >
          <div className="pg-modal-body">
            {formError && (
              <div className="pg-modal-alert is-err" role="alert">
                <div className="pg-modal-alert-text">⚠️ {formError}</div>
                <button
                  type="button"
                  className="dismiss-btn"
                  onClick={() => setFormError("")}
                  title="Закрыть"
                >
                  ×
                </button>
              </div>
            )}

            {metaLoading && (
              <p className="pg-hint">Загрузка типов и каталогов PostgreSQL…</p>
            )}
            {metaError && (
              <div className="pg-modal-alert is-warn" role="status">
                <div className="pg-modal-alert-text">
                  Не удалось загрузить каталоги: {metaError}. Можно ввести типы вручную.
                </div>
              </div>
            )}

            <p className="pg-modal-section-title">Основное</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "0.65rem" }}>
              <div className="field">
                <label>Схема *</label>
                <input
                  type="text"
                  required
                  placeholder="public"
                  value={tableSchema}
                  onChange={(e) => setTableSchema(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Имя таблицы *</label>
                <input
                  type="text"
                  required
                  pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                  placeholder="user_orders"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
              <div className="field">
                <label>Табличное пространство (Tablespace)</label>
                <input
                  type="text"
                  list="pg-create-tablespaces"
                  placeholder="pg_default"
                  value={tablespace}
                  onChange={(e) => setTablespace(e.target.value)}
                />
              </div>
              <div className="field">
                <label>PARTITION BY (если секционированная)</label>
                <input
                  type="text"
                  placeholder="RANGE (created_at)"
                  value={partitionBy}
                  onChange={(e) => setPartitionBy(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", margin: "0.4rem 0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.82rem" }}>
                <input
                  type="checkbox"
                  checked={unlogged}
                  onChange={(e) => setUnlogged(e.target.checked)}
                />
                <strong>UNLOGGED Таблица</strong> (быстрее запись, не пишется в WAL)
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.82rem" }}>
                <input
                  type="checkbox"
                  checked={temporary}
                  onChange={(e) => setTemporary(e.target.checked)}
                />
                <strong>TEMPORARY Таблица</strong> (временная для сессии)
              </label>
            </div>

            <div className="field">
              <label>Комментарий к таблице (COMMENT)</label>
              <input
                type="text"
                placeholder="Описание назначения таблицы"
                value={tableComment}
                onChange={(e) => setTableComment(e.target.value)}
              />
            </div>

            <p className="pg-modal-section-title">Колонки</p>
            <div className="field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Список колонок *</label>
                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={() => setColumnRows((prev) => [...prev, emptyColumnRow()])}
                >
                  + Добавить колонку
                </button>
              </div>

              <div className="pg-col-grid" style={{ marginTop: "0.35rem" }}>
                {columnRows.map((row, idx) => (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.4rem", background: "rgba(255, 255, 255, 0.02)", borderRadius: "0.4rem", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <div className="pg-col-row">
                      <input
                        type="text"
                        placeholder="имя колонки"
                        value={row.name}
                        onChange={(e) => updateColumn(idx, { name: e.target.value })}
                        required
                        style={{ flex: 1.2 }}
                      />
                      <input
                        type="text"
                        list="pg-create-types"
                        placeholder="тип (bigint, text...)"
                        value={row.type}
                        onChange={(e) => updateColumn(idx, { type: e.target.value })}
                        required
                        style={{ flex: 1 }}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem" }} title="Primary Key">
                        <input
                          type="checkbox"
                          checked={row.primary_key}
                          onChange={(e) => updateColumn(idx, { primary_key: e.target.checked })}
                        />
                        PK
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem" }} title="Nullable">
                        <input
                          type="checkbox"
                          checked={row.nullable}
                          disabled={row.primary_key}
                          onChange={(e) => updateColumn(idx, { nullable: e.target.checked })}
                        />
                        NULL
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem" }} title="Unique">
                        <input
                          type="checkbox"
                          checked={row.unique}
                          onChange={(e) => updateColumn(idx, { unique: e.target.checked })}
                        />
                        UQ
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem" }} title="Identity GENERATED ALWAYS / BY DEFAULT">
                        <input
                          type="checkbox"
                          checked={row.is_identity}
                          onChange={(e) => updateColumn(idx, { is_identity: e.target.checked })}
                        />
                        Identity
                      </label>
                      {columnRows.length > 1 && (
                        <button
                          type="button"
                          className="danger-btn sm"
                          onClick={() => setColumnRows((prev) => prev.filter((_, i) => i !== idx))}
                          title="Удалить колонку"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="pg-col-row">
                      <input
                        type="text"
                        placeholder="DEFAULT (напр: now(), gen_random_uuid(), 0)"
                        value={row.default_expression}
                        onChange={(e) => updateColumn(idx, { default_expression: e.target.value })}
                        style={{ flex: 1.5 }}
                      />
                      {row.is_identity ? (
                        <select
                          value={row.identity_generation}
                          onChange={(e) => updateColumn(idx, { identity_generation: e.target.value })}
                          style={{ flex: 1 }}
                        >
                          <option value="ALWAYS">ALWAYS</option>
                          <option value="BY DEFAULT">BY DEFAULT</option>
                        </select>
                      ) : null}
                      <input
                        type="text"
                        placeholder="комментарий"
                        value={row.comment}
                        onChange={(e) => updateColumn(idx, { comment: e.target.value })}
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pg-modal-foot">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="primary-btn" disabled={busy || !tableName.trim()}>
              {busy ? "Создание..." : "Создать таблицу"}
            </button>
          </div>
        </form>

        <datalist id="pg-create-types">
          {types.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <datalist id="pg-create-tablespaces">
          {tablespaces.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

export default memo(PostgresCreateTableModal);
