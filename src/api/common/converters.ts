import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb";
import { MoneyValue, Quotation } from "@marleena/trb-proto/api/tinvest/common_pb";

export function toPlain(message: { toObject: (includeInstance?: boolean) => object }): Record<string, unknown> {
  return snakeKeys(message.toObject(false)) as Record<string, unknown>;
}

export function snakeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(snakeKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const name = key
      .replace(/List$/, "")
      .replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
    out[name] = snakeKeys(nested);
  }
  return out;
}

export function parseMoney(amount: string, currency = "rub"): MoneyValue | null {
  const text = amount.trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  const units = Math.trunc(n);
  const nano = Math.round((n - units) * 1e9);
  const value = new MoneyValue();
  value.setCurrency(currency.trim() || "rub");
  value.setUnits(units);
  value.setNano(nano);
  return value;
}

export function toMoneyValue(amount: number | string | MoneyValue | unknown, currency = "rub"): MoneyValue {
  if (amount instanceof MoneyValue) return amount;
  if (typeof amount === "number") {
    const units = Math.trunc(amount);
    const nano = Math.round((amount - units) * 1e9);
    const m = new MoneyValue();
    m.setCurrency(currency);
    m.setUnits(units);
    m.setNano(nano);
    return m;
  }
  if (typeof amount === "string") {
    const parsed = parseMoney(amount, currency);
    if (parsed) return parsed;
  }
  const m = new MoneyValue();
  m.setCurrency(currency);
  return m;
}

export function parseQuotation(amount: string): Quotation | null {
  const text = amount.trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  const units = Math.trunc(n);
  const nano = Math.round((n - units) * 1e9);
  const q = new Quotation();
  q.setUnits(units);
  q.setNano(nano);
  return q;
}

export function toQuotation(val: number | string | Quotation | unknown): Quotation {
  if (val instanceof Quotation) return val;
  if (typeof val === "number") {
    const units = Math.trunc(val);
    const nano = Math.round((val - units) * 1e9);
    const q = new Quotation();
    q.setUnits(units);
    q.setNano(nano);
    return q;
  }
  if (typeof val === "string") {
    const parsed = parseQuotation(val);
    if (parsed) return parsed;
  }
  return new Quotation();
}

export function quotationToNumber(q?: Quotation | { units?: number; nano?: number } | null): number {
  if (!q) return 0;
  if (q instanceof Quotation) {
    return q.getUnits() + q.getNano() / 1e9;
  }
  return (q.units ?? 0) + (q.nano ?? 0) / 1e9;
}

export function moneyValueToNumber(m?: MoneyValue | { units?: number; nano?: number } | null): number {
  if (!m) return 0;
  if (m instanceof MoneyValue) {
    return m.getUnits() + m.getNano() / 1e9;
  }
  return (m.units ?? 0) + (m.nano ?? 0) / 1e9;
}

export function formatTimestamp(ts?: Timestamp): string {
  if (!ts) return "";
  const seconds = num(ts.getSeconds());
  const nanos = num(ts.getNanos());
  if (seconds <= 0 && nanos <= 0) return "";
  const ms = seconds * 1000 + Math.floor(nanos / 1e6);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

export function parseTimestamp(raw?: string | Date): Timestamp | undefined {
  if (!raw) return undefined;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  const ts = new Timestamp();
  const ms = d.getTime();
  ts.setSeconds(Math.floor(ms / 1000));
  ts.setNanos((ms % 1000) * 1e6);
  return ts;
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const low = value.toLowerCase().trim();
    if (low === "true" || low === "1" || low === "yes") return true;
    if (low === "false" || low === "0" || low === "no") return false;
  }
  return fallback;
}
