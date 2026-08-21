import { DbApiClient } from "@marleena/trb-proto/api/db_api/Db_apiServiceClientPb";
import * as dbApiPbModule from "@marleena/trb-proto/api/db_api/db_api_pb";
import { getGrpcBaseUrl } from "../common/client";

type DbApiPbNs = typeof dbApiPbModule;

function asPbNs(value: unknown): DbApiPbNs | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as DbApiPbNs;
}

/** google-protobuf registers classes on globalThis.proto; named CJS exports can lag. */
export function dbApiProto(): DbApiPbNs {
  const fromGlobal = asPbNs(
    (globalThis as { proto?: { trb?: { db?: { api?: { public?: { contract?: { v1?: unknown } } } } } } })
      .proto?.trb?.db?.api?.public?.contract?.v1,
  );
  const rec = dbApiPbModule as unknown as Record<string, unknown> & { default?: unknown };
  const fromDefault = asPbNs(rec.default);
  const candidates = [fromGlobal, dbApiPbModule, fromDefault].filter(Boolean) as DbApiPbNs[];
  for (const ns of candidates) {
    const bag = ns as unknown as Record<string, unknown>;
    if (typeof bag.ListInstrumentVersionsRequest === "function" && typeof bag.ListFilter === "function") {
      return ns;
    }
  }
  for (const ns of candidates) {
    const bag = ns as unknown as Record<string, unknown>;
    if (typeof bag.ListFilter === "function") return ns;
  }
  return dbApiPbModule;
}

export const dbApiPb = dbApiProto();
export const dbApiClient = new DbApiClient(getGrpcBaseUrl());
