import { useForm } from "react-hook-form";
import type { PgColumn } from "../../api/postgresql";
import { ModalBackdrop } from "../common/ModalBackdrop";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CHK = {
  display: "flex",
  alignItems: "center",
  gap: "0.3rem",
  fontSize: "0.8rem",
  cursor: "pointer",
} as const;

function Shell({
  title,
  onClose,
  large,
  children,
}: {
  title: string;
  onClose: () => void;
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ModalBackdrop onClose={onClose} className="pg-modal-backdrop" title={title}>
      <div
        className={`pg-modal-window${large ? " is-large" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pg-modal-head">
          <h3>{title}</h3>
          <button type="button" className="pg-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </ModalBackdrop>
  );
}

function Foot({
  onClose,
  disabled,
  label,
  busyLabel,
  busy,
}: {
  onClose: () => void;
  disabled: boolean;
  label: string;
  busyLabel: string;
  busy: boolean;
}) {
  return (
    <div className="pg-modal-foot">
      <button type="button" className="secondary-btn" onClick={onClose}>
        Отмена
      </button>
      <button type="submit" className="primary-btn" disabled={disabled}>
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}

// ————— Создание базы —————

export type CreateDbValues = {
  name: string;
  owner: string;
  encoding: string;
  tablespace: string;
};

export function CreateDbForm({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: CreateDbValues) => void;
}) {
  const { register, handleSubmit, watch, formState } = useForm<CreateDbValues>({
    defaultValues: { name: "", owner: "", encoding: "UTF8", tablespace: "" },
  });
  return (
    <Shell title="Создание базы данных PostgreSQL" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="pg-modal-body">
          <div className="field">
            <label>Имя базы данных *</label>
            <input
              type="text"
              placeholder="app_production"
              autoFocus
              {...register("name", { pattern: NAME_RE })}
            />
          </div>
          <div className="field">
            <label>Владелец (Owner, опционально)</label>
            <input type="text" placeholder="postgres" {...register("owner")} />
          </div>
          <div className="field">
            <label>Кодировка (Encoding)</label>
            <select {...register("encoding")}>
              <option value="UTF8">UTF8 (рекомендуется)</option>
              <option value="LATIN1">LATIN1</option>
              <option value="WIN1251">WIN1251</option>
            </select>
          </div>
          <div className="field">
            <label>Табличное пространство (Tablespace, опционально)</label>
            <input type="text" placeholder="pg_default" {...register("tablespace")} />
          </div>
        </div>
        <Foot
          onClose={onClose}
          busy={busy}
          label="Создать базу"
          busyLabel="Создание..."
          disabled={busy || !watch("name").trim() || !!formState.errors.name}
        />
      </form>
    </Shell>
  );
}

// ————— Создание схемы —————

export type CreateSchemaValues = { name: string; owner: string };

export function CreateSchemaForm({
  busy,
  database,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  database: string;
  onClose: () => void;
  onSubmit: (v: CreateSchemaValues) => void;
}) {
  const { register, handleSubmit, watch, formState } = useForm<CreateSchemaValues>({
    defaultValues: { name: "", owner: "" },
  });
  return (
    <Shell title={`Создание схемы в базе ${database}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="pg-modal-body">
          <div className="field">
            <label>Имя схемы *</label>
            <input
              type="text"
              placeholder="analytics"
              autoFocus
              {...register("name", { pattern: NAME_RE })}
            />
          </div>
          <div className="field">
            <label>Владелец (Owner, опционально)</label>
            <input type="text" placeholder="postgres" {...register("owner")} />
          </div>
        </div>
        <Foot
          onClose={onClose}
          busy={busy}
          label="Создать схему"
          busyLabel="Создание..."
          disabled={busy || !watch("name").trim() || !!formState.errors.name}
        />
      </form>
    </Shell>
  );
}

// ————— Добавление колонки —————

export type AddColumnValues = {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  unique: boolean;
  is_identity: boolean;
  identity_generation: string;
  default_expression: string;
  comment: string;
};

export function AddColumnForm({
  busy,
  tableName,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  tableName: string;
  onClose: () => void;
  onSubmit: (v: AddColumnValues) => void;
}) {
  const { register, handleSubmit, watch, setValue, formState } = useForm<AddColumnValues>({
    defaultValues: {
      name: "",
      type: "text",
      nullable: true,
      primary_key: false,
      unique: false,
      is_identity: false,
      identity_generation: "BY DEFAULT",
      default_expression: "",
      comment: "",
    },
  });
  const isIdentity = watch("is_identity");
  const primaryKey = watch("primary_key");
  return (
    <Shell title={`Добавить колонку в ${tableName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="pg-modal-body">
          <div className="field">
            <label>Имя колонки *</label>
            <input
              type="text"
              placeholder="status"
              autoFocus
              {...register("name", { pattern: NAME_RE })}
            />
          </div>
          <div className="field">
            <label>Тип данных *</label>
            <input type="text" placeholder="text, bigint, jsonb..." {...register("type")} />
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <label style={CHK}>
              <input type="checkbox" disabled={primaryKey} {...register("nullable")} />
              Nullable (NULL)
            </label>
            <label style={CHK}>
              <input
                type="checkbox"
                {...register("primary_key", {
                  onChange: (e) => {
                    if (e.target.checked) setValue("nullable", false);
                  },
                })}
              />
              PRIMARY KEY
            </label>
            <label style={CHK}>
              <input type="checkbox" {...register("unique")} />
              UNIQUE
            </label>
            <label style={CHK}>
              <input type="checkbox" {...register("is_identity")} />
              IDENTITY
            </label>
            {isIdentity && (
              <select
                style={{ fontSize: "0.8rem", padding: "0.15rem 0.35rem" }}
                {...register("identity_generation")}
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
              {...register("default_expression")}
            />
          </div>
          <div className="field">
            <label>Комментарий (COMMENT)</label>
            <input type="text" placeholder="Описание колонки" {...register("comment")} />
          </div>
        </div>
        <Foot
          onClose={onClose}
          busy={busy}
          label="Добавить колонку"
          busyLabel="Добавление..."
          disabled={busy || !watch("name").trim() || !!formState.errors.name}
        />
      </form>
    </Shell>
  );
}

// ————— Изменение колонки —————

export type ModifyColumnValues = {
  type: string;
  nullable: boolean;
  default_expression: string;
  comment: string;
};

export function ModifyColumnForm({
  busy,
  column,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  column: PgColumn;
  onClose: () => void;
  onSubmit: (v: ModifyColumnValues) => void;
}) {
  const { register, handleSubmit, watch } = useForm<ModifyColumnValues>({
    defaultValues: {
      type: column.type,
      nullable: column.nullable,
      default_expression: column.default_expression,
      comment: column.comment,
    },
  });
  return (
    <Shell title={`Изменить колонку ${column.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="pg-modal-body">
          <div className="field">
            <label>Тип данных *</label>
            <input type="text" autoFocus {...register("type")} />
          </div>
          <label style={{ ...CHK, fontSize: "0.8rem" }}>
            <input type="checkbox" {...register("nullable")} />
            Nullable (NULL)
          </label>
          <div className="field">
            <label>Значение по умолчанию (DEFAULT expression)</label>
            <input type="text" {...register("default_expression")} />
          </div>
          <div className="field">
            <label>Комментарий</label>
            <input type="text" {...register("comment")} />
          </div>
        </div>
        <Foot
          onClose={onClose}
          busy={busy}
          label="Сохранить изменения"
          busyLabel="Сохранение..."
          disabled={busy || !watch("type").trim()}
        />
      </form>
    </Shell>
  );
}

// ————— Переименование колонки —————

export function RenameColumnForm({
  busy,
  columnName,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  columnName: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const { register, handleSubmit, watch, formState } = useForm<{ name: string }>({
    defaultValues: { name: columnName },
  });
  return (
    <Shell title={`Переименовать колонку ${columnName}`} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => onSubmit(v.name))}>
        <div className="pg-modal-body">
          <div className="field">
            <label>Новое имя колонки *</label>
            <input type="text" autoFocus {...register("name", { pattern: NAME_RE })} />
          </div>
        </div>
        <Foot
          onClose={onClose}
          busy={busy}
          label="Переименовать"
          busyLabel="Переименование..."
          disabled={busy || !watch("name").trim() || !!formState.errors.name}
        />
      </form>
    </Shell>
  );
}

// ————— Переименование / перенос таблицы —————

export type RenameTableValues = { name: string; schema: string };

export function RenameTableForm({
  busy,
  tableName,
  currentSchema,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  tableName: string;
  currentSchema: string;
  onClose: () => void;
  onSubmit: (v: RenameTableValues) => void;
}) {
  const { register, handleSubmit, watch, formState } = useForm<RenameTableValues>({
    defaultValues: { name: tableName, schema: currentSchema },
  });
  return (
    <Shell title={`Переименовать таблицу ${tableName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="pg-modal-body">
          <div className="field">
            <label>Новое имя таблицы *</label>
            <input type="text" autoFocus {...register("name", { pattern: NAME_RE })} />
          </div>
          <div className="field">
            <label>Переместить в схему (опционально)</label>
            <input type="text" placeholder={currentSchema} {...register("schema")} />
          </div>
        </div>
        <Foot
          onClose={onClose}
          busy={busy}
          label="Переименовать"
          busyLabel="Переименование..."
          disabled={busy || !watch("name").trim() || !!formState.errors.name}
        />
      </form>
    </Shell>
  );
}

// ————— VACUUM —————

export type VacuumValues = { analyze: boolean; full: boolean; freeze: boolean };

export function VacuumForm({
  busy,
  tableName,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  tableName: string;
  onClose: () => void;
  onSubmit: (v: VacuumValues) => void;
}) {
  const { register, handleSubmit } = useForm<VacuumValues>({
    defaultValues: { analyze: true, full: false, freeze: false },
  });
  const row = { ...CHK, gap: "0.4rem", fontSize: "0.85rem" } as const;
  return (
    <Shell title={`VACUUM таблицы ${tableName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="pg-modal-body">
          <label style={row}>
            <input type="checkbox" {...register("analyze")} />
            <strong>ANALYZE</strong> (обновить статистику для планировщика)
          </label>
          <label style={row}>
            <input type="checkbox" {...register("full")} />
            <strong>FULL</strong> (полная перезапись таблицы и сжатие, требует эксклюзивной блокировки)
          </label>
          <label style={row}>
            <input type="checkbox" {...register("freeze")} />
            <strong>FREEZE</strong> (заморозка старых транзакций XID)
          </label>
        </div>
        <Foot
          onClose={onClose}
          busy={busy}
          label="Запустить VACUUM"
          busyLabel="Выполнение..."
          disabled={busy}
        />
      </form>
    </Shell>
  );
}

// ————— Создание индекса —————

export type CreateIndexValues = {
  name: string;
  method: string;
  column: string;
  unique: boolean;
  concurrently: boolean;
  where: string;
};

export function CreateIndexForm({
  busy,
  tableName,
  columns,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  tableName: string;
  columns: { name: string; type: string }[];
  onClose: () => void;
  onSubmit: (v: CreateIndexValues) => void;
}) {
  const { register, handleSubmit, watch, formState } = useForm<CreateIndexValues>({
    defaultValues: {
      name: "",
      method: "btree",
      column: columns[0]?.name ?? "",
      unique: false,
      concurrently: true,
      where: "",
    },
  });
  const row = { ...CHK, fontSize: "0.82rem" } as const;
  return (
    <Shell title={`Создание индекса для ${tableName}`} onClose={onClose} large>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="pg-modal-body">
          <div className="field">
            <label>Имя индекса *</label>
            <input
              type="text"
              placeholder={`idx_${tableName}_col`}
              autoFocus
              {...register("name", { pattern: NAME_RE })}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
            <div className="field">
              <label>Метод индексирования *</label>
              <select {...register("method")}>
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
              <select {...register("column")}>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <label style={row}>
              <input type="checkbox" {...register("unique")} />
              <strong>UNIQUE</strong> (уникальный индекс)
            </label>
            <label style={row}>
              <input type="checkbox" {...register("concurrently")} />
              <strong>CONCURRENTLY</strong> (без блокировки на запись)
            </label>
          </div>

          <div className="field">
            <label>Условие частичного индекса (WHERE, опционально)</label>
            <input
              type="text"
              placeholder="status = 'active' AND deleted_at IS NULL"
              {...register("where")}
            />
          </div>
        </div>
        <Foot
          onClose={onClose}
          busy={busy}
          label="Создать индекс"
          busyLabel="Создание..."
          disabled={busy || !watch("name").trim() || !!formState.errors.name}
        />
      </form>
    </Shell>
  );
}
