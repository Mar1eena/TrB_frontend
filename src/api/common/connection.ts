const HEADER = "x-trb-connection";
const CH_KEY = "trb.clickhouse.connection";
const PG_KEY = "trb.postgres.connection";
const CH_CUSTOM_KEY = "trb.clickhouse.customConnections";
const PG_CUSTOM_KEY = "trb.postgres.customConnections";

export type DbConnection = {
  name: string;
  host: string;
  database: string;
  is_default: boolean;
};

type Listener = () => void;
const listeners = new Set<Listener>();

function read(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

function readCustom(key: string): DbConnection[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DbConnection[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.name === "string" && item.name.trim());
  } catch {
    return [];
  }
}

function writeCustom(key: string, items: DbConnection[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function remember(key: string, host: string) {
  const addr = host.trim();
  if (!addr) return;
  const items = readCustom(key);
  if (items.some((item) => item.name === addr || item.host === addr)) return;
  items.push({ name: addr, host: addr, database: "", is_default: false });
  writeCustom(key, items);
}

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

export function listCustomClickHouseConnections(): DbConnection[] {
  return readCustom(CH_CUSTOM_KEY);
}

export function listCustomPostgresConnections(): DbConnection[] {
  return readCustom(PG_CUSTOM_KEY);
}

export function rememberClickHouseAddress(host: string) {
  remember(CH_CUSTOM_KEY, host);
}

export function rememberPostgresAddress(host: string) {
  remember(PG_CUSTOM_KEY, host);
}

let clickhouseName = read(CH_KEY);
let postgresName = read(PG_KEY);

function notify() {
  listeners.forEach((fn) => fn());
}

export function onDbConnectionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getClickHouseConnection(): string {
  return clickhouseName;
}

export function setClickHouseConnection(name: string) {
  const next = name.trim();
  if (next === clickhouseName) return;
  clickhouseName = next;
  write(CH_KEY, next);
  notify();
}

export function getPostgresConnection(): string {
  return postgresName;
}

export function setPostgresConnection(name: string) {
  const next = name.trim();
  if (next === postgresName) return;
  postgresName = next;
  write(PG_KEY, next);
  notify();
}

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
