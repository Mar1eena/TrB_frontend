import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEBUG_SERVICES,
  defaultRequestBody,
  findDebugService,
  prettyJson,
  type DebugServiceId,
} from "../api/tinvest/debug";
import { TinvestRpcError } from "../api/common/errors";
import "./GrpcDebugPanel.css";
import { useNotify } from "../notifications";

const STORAGE_SERVICE = "trb.grpcDebug.service";
const STORAGE_METHOD = "trb.grpcDebug.method.";
const STORAGE_BODY = "trb.grpcDebug.body.";
const STORAGE_HISTORY = "trb.grpcDebug.history";
const HISTORY_LIMIT = 20;

type HistoryItem = {
  id: string;
  at: number;
  serviceId: DebugServiceId;
  method: string;
  ok: boolean;
  ms: number;
  error?: string;
  requestText: string;
};

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    sessionStorage.setItem(STORAGE_HISTORY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
  } catch {
    /* ignore */
  }
}

function bodyKey(serviceId: string, method: string): string {
  return `${STORAGE_BODY}${serviceId}.${method}`;
}

function initialService(): DebugServiceId {
  const stored = readStorage(STORAGE_SERVICE);
  return DEBUG_SERVICES.some((item) => item.id === stored)
    ? (stored as DebugServiceId)
    : "users";
}

function initialMethod(serviceId: DebugServiceId): string {
  const service = findDebugService(serviceId);
  const stored = readStorage(STORAGE_METHOD + serviceId);
  return service.methods.some((item) => item.value === stored)
    ? stored
    : service.methods[0].value;
}

function initialBody(serviceId: string, method: string): string {
  const stored = readStorage(bodyKey(serviceId, method));
  if (stored.trim()) return stored;
  return prettyJson(defaultRequestBody(serviceId, method));
}

export default function GrpcDebugPanel() {
  const notify = useNotify();
  const [serviceId, setServiceId] = useState<DebugServiceId>(initialService);
  const [method, setMethod] = useState(() => initialMethod(initialService()));
  const [bodyText, setBodyText] = useState(() => initialBody(initialService(), initialMethod(initialService())));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parseError, setParseError] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  const service = useMemo(() => findDebugService(serviceId), [serviceId]);
  const meta = service.methods.find((item) => item.value === method);

  const applyService = useCallback((nextId: DebugServiceId, nextMethod?: string) => {
    const next = findDebugService(nextId);
    const resolvedMethod =
      nextMethod && next.methods.some((item) => item.value === nextMethod)
        ? nextMethod
        : initialMethod(nextId);
    setServiceId(nextId);
    setMethod(resolvedMethod);
    setBodyText(initialBody(nextId, resolvedMethod));
    setError("");
    setParseError("");
    writeStorage(STORAGE_SERVICE, nextId);
    writeStorage(STORAGE_METHOD + nextId, resolvedMethod);
  }, []);

  const applyMethod = useCallback(
    (nextMethod: string) => {
      writeStorage(bodyKey(serviceId, method), bodyText);
      setMethod(nextMethod);
      setBodyText(initialBody(serviceId, nextMethod));
      setError("");
      setParseError("");
      writeStorage(STORAGE_METHOD + serviceId, nextMethod);
    },
    [bodyText, method, serviceId],
  );

  useEffect(() => {
    writeStorage(bodyKey(serviceId, method), bodyText);
  }, [bodyText, method, serviceId]);

  const resetBody = () => {
    const next = prettyJson(defaultRequestBody(serviceId, method));
    setBodyText(next);
    writeStorage(bodyKey(serviceId, method), next);
  };

  const copyResponse = async () => {
    if (payload == null) return;
    try {
      await navigator.clipboard.writeText(prettyJson(payload));
    } catch {
      setError("Не удалось скопировать ответ");
      notify.error("Не удалось скопировать ответ");
    }
  };

  const onRequest = async () => {
    setParseError("");
    setError("");
    let request: Record<string, unknown> = {};
    const trimmed = bodyText.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("тело запроса должно быть JSON-объектом");
        }
        request = parsed as Record<string, unknown>;
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    if (meta?.write) {
      const ok = window.confirm(
        `${service.rpc}/${method} — метод записи. Отправить реальный запрос?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setPayload(null);
    setElapsedMs(null);
    const started = performance.now();
    try {
      const data = await service.call(method, request);
      const ms = Math.round(performance.now() - started);
      setElapsedMs(ms);
      setPayload(data);
      const item: HistoryItem = {
        id: `${started}`,
        at: Date.now(),
        serviceId,
        method,
        ok: true,
        ms,
        requestText: prettyJson(request),
      };
      setHistory((prev) => {
        const next = [item, ...prev].slice(0, HISTORY_LIMIT);
        saveHistory(next);
        return next;
      });
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      setElapsedMs(ms);
      const message =
        err instanceof TinvestRpcError
          ? `${err.message} (code ${err.code})`
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
      notify.error(message);
      const item: HistoryItem = {
        id: `${started}`,
        at: Date.now(),
        serviceId,
        method,
        ok: false,
        ms,
        error: message,
        requestText: prettyJson(request),
      };
      setHistory((prev) => {
        const next = [item, ...prev].slice(0, HISTORY_LIMIT);
        saveHistory(next);
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  const restoreHistory = (item: HistoryItem) => {
    applyService(item.serviceId, item.method);
    setBodyText(item.requestText);
    writeStorage(bodyKey(item.serviceId, item.method), item.requestText);
  };

  return (
    <section className="panel-page debug-panel">
      <header className="scheduler-header">
        <p className="eyebrow">Админка / API</p>
        <h1>Отладка RPC</h1>
        <p>
          Unary-запросы к T-Invest прокси через Envoy (gRPC-web). Тело — JSON в snake_case,
          enum — число. Ctrl+Enter отправляет запрос.
        </p>
      </header>

      <div className="filters-bar">
        <div className="debug-services">
          {DEBUG_SERVICES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`debug-chip${item.id === serviceId ? " is-active" : ""}`}
              onClick={() => applyService(item.id)}
              disabled={busy}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="filters-row">
          <label className="filter-field grow">
            <span>RPC</span>
            <select
              value={method}
              onChange={(e) => applyMethod(e.target.value)}
              disabled={busy}
            >
              {service.methods.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.write ? `${item.label} (запись)` : item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn primary"
            onClick={() => void onRequest()}
            disabled={busy}
          >
            {busy ? "Запрос…" : "Вызвать"}
          </button>
          <button type="button" className="btn" onClick={resetBody} disabled={busy}>
            Шаблон
          </button>
          <div className="debug-meta">
            <span className="mono">
              {service.rpc}/{method}
            </span>
            {elapsedMs != null ? <span>{elapsedMs} мс</span> : null}
            {meta?.write ? <span className="warn">запись</span> : null}
            {parseError ? <span className="err">{parseError}</span> : null}
            {error ? <span className="err">{error}</span> : null}
            {!error && payload != null ? <span className="ok">ok</span> : null}
          </div>
        </div>
      </div>

      <div className="debug-workspace">
        <div className="debug-pane">
          <h2>
            Запрос
            <button type="button" onClick={resetBody}>
              сбросить
            </button>
          </h2>
          <textarea
            spellCheck={false}
            value={bodyText}
            disabled={busy}
            onChange={(e) => setBodyText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void onRequest();
              }
            }}
          />
        </div>
        <div className="debug-pane">
          <h2>
            Ответ
            <button type="button" onClick={() => void copyResponse()} disabled={payload == null}>
              копировать
            </button>
          </h2>
          {payload == null ? (
            <p className="debug-empty">
              {error ? "Запрос завершился ошибкой." : "Ответ ещё не пришёл."}
            </p>
          ) : (
            <pre className="debug-json">{prettyJson(payload)}</pre>
          )}
        </div>
        {history.length ? (
          <div className="debug-history">
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Сервис</th>
                  <th>Метод</th>
                  <th>Статус</th>
                  <th>мс</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} onClick={() => restoreHistory(item)}>
                    <td>{new Date(item.at).toLocaleTimeString("ru-RU")}</td>
                    <td>{item.serviceId}</td>
                    <td className="mono">{item.method}</td>
                    <td className={item.ok ? "ok" : "err"}>
                      {item.ok ? "ok" : item.error || "error"}
                    </td>
                    <td>{item.ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
