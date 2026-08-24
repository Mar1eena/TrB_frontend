import { useState } from "react";
import type { DbConnection } from "../api/common/connection";

export function DbConnectionSelect({
  items,
  value,
  onChange,
  className,
  placeholder,
}: {
  items: DbConnection[];
  value: string;
  onChange: (name: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const selected =
    (value && items.some((item) => item.name === value || item.host === value) ? value : "") ||
    items.find((item) => item.is_default)?.name ||
    items[0]?.name ||
    "";

  return (
    <div className={className}>
      <label>
        <span>Адрес</span>
        <select value={selected} onChange={(e) => onChange(e.target.value)}>
          {items.length === 0 ? <option value="">Нет сохранённых</option> : null}
          {items.map((item) => (
            <option key={item.name} value={item.name}>
              {item.host || item.name}
              {item.database ? ` / ${item.database}` : ""}
              {item.is_default ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const host = draft.trim();
          if (!host) return;
          onChange(host);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder ?? "host:port"}
          spellCheck={false}
        />
        <button type="submit">Подключить</button>
      </form>
    </div>
  );
}
