import { useForm } from "react-hook-form";
import type { ChColumn } from "../../api/clickhouse";
import { ModalBackdrop } from "../common/ModalBackdrop";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <ModalBackdrop onClose={onClose} className="ch-modal-backdrop" title={title}>
      <div className="ch-modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="ch-modal-head">
          <h3>{title}</h3>
          <button type="button" className="ch-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </ModalBackdrop>
  );
}

// ————— Создание базы —————

type CreateDbValues = { name: string; engine: string; comment: string };

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
    defaultValues: { name: "", engine: "Atomic", comment: "" },
  });
  return (
    <Shell title="Создание базы данных" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="ch-modal-body">
          <div className="field">
            <label>Имя базы данных *</label>
            <input
              type="text"
              placeholder="my_database"
              autoFocus
              {...register("name", { pattern: NAME_RE })}
            />
          </div>
          <div className="field">
            <label>Движок базы (Engine)</label>
            <select {...register("engine")}>
              <option value="Atomic">Atomic (по умолчанию)</option>
              <option value="Lazy">Lazy</option>
              <option value="Memory">Memory</option>
            </select>
          </div>
          <div className="field">
            <label>Комментарий (опционально)</label>
            <input type="text" placeholder="Описание назначения базы" {...register("comment")} />
          </div>
        </div>
        <div className="ch-modal-foot">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="primary-btn"
            disabled={busy || !watch("name").trim() || !!formState.errors.name}
          >
            {busy ? "Создание..." : "Создать базу"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

// ————— Добавление колонки —————

export type AddColumnValues = {
  name: string;
  type: string;
  codec: string;
  after: string;
};

export function AddColumnForm({
  busy,
  onClose,
  tableName,
  codecs,
  columns,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  tableName: string;
  codecs: string[];
  columns: { name: string }[];
  onSubmit: (v: AddColumnValues) => void;
}) {
  const { register, handleSubmit, watch, formState } = useForm<AddColumnValues>({
    defaultValues: { name: "", type: "String", codec: "", after: "" },
  });
  return (
    <Shell title={`Добавить колонку в ${tableName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="ch-modal-body">
          <div className="field">
            <label>Имя колонки *</label>
            <input
              type="text"
              placeholder="volume"
              autoFocus
              {...register("name", { pattern: NAME_RE })}
            />
          </div>
          <div className="field">
            <label>Тип данных *</label>
            <input type="text" list="types-list" placeholder="Float64" {...register("type")} />
          </div>
          <div className="field">
            <label>Кодек сжатия</label>
            <select {...register("codec")}>
              <option value="">По умолчанию</option>
              {codecs.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Разместить после колонки (опционально)</label>
            <select {...register("after")}>
              <option value="">В конец таблицы</option>
              <option value="FIRST">В самое начало (FIRST)</option>
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  После {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="ch-modal-foot">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="primary-btn"
            disabled={busy || !watch("name").trim() || !!formState.errors.name}
          >
            {busy ? "Добавление..." : "Добавить колонку"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

// ————— Изменение колонки —————

export type ModifyColumnValues = { type: string; codec: string; ttl: string };

export function ModifyColumnForm({
  busy,
  onClose,
  column,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  column: ChColumn;
  onSubmit: (v: ModifyColumnValues) => void;
}) {
  const { register, handleSubmit, watch } = useForm<ModifyColumnValues>({
    defaultValues: { type: column.type, codec: column.codec, ttl: column.ttl },
  });
  return (
    <Shell title={`Изменить колонку ${column.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="ch-modal-body">
          <div className="field">
            <label>Новый тип данных *</label>
            <input type="text" list="types-list" autoFocus {...register("type")} />
          </div>
          <div className="field">
            <label>Кодек сжатия</label>
            <input
              type="text"
              placeholder="ZSTD(1) или DoubleDelta, LZ4"
              {...register("codec")}
            />
          </div>
          <div className="field">
            <label>TTL выражение</label>
            <input
              type="text"
              placeholder="timestamp + INTERVAL 30 DAY"
              {...register("ttl")}
            />
          </div>
        </div>
        <div className="ch-modal-foot">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="primary-btn" disabled={busy || !watch("type").trim()}>
            {busy ? "Сохранение..." : "Сохранить изменения"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

// ————— Переименование (таблица / колонка) —————

export function RenameForm({
  busy,
  onClose,
  title,
  label,
  currentName,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  title: string;
  label: string;
  currentName: string;
  onSubmit: (name: string) => void;
}) {
  const { register, handleSubmit, watch, formState } = useForm<{ name: string }>({
    defaultValues: { name: currentName },
  });
  return (
    <Shell title={title} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => onSubmit(v.name))}>
        <div className="ch-modal-body">
          <div className="field">
            <label>{label} *</label>
            <input type="text" autoFocus {...register("name", { pattern: NAME_RE })} />
          </div>
        </div>
        <div className="ch-modal-foot">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="primary-btn"
            disabled={busy || !watch("name").trim() || !!formState.errors.name}
          >
            {busy ? "Переименование..." : "Переименовать"}
          </button>
        </div>
      </form>
    </Shell>
  );
}
