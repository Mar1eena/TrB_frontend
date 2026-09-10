import { memo, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type ChColumnWrite, type ChTableOptions } from "../../api/clickhouse";
import { ModalBackdrop } from "../common/ModalBackdrop";

const DEFAULT_KIND_OPTIONS = ["", "DEFAULT", "MATERIALIZED", "ALIAS", "EPHEMERAL"];

const columnSchema = z.object({
  name: z.string(),
  type: z.string(),
  codec: z.string(),
  default_kind: z.string(),
  default_expression: z.string(),
  ttl: z.string(),
  comment: z.string(),
});

const settingSchema = z.object({ key: z.string(), value: z.string() });

const schema = z.object({
  name: z
    .string()
    .min(1, "Укажите имя таблицы")
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Только латиница, цифры и _; не с цифры"),
  engine: z.string().min(1, "Укажите движок"),
  engineParams: z.string(),
  orderBy: z.string(),
  partitionBy: z.string(),
  primaryKey: z.string(),
  sampleBy: z.string(),
  ttl: z.string(),
  comment: z.string(),
  columns: z.array(columnSchema).refine((rows) => rows.some((r) => r.name.trim()), {
    message: "Добавьте хотя бы одну колонку",
  }),
  settings: z.array(settingSchema),
});

type FormValues = z.infer<typeof schema>;

function emptyColumn(): FormValues["columns"][number] {
  return {
    name: "",
    type: "String",
    codec: "",
    default_kind: "",
    default_expression: "",
    ttl: "",
    comment: "",
  };
}

const DEFAULTS: FormValues = {
  name: "",
  engine: "MergeTree",
  engineParams: "",
  orderBy: "",
  partitionBy: "",
  primaryKey: "",
  sampleBy: "",
  ttl: "",
  comment: "",
  columns: [emptyColumn(), emptyColumn()],
  settings: [],
};

export type CreateTableSubmit = {
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
};

type Props = {
  database: string;
  busy: boolean;
  options: ChTableOptions | null;
  metaLoading: boolean;
  metaError: string;
  onClose: () => void;
  onSubmit: (spec: CreateTableSubmit) => Promise<void>;
};

function CreateTableModal({
  database,
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
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: DEFAULTS,
    resolver: zodResolver(schema),
  });

  const columns = useFieldArray({ control, name: "columns" });
  const settings = useFieldArray({ control, name: "settings" });

  const engines = options?.engines ?? [];
  const types = options?.data_types ?? [];
  const mtSettings = options?.merge_tree_settings ?? [];
  const codecs = options?.codecs ?? [];

  const tableEngine = watch("engine");
  const tableName = watch("name");
  const columnRows = watch("columns");

  const engineParamsPlaceholder = useMemo(() => {
    if (tableEngine.includes("Replacing")) return "ver, is_deleted";
    if (tableEngine.includes("Collapsing")) return "sign";
    if (tableEngine.includes("Summing")) return "col1, col2";
    return "параметры через запятую (если нужны)";
  }, [tableEngine]);

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    const cols = values.columns
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        type: r.type.trim(),
        codec: r.codec.trim() || undefined,
        default_kind: r.default_kind.trim() || undefined,
        default_expression: r.default_expression.trim() || undefined,
        ttl: r.ttl.trim() || undefined,
        comment: r.comment.trim() || undefined,
      }));
    const settingsMap: Record<string, string> = {};
    for (const row of values.settings) {
      if (row.key.trim() && row.value.trim()) settingsMap[row.key.trim()] = row.value.trim();
    }
    try {
      await onSubmit({
        database,
        name: values.name,
        engine: values.engine,
        engine_params: values.engineParams
          ? values.engineParams.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        order_by: values.orderBy.trim() || undefined,
        partition_by: values.partitionBy.trim() || undefined,
        primary_key: values.primaryKey.trim() || undefined,
        sample_by: values.sampleBy.trim() || undefined,
        ttl: values.ttl.trim() || undefined,
        comment: values.comment.trim() || undefined,
        settings: Object.keys(settingsMap).length ? settingsMap : undefined,
        if_not_exists: true,
        columns: cols,
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
    errors.engine?.message ||
    "";

  return (
    <ModalBackdrop onClose={onClose} className="ch-modal-backdrop" title="Создание таблицы">
      <div className="ch-modal-window is-xlarge" onClick={(e) => e.stopPropagation()}>
        <div className="ch-modal-head">
          <h3>Создание таблицы в базе {database}</h3>
          <button type="button" className="ch-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="ch-modal-body">
            {formError && (
              <div className="ch-modal-alert is-err" role="alert">
                <div className="ch-modal-alert-text">⚠️ {formError}</div>
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
            {metaLoading && (
              <p className="ch-hint">Загрузка типов, движков и SETTINGS из ClickHouse…</p>
            )}
            {metaError && (
              <div className="ch-modal-alert is-warn" role="status">
                <div className="ch-modal-alert-text">
                  Не удалось загрузить каталоги: {metaError}. Можно ввести значения вручную.
                </div>
              </div>
            )}

            <p className="ch-modal-section-title">Основное</p>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "0.65rem" }}>
              <div className="field">
                <label>Имя таблицы *</label>
                <input type="text" placeholder="hct_candles" autoFocus {...register("name")} />
              </div>
              <div className="field">
                <label>Движок (Engine) * — из system.table_engines</label>
                <input
                  type="text"
                  list="create-table-engines"
                  placeholder="MergeTree"
                  {...register("engine")}
                />
              </div>
            </div>

            <div className="field">
              <label>Параметры ENGINE(...)</label>
              <input type="text" placeholder={engineParamsPlaceholder} {...register("engineParams")} />
              <p className="ch-hint">
                Для MergeTree обычно пусто. Для ReplacingMergeTree — колонка версии; для
                CollapsingMergeTree — sign; для Kafka/NATS — параметры подключения.
              </p>
            </div>

            <p className="ch-modal-section-title">Ключи и TTL</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
              <div className="field">
                <label>ORDER BY</label>
                <input type="text" placeholder="(ticker, timestamp)" {...register("orderBy")} />
              </div>
              <div className="field">
                <label>PARTITION BY</label>
                <input type="text" placeholder="toYYYYMM(timestamp)" {...register("partitionBy")} />
              </div>
              <div className="field">
                <label>PRIMARY KEY</label>
                <input
                  type="text"
                  placeholder="(ticker, timestamp) — если отличается от ORDER BY"
                  {...register("primaryKey")}
                />
              </div>
              <div className="field">
                <label>SAMPLE BY</label>
                <input type="text" placeholder="intHash64(user_id)" {...register("sampleBy")} />
              </div>
              <div className="field">
                <label>TTL таблицы</label>
                <input
                  type="text"
                  placeholder="timestamp + INTERVAL 90 DAY DELETE"
                  {...register("ttl")}
                />
              </div>
              <div className="field">
                <label>COMMENT</label>
                <input type="text" placeholder="Описание таблицы" {...register("comment")} />
              </div>
            </div>

            <p className="ch-modal-section-title">SETTINGS (MergeTree)</p>
            <div className="field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Настройки таблицы — из system.merge_tree_settings</label>
                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={() => settings.append({ key: "", value: "" })}
                >
                  + Setting
                </button>
              </div>
              {settings.fields.length === 0 ? (
                <p className="ch-hint">
                  Например: index_granularity=8192, storage_policy=default, allow_nullable_key=1
                </p>
              ) : (
                <div className="ch-settings-list">
                  {settings.fields.map((field, idx) => (
                    <div key={field.id} className="ch-settings-row">
                      <input
                        type="text"
                        list="create-table-mt-settings"
                        placeholder="имя setting"
                        {...register(`settings.${idx}.key`)}
                      />
                      <input
                        type="text"
                        placeholder="значение"
                        {...register(`settings.${idx}.value`)}
                      />
                      <button
                        type="button"
                        className="danger-btn sm"
                        onClick={() => settings.remove(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="ch-modal-section-title">Колонки</p>
            <div className="field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Колонки * — типы из system.data_type_families</label>
                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={() => columns.append(emptyColumn())}
                >
                  + Колонка
                </button>
              </div>
              <div className="ch-col-grid" style={{ marginTop: "0.35rem" }}>
                {columns.fields.map((field, idx) => (
                  <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <div className="ch-col-row">
                      <input type="text" placeholder="имя" {...register(`columns.${idx}.name`)} />
                      <input
                        type="text"
                        list="create-table-types"
                        placeholder="тип"
                        {...register(`columns.${idx}.type`)}
                      />
                      <select {...register(`columns.${idx}.codec`)} title="CODEC">
                        <option value="">CODEC…</option>
                        {codecs.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select {...register(`columns.${idx}.default_kind`)} title="DEFAULT kind">
                        {DEFAULT_KIND_OPTIONS.map((k) => (
                          <option key={k || "none"} value={k}>
                            {k || "kind…"}
                          </option>
                        ))}
                      </select>
                      {columns.fields.length > 1 && (
                        <button
                          type="button"
                          className="danger-btn sm"
                          onClick={() => columns.remove(idx)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="ch-col-row">
                      <input
                        type="text"
                        placeholder="DEFAULT expression"
                        disabled={!columnRows?.[idx]?.default_kind}
                        {...register(`columns.${idx}.default_expression`)}
                      />
                      <input
                        type="text"
                        placeholder="TTL колонки"
                        {...register(`columns.${idx}.ttl`)}
                      />
                      <input
                        type="text"
                        placeholder="comment"
                        {...register(`columns.${idx}.comment`)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="ch-hint">
                Можно ввести параметризованный тип вручную: Nullable(…), Array(…), Decimal(p,s),
                DateTime64(3), LowCardinality(String) и т.д.
              </p>
            </div>
          </div>
          <div className="ch-modal-foot">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="primary-btn" disabled={busy || !tableName.trim()}>
              {busy ? "Создание..." : "Создать таблицу"}
            </button>
          </div>
        </form>

        <datalist id="create-table-types">
          {types.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <datalist id="create-table-engines">
          {engines.map((eng) => (
            <option key={eng} value={eng} />
          ))}
        </datalist>
        <datalist id="create-table-mt-settings">
          {mtSettings.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </ModalBackdrop>
  );
}

export default memo(CreateTableModal);
