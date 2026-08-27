import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { listInstruments, type Instrument } from "../../api/data";

export type PickedInstrument = {
  uid: string;
  ticker: string;
  name: string;
  figi: string;
  classCode: string;
};

type Props = {
  value: PickedInstrument | null;
  onChange: (item: PickedInstrument) => void;
};

function toPicked(item: Instrument): PickedInstrument {
  return {
    uid: item.uid,
    ticker: item.ticker,
    name: item.name,
    figi: item.figi,
    classCode: item.class_code,
  };
}

function labelOf(item: PickedInstrument): string {
  const board = item.classCode ? ` [${item.classCode}]` : "";
  return item.name ? `${item.ticker}${board} — ${item.name}` : `${item.ticker}${board}`;
}

function rankInstrument(item: Instrument): number {
  let rank = 0;
  if (item.class_code === "TQBR") rank -= 4;
  if (item.api_trade_available_flag) rank -= 2;
  if (item.liquidity_flag) rank -= 1;
  return rank;
}

export default function InstrumentSelect({ value, onChange }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PickedInstrument[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await listInstruments(q, 40);
        if (cancelled) return;
        const seen = new Map<string, Instrument>();
        for (const row of rows) {
          if (!row.uid || seen.has(row.uid)) continue;
          seen.set(row.uid, row);
        }
        const ranked = [...seen.values()].sort((a, b) => {
          const d = rankInstrument(a) - rankInstrument(b);
          if (d !== 0) return d;
          return a.ticker.localeCompare(b.ticker, "ru");
        });
        setItems(ranked.map(toPicked));
        setActive(0);
      } catch (err) {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : "Не удалось загрузить инструменты");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const pick = (item: PickedInstrument) => {
    onChange(item);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (open && item) pick(item);
      else setOpen(true);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="filter-field candles-instrument" ref={rootRef}>
      <span>Инструмент</span>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Тикер или название"
        value={open ? query : value ? labelOf(value) : query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul id={listId} role="listbox" className="candles-instrument-list">
          {loading ? <li className="candles-instrument-empty">Поиск…</li> : null}
          {!loading && error ? <li className="candles-instrument-empty">{error}</li> : null}
          {!loading && !error && items.length === 0 ? (
            <li className="candles-instrument-empty">Ничего не найдено</li>
          ) : null}
          {!loading &&
            items.map((item, idx) => (
              <li key={item.uid} role="option" aria-selected={idx === active}>
                <button
                  type="button"
                  className={idx === active ? "is-active" : ""}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => pick(item)}
                >
                  <strong>{item.ticker}</strong>
                  {item.classCode ? <em>{item.classCode}</em> : null}
                  <span>{item.name}</span>
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
