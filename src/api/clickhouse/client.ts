import { ClickHouseManagerClient } from "@marleena/trb-proto/api/clickhouse/ManagerServiceClientPb";
import * as chMgrPbModule from "@marleena/trb-proto/api/clickhouse/manager_pb";
import { getGrpcBaseUrl } from "../common/client";

type PbNs = Record<string, unknown>;

function asPbNs(value: unknown): PbNs | null {
  if (!value || typeof value !== "object") return null;
  return value as PbNs;
}

function hasCtor(ns: PbNs | null, name: string): boolean {
  return !!ns && typeof ns[name] === "function";
}

/**
 * google-protobuf CJS builds expose constructors either as named ESM bindings,
 * on `default`, or via goog.exportSymbol on globalThis. Prefer a namespace that
 * includes the newest messages (e.g. TableOptionsRequest), not a stale global.
 */
export function clickhouseManagerProto(): typeof chMgrPbModule {
  const rec = chMgrPbModule as unknown as PbNs & { default?: unknown };
  const fromGlobal = asPbNs(
    (
      globalThis as {
        proto?: {
          trb?: {
            clickhouse?: {
              manager?: { public?: { contract?: { v1?: unknown } } };
            };
          };
        };
      }
    ).proto?.trb?.clickhouse?.manager?.public?.contract?.v1,
  );

  const candidates = [asPbNs(rec.default), asPbNs(rec), fromGlobal].filter(Boolean) as PbNs[];

  for (const ns of candidates) {
    if (hasCtor(ns, "ListDatabasesRequest") && hasCtor(ns, "TableOptionsRequest")) {
      return ns as unknown as typeof chMgrPbModule;
    }
  }
  for (const ns of candidates) {
    if (hasCtor(ns, "ListDatabasesRequest")) {
      return ns as unknown as typeof chMgrPbModule;
    }
  }
  return chMgrPbModule;
}

export const chMgrPb = clickhouseManagerProto();
export const clickhouseManagerClient = new ClickHouseManagerClient(getGrpcBaseUrl());
