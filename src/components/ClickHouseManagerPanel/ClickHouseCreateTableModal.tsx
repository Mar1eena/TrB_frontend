import { memo, useCallback, useMemo, useRef, useState } from "react";
import { type ChColumnWrite, type ChTableOptions } from "../../api/clickhouse";

const DEFAULT_KIND_OPTIONS = ["", "DEFAULT", "MATERIALIZED", "ALIAS", "EPHEMERAL"];

type ColumnRow = {
  name: string;
  type: string;
  codec: string;
  default_kind: string;
  default_expression: string;
  ttl: string;
  comment: string;
};

function emptyColumnRow(): ColumnRow {
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
  const [tableName, setTableName] = useState("");
  const [tableEngine, setTableEngine] = useState("MergeTree");
  const [engineParams, setEngineParams] = useState("");
  const [orderBy, setOrderBy] = useState("");
  const [partitionBy, setPartitionBy] = useState("");
  const [primaryKey, setPrimaryKey] = useState("");
  const [sampleBy, setSampleBy] = useState("");
  const [tableTtl, setTableTtl] = useState("");
  const [tableComment, setTableComment] = useState("");
  const [columnRows, setColumnRows] = useState<ColumnRow[]>(() => [emptyColumnRow(), emptyColumnRow()]);
  const [tableSettings, setTableSettings] = useState<{ key: string; value: string }[]>([]);
  const [formError, setFormError] = useState("");
  const backdropPressed = useRef(false);

  const engines = options?.engines ?? [];
  const types = options?.data_types ?? [];
  const mtSettings = options?.merge_tree_settings ?? [];
  const codecs = options?.codecs ?? [];

  const engineParamsPlaceholder = useMemo(() => {
    if (tableEngine.includes("Replacing")) return "ver, is_deleted";
    if (tableEngine.includes("Collapsing")) return "sign";
    if (tableEngine.includes("Summing")) return "col1, col2";
    return "параметры через запятую (если нужны)";
  }, [tableEngine]);

  const updateColumn = useCallback((idx: number, patch: Partial<ColumnRow>) => {
    setColumnRows((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const updateSetting = useCallback((idx: number, patch: Partial<{ key: string; value: string }>) => {
    setTableSettings((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  return (
    <div
      className="ch-modal-backdrop"
      onMouseDown={(e) => {
        backdropPressed.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPressed.current && e.target === e.currentTarget) onClose();
        backdropPressed.current = false;
      }}
    >
      <div className="ch-modal-window is-xlarge" onClick={(e) => e.stopPropagation()}>
        <div className="ch-modal-head">
          <h3>Создание таблицы в базе {database}</h3>
          <button type="button" className="ch-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError("");
            const cols = columnRows
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
            if (cols.length === 0) {
              setFormError("Добавьте хотя бы одну колонку");
              return;
            }
            const settings: Record<string, string> = {};
            for (const row of tableSettings) {
              if (row.key.trim() && row.value.trim()) {
                settings[row.key.trim()] = row.value.trim();
              }
            }
            void onSubmit({
              database,
              name: tableName,
              engine: tableEngine,
              engine_params: engineParams
                ? engineParams.split(",").map((s) => s.trim()).filter(Boolean)
                : undefined,
              order_by: orderBy.trim() || undefined,
              partition_by: partitionBy.trim() || undefined,
              primary_key: primaryKey.trim() || undefined,
              sample_by: sampleBy.trim() || undefined,
              ttl: tableTtl.trim() || undefined,
              comment: tableComment.trim() || undefined,
              settings: Object.keys(settings).length ? settings : undefined,
              if_not_exists: true,
              columns: cols,
            }).catch((err) => {
              setFormError(err instanceof Error ? err.message : String(err));
            });
          }}
        >
          <div className="ch-modal-body">
            {formError && (
              <div className="ch-modal-alert is-err" role="alert">
                <div className="ch-modal-alert-text">⚠️ {formError}</div>
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
                <input
                  type="text"
                  required
                  pattern="^[A-Za-z_][A-Za-z0-9_]*$"
                  placeholder="hct_candles"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Движок (Engine) * — из system.table_engines</label>
                <input
                  type="text"
                  list="create-table-engines"
                  required
                  value={tableEngine}
                  onChange={(e) => setTableEngine(e.target.value)}
                  placeholder="MergeTree"
                />
              </div>
            </div>

            <div className="field">
              <label>Параметры ENGINE(...)</label>
              <input
                type="text"
                placeholder={engineParamsPlaceholder}
                value={engineParams}
                onChange={(e) => setEngineParams(e.target.value)}
              />
              <p className="ch-hint">
                Для MergeTree обычно пусто. Для ReplacingMergeTree — колонка версии; для
                CollapsingMergeTree — sign; для Kafka/NATS — параметры подключения.
              </p>
            </div>

            <p className="ch-modal-section-title">Ключи и TTL</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
              <div className="field">
                <label>ORDER BY</label>
                <input
                  type="text"
                  placeholder="(ticker, timestamp)"
                  value={orderBy}
                  onChange={(e) => setOrderBy(e.target.value)}
                />
              </div>
              <div className="field">
                <label>PARTITION BY</label>
                <input
                  type="text"
                  placeholder="toYYYYMM(timestamp)"
                  value={partitionBy}
                  onChange={(e) => setPartitionBy(e.target.value)}
                />
              </div>
              <div className="field">
                <label>PRIMARY KEY</label>
                <input
                  type="text"
                  placeholder="(ticker, timestamp) — если отличается от ORDER BY"
                  value={primaryKey}
                  onChange={(e) => setPrimaryKey(e.target.value)}
                />
              </div>
              <div className="field">
                <label>SAMPLE BY</label>
                <input
                  type="text"
                  placeholder="intHash64(user_id)"
                  value={sampleBy}
                  onChange={(e) => setSampleBy(e.target.value)}
                />
              </div>
              <div className="field">
                <label>TTL таблицы</label>
                <input
                  type="text"
                  placeholder="timestamp + INTERVAL 90 DAY DELETE"
                  value={tableTtl}
                  onChange={(e) => setTableTtl(e.target.value)}
                />
              </div>
              <div className="field">
                <label>COMMENT</label>
                <input
                  type="text"
                  placeholder="Описание таблицы"
                  value={tableComment}
                  onChange={(e) => setTableComment(e.target.value)}
                />
              </div>
            </div>

            <p className="ch-modal-section-title">SETTINGS (MergeTree)</p>
            <div className="field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label>Настройки таблицы — из system.merge_tree_settings</label>
                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={() => setTableSettings((prev) => [...prev, { key: "", value: "" }])}
                >
                  + Setting
                </button>
              </div>
              {tableSettings.length === 0 ? (
                <p className="ch-hint">
                  Например: index_granularity=8192, storage_policy=default, allow_nullable_key=1
                </p>
              ) : (
                <div className="ch-settings-list">
                  {tableSettings.map((row, idx) => (
                    <div key={idx} className="ch-settings-row">
                      <input
                        type="text"
                        list="create-table-mt-settings"
                        placeholder="имя setting"
                        value={row.key}
                        onChange={(e) => updateSetting(idx, { key: e.target.value })}
                      />
                      <input
                        type="text"
                        placeholder="значение"
                        value={row.value}
                        onChange={(e) => updateSetting(idx, { value: e.target.value })}
                      />
                      <button
                        type="button"
                        className="danger-btn sm"
                        onClick={() => setTableSettings((prev) => prev.filter((_, i) => i !== idx))}
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
                  onClick={() => setColumnRows((prev) => [...prev, emptyColumnRow()])}
                >
                  + Колонка
                </button>
              </div>
              <div className="ch-col-grid" style={{ marginTop: "0.35rem" }}>
                {columnRows.map((row, idx) => (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <div className="ch-col-row">
                      <input
                        type="text"
                        placeholder="имя"
                        value={row.name}
                        onChange={(e) => updateColumn(idx, { name: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        list="create-table-types"
                        placeholder="тип"
                        value={row.type}
                        onChange={(e) => updateColumn(idx, { type: e.target.value })}
                        required
                      />
                      <select
                        value={row.codec}
                        onChange={(e) => updateColumn(idx, { codec: e.target.value })}
                        title="CODEC"
                      >
                        <option value="">CODEC…</option>
                        {codecs.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={row.default_kind}
                        onChange={(e) => updateColumn(idx, { default_kind: e.target.value })}
                        title="DEFAULT kind"
                      >
                        {DEFAULT_KIND_OPTIONS.map((k) => (
                          <option key={k || "none"} value={k}>
                            {k || "kind…"}
                          </option>
                        ))}
                      </select>
                      {columnRows.length > 1 && (
                        <button
                          type="button"
                          className="danger-btn sm"
                          onClick={() => setColumnRows((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="ch-col-row">
                      <input
                        type="text"
                        placeholder="DEFAULT expression"
                        value={row.default_expression}
                        onChange={(e) => updateColumn(idx, { default_expression: e.target.value })}
                        disabled={!row.default_kind}
                      />
                      <input
                        type="text"
                        placeholder="TTL колонки"
                        value={row.ttl}
                        onChange={(e) => updateColumn(idx, { ttl: e.target.value })}
                      />
                      <input
                        type="text"
                        placeholder="comment"
                        value={row.comment}
                        onChange={(e) => updateColumn(idx, { comment: e.target.value })}
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
    </div>
  );
}

export default memo(CreateTableModal);
