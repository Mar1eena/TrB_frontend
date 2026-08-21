import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./Notifications.css";

export type NotifyKind = "ok" | "err" | "info";

export type NotifyItem = {
  id: number;
  kind: NotifyKind;
  title: string;
  text: string;
};

const TITLES: Record<NotifyKind, string> = {
  ok: "Готово",
  err: "Ошибка",
  info: "Инфо",
};

const TTL_MS: Record<NotifyKind, number> = {
  ok: 4500,
  info: 4500,
  err: 8000,
};

const MAX_VISIBLE = 5;

type NotifyApi = {
  notify: (kind: NotifyKind, text: string, title?: string) => void;
  success: (text: string, title?: string) => void;
  error: (text: string, title?: string) => void;
  info: (text: string, title?: string) => void;
  dismiss: (id: number) => void;
  clear: () => void;
};

const NotifyContext = createContext<NotifyApi | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotifyItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
    setItems([]);
  }, []);

  const armTimer = useCallback(
    (id: number, kind: NotifyKind) => {
      const prev = timers.current.get(id);
      if (prev) window.clearTimeout(prev);
      const timer = window.setTimeout(() => dismiss(id), TTL_MS[kind]);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const notify = useCallback(
    (kind: NotifyKind, text: string, title?: string) => {
      const message = text.trim();
      if (!message) return;
      const resolvedTitle = title?.trim() || TITLES[kind];
      let reusedId: number | null = null;
      setItems((prev) => {
        const existing = prev.find((item) => item.kind === kind && item.text === message);
        if (existing) {
          reusedId = existing.id;
          return [...prev.filter((item) => item.id !== existing.id), { ...existing, title: resolvedTitle }];
        }
        const id = ++seq.current;
        reusedId = id;
        return [...prev.slice(-(MAX_VISIBLE - 1)), { id, kind, title: resolvedTitle, text: message }];
      });
      if (reusedId != null) armTimer(reusedId, kind);
    },
    [armTimer],
  );

  const api = useMemo<NotifyApi>(
    () => ({
      notify,
      success: (text, title) => notify("ok", text, title),
      error: (text, title) => notify("err", text, title),
      info: (text, title) => notify("info", text, title),
      dismiss,
      clear,
    }),
    [notify, dismiss, clear],
  );

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  return (
    <NotifyContext.Provider value={api}>
      {children}
      <NotifyHost items={items} onClose={dismiss} />
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyApi {
  const ctx = useContext(NotifyContext);
  if (!ctx) {
    throw new Error("useNotify must be used within NotificationsProvider");
  }
  return ctx;
}

function NotifyHost({
  items,
  onClose,
}: {
  items: NotifyItem[];
  onClose: (id: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="ui-toasts" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={`ui-toast is-${item.kind}`}
          role={item.kind === "err" ? "alert" : "status"}
        >
          <strong>{item.title}</strong>
          <button type="button" onClick={() => onClose(item.id)} aria-label="Закрыть">
            ×
          </button>
          <p>{item.text}</p>
        </div>
      ))}
    </div>
  );
}
