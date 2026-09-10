import { memo, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ModalBackdrop } from "../common/ModalBackdrop";
import { type PgColumnWrite, type PgTableOptions } from "../../api/postgresql";

const columnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  default_expression: z.string(),
  is_identity: z.boolean(),
  identity_generation: z.string(),
  primary_key: z.boolean(),
  unique: z.boolean(),
  comment: z.string(),
});

const formSchema = z.object({
  name: z
    .string()
    .min(1, "Укажите имя таблицы")
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Только латиница, цифры и _; не с цифры"),
  schema: z.string().min(1, "Укажите схему"),
  unlogged: z.boolean(),
  temporary: z.boolean(),
  tablespace: z.string(),
  partitionBy: z.string(),
  comment: z.string(),
  columns: z.array(columnSchema).refine((rows) => rows.some((r) => r.name.trim()), {
    message: "Добавьте хотя бы одну колонку",
  }),
});

type FormValues = z.infer<typeof formSchema>;

function emptyColumn(): FormValues["columns"][number] {
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
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      schema: schema || "public",
      unlogged: false,
      temporary: false,
      tablespace: "",
      partitionBy: "",
      comment: "",
      columns: [
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
        emptyColumn(),
      ],
    },
  });

  const columns = useFieldArray({ control, name: "columns" });

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

  const tableName = watch("name");
  const tableSchema = watch("schema");
  const columnRows = watch("columns");

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    const validCols = values.columns.filter((r) => r.name.trim());
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
    try {
      await onSubmit({
        database,
        schema: values.schema.trim() || "public",
        name: values.name.trim(),
        columns: cols,
        primary_keys: pks.length > 0 ? pks : undefined,
        comment: values.comment.trim() || undefined,
        unlogged: values.unlogged,
        temporary: values.temporary,
        tablespace: values.tablespace.trim() || undefined,
        partition_by: values.partitionBy.trim() || undefined,
        if_not_exists: true,
      });
    } catch (err) {
      setError("root", { message: err instanceof Error ? err.message : String(err) });
    }
  });

  const formError =
    errors.root?.message ||
    errors.columns?.root?.message ||
    errors.columns?.message ||
    errors.name?.message ||
    errors.schema?.message ||
    "";

  return (
    <ModalBackdrop onClose={onClose} className="pg-modal-backdrop" title="Создание таблицы">
      <div className="pg-modal-window is-xlarge" onClick={(e) => e.stopPropagation()}>
        <div className="pg-modal-head">
          <h3>
            Создание таблицы в {database}.{tableSchema}
          </h3>
          <button type="button" className="pg-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="pg-modal-body">
            {formError && (
              <div className="pg-modal-alert is-err" role="alert">
                <div className="pg-modal-alert-text">⚠️ {formError}</div>
                <button
                  type="button"
                  className="dismiss-btn"
                  onClick={() => clearErrors()}
                  title="Закрыть"
                >
                  ×
                </button>
              </div>
            )}

            {metaLoading && <p className="pg-hint">Загрузка типов и каталогов PostgreSQL…</p>}
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
                <input type="text" placeholder="public" {...register("schema")} />
              </div>
              <div className="field">
                <label>Имя таблицы *</label>
                <input type="text" placeholder="user_orders" autoFocus {...register("name")} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
              <div className="field">
                <label>Табличное пространство (Tablespace)</label>
                <input
                  type="text"
                  list="pg-create-tablespaces"
                  placeholder="pg_default"
                  {...register("tablespace")}
                />
              </div>
              <div className="field">
                <label>PARTITION BY (если секционированная)</label>
                <input type="text" placeholder="RANGE (created_at)" {...register("partitionBy")} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", margin: "0.4rem 0" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                <input type="checkbox" {...register("unlogged")} />
                <strong>UNLOGGED Таблица</strong> (быстрее запись, не пишется в WAL)
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                <input type="checkbox" {...register("temporary")} />
                <strong>TEMPORARY Таблица</strong> (временная для сессии)
              </label>
            </div>

            <div className="field">
              <label>Комментарий к таблице (COMMENT)</label>
              <input
                type="text"
                placeholder="Описание назначения таблицы"
                {...register("comment")}
              />
            </div>

            <p className="pg-modal-section-title">Колонки</p>
            <div className="field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Список колонок *</label>
                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={() => columns.append(emptyColumn())}
                >
                  + Добавить колонку
                </button>
              </div>

              <div className="pg-col-grid" style={{ marginTop: "0.35rem" }}>
                {columns.fields.map((field, idx) => {
                  const row = columnRows?.[idx];
                  return (
                    <div
                      key={field.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                        padding: "0.4rem",
                        background: "rgba(255, 255, 255, 0.02)",
                        borderRadius: "0.4rem",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                      }}
                    >
                      <div className="pg-col-row">
                        <input
                          type="text"
                          placeholder="имя колонки"
                          style={{ flex: 1.2 }}
                          {...register(`columns.${idx}.name`)}
                        />
                        <input
                          type="text"
                          list="pg-create-types"
                          placeholder="тип (bigint, text...)"
                          style={{ flex: 1 }}
                          {...register(`columns.${idx}.type`)}
                        />
                        <label
                          style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem" }}
                          title="Primary Key"
                        >
                          <input
                            type="checkbox"
                            {...register(`columns.${idx}.primary_key`, {
                              onChange: (e) => {
                                if (e.target.checked) setValue(`columns.${idx}.nullable`, false);
                              },
                            })}
                          />
                          PK
                        </label>
                        <label
                          style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem" }}
                          title="Nullable"
                        >
                          <input
                            type="checkbox"
                            disabled={row?.primary_key}
                            {...register(`columns.${idx}.nullable`)}
                          />
                          NULL
                        </label>
                        <label
                          style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem" }}
                          title="Unique"
                        >
                          <input type="checkbox" {...register(`columns.${idx}.unique`)} />
                          UQ
                        </label>
                        <label
                          style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem" }}
                          title="Identity GENERATED ALWAYS / BY DEFAULT"
                        >
                          <input type="checkbox" {...register(`columns.${idx}.is_identity`)} />
                          Identity
                        </label>
                        {columns.fields.length > 1 && (
                          <button
                            type="button"
                            className="danger-btn sm"
                            onClick={() => columns.remove(idx)}
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
                          style={{ flex: 1.5 }}
                          {...register(`columns.${idx}.default_expression`)}
                        />
                        {row?.is_identity ? (
                          <select
                            style={{ flex: 1 }}
                            {...register(`columns.${idx}.identity_generation`)}
                          >
                            <option value="ALWAYS">ALWAYS</option>
                            <option value="BY DEFAULT">BY DEFAULT</option>
                          </select>
                        ) : null}
                        <input
                          type="text"
                          placeholder="комментарий"
                          style={{ flex: 1 }}
                          {...register(`columns.${idx}.comment`)}
                        />
                      </div>
                    </div>
                  );
                })}
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
    </ModalBackdrop>
  );
}

export default memo(PostgresCreateTableModal);
