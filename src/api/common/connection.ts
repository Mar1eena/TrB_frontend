import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";

const HEADER = "x-trb-connection";

// Ключи старого формата (по одному значению на ключ) — читаем один раз для миграции.
const LEGACY = {
  ch: "trb.clickhouse.connection",
  pg: "trb.postgres.connection",
  chCustom: "trb.clickhouse.customConnections",
  pgCustom: "trb.postgres.customConnections",
  chHidden: "trb.clickhouse.hiddenConnections",
  pgHidden: "trb.postgres.hiddenConnections",
};

export type DbConnection = {
  name: string;
  host: string;
  database: string;
  is_default: boolean;
};

type ConnState = {
  clickhouse: string;
  postgres: string;
  chCustom: DbConnection[];
  pgCustom: DbConnection[];
  chHidden: string[];
  pgHidden: string[];
};

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function lsJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeCustom(items: DbConnection[]): DbConnection[] {
  return items.filter((item) => item && typeof item.name === "string" && item.name.trim());
}

function sanitizeHidden(items: string[]): string[] {
  return items.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/** Начальное состояние из старых ключей localStorage (одноразовая миграция). */
function legacyState(): ConnState {
  return {
    clickhouse: lsGet(LEGACY.ch),
    postgres: lsGet(LEGACY.pg),
    chCustom: sanitizeCustom(lsJson<DbConnection[]>(LEGACY.chCustom, [])),
    pgCustom: sanitizeCustom(lsJson<DbConnection[]>(LEGACY.pgCustom, [])),
    chHidden: sanitizeHidden(lsJson<string[]>(LEGACY.chHidden, [])),
    pgHidden: sanitizeHidden(lsJson<string[]>(LEGACY.pgHidden, [])),
  };
}

export const connectionStore = createStore<ConnState>()(
  persist(() => legacyState(), {
    name: "trb.dbConnections",
    version: 1,
  }),
);

const set = connectionStore.setState;
const get = connectionStore.getState;

// ————— Чистые хелперы —————

export function mergeDbConnections(...lists: DbConnection[][]): DbConnection[] {
  const seen = new Set<string>();
  const out: DbConnection[] = [];
  for (const list of lists) {
    for (const item of list) {
      const id = item.name.trim() || item.host.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out;
}

function excludeHidden(items: DbConnection[], hidden: string[]): DbConnection[] {
  if (hidden.length === 0) return items;
  const set = new Set(hidden);
  return items.filter((item) => !set.has(item.name) && !set.has(item.host));
}

function rememberInto(
  customKey: "chCustom" | "pgCustom",
  hiddenKey: "chHidden" | "pgHidden",
  host: string,
) {
  const addr = host.trim();
  if (!addr) return;
  set((s) => {
    const custom = s[customKey];
    const nextCustom = custom.some((item) => item.name === addr || item.host === addr)
      ? custom
      : [...custom, { name: addr, host: addr, database: "", is_default: false }];
    return {
      [customKey]: nextCustom,
      [hiddenKey]: s[hiddenKey].filter((item) => item !== addr),
    } as Partial<ConnState>;
  });
}

function forgetFrom(
  customKey: "chCustom" | "pgCustom",
  hiddenKey: "chHidden" | "pgHidden",
  name: string,
) {
  const addr = name.trim();
  if (!addr) return;
  set((s) => ({
    [customKey]: s[customKey].filter((item) => item.name !== addr && item.host !== addr),
    [hiddenKey]: s[hiddenKey].includes(addr) ? s[hiddenKey] : [...s[hiddenKey], addr],
  }) as Partial<ConnState>);
}

// ————— ClickHouse —————

export function listCustomClickHouseConnections(): DbConnection[] {
  return get().chCustom;
}

export function rememberClickHouseAddress(host: string) {
  rememberInto("chCustom", "chHidden", host);
}

export function forgetClickHouseAddress(name: string) {
  forgetFrom("chCustom", "chHidden", name);
}

export function visibleClickHouseConnections(server: DbConnection[]): DbConnection[] {
  const s = get();
  return excludeHidden(mergeDbConnections(server, s.chCustom), s.chHidden);
}

export function getClickHouseConnection(): string {
  return get().clickhouse;
}

export function setClickHouseConnection(name: string) {
  const next = name.trim();
  if (next === get().clickhouse) return;
  set({ clickhouse: next });
}

// ————— PostgreSQL —————

export function listCustomPostgresConnections(): DbConnection[] {
  return get().pgCustom;
}

export function rememberPostgresAddress(host: string) {
  rememberInto("pgCustom", "pgHidden", host);
}

export function forgetPostgresAddress(name: string) {
  forgetFrom("pgCustom", "pgHidden", name);
}

export function visiblePostgresConnections(server: DbConnection[]): DbConnection[] {
  const s = get();
  return excludeHidden(mergeDbConnections(server, s.pgCustom), s.pgHidden);
}

export function getPostgresConnection(): string {
  return get().postgres;
}

export function setPostgresConnection(name: string) {
  const next = name.trim();
  if (next === get().postgres) return;
  set({ postgres: next });
}

// ————— React-подписка —————

/** Реактивное имя соединения + список кастомных адресов (для форс-перерисовки). */
export function useClickHouseConnection() {
  const name = useStore(connectionStore, (s) => s.clickhouse);
  const custom = useStore(connectionStore, (s) => s.chCustom);
  const hidden = useStore(connectionStore, (s) => s.chHidden);
  return { name, custom, hidden };
}

export function usePostgresConnection() {
  const name = useStore(connectionStore, (s) => s.postgres);
  const custom = useStore(connectionStore, (s) => s.pgCustom);
  const hidden = useStore(connectionStore, (s) => s.pgHidden);
  return { name, custom, hidden };
}

// ————— gRPC-метаданные —————

export function withConnectionMetadata<T extends object>(client: T, getName: () => string): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      const key = String(prop);
      if (
        key.endsWith("_") ||
        key.startsWith("method") ||
        key === "constructor" ||
        key === "listConnections"
      ) {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return (...args: unknown[]) => {
        const name = getName();
        const current = args[1];
        const metadata: Record<string, string> =
          current && typeof current === "object" && !Array.isArray(current)
            ? { ...(current as Record<string, string>) }
            : {};
        if (name) metadata[HEADER] = name;
        if (args.length <= 1) {
          return (value as (...a: unknown[]) => unknown).call(target, args[0], metadata);
        }
        const next = args.slice();
        next[1] = metadata;
        return (value as (...a: unknown[]) => unknown).apply(target, next);
      };
    },
  });
}
