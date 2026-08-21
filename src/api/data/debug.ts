import { dbApiClient, dbApiPb, dbApiProto } from "./client";
import { SharesResponse } from "@marleena/trb-proto/tinvest/instruments_pb";
import { toPlain, str, num, bool } from "../common/converters";
import { wrapRpcError } from "../common/errors";

export const DB_API_GRPC_METHODS = [
  { value: "ListInstruments", label: "ListInstruments", write: false },
  { value: "ListInstrumentVersions", label: "ListInstrumentVersions", write: false },
  { value: "UpsertInstruments", label: "UpsertInstruments", write: true },
  { value: "ListSchedulerTargets", label: "ListSchedulerTargets", write: false },
  { value: "ListLastDownloads", label: "ListLastDownloads", write: false },
  { value: "SyncSchedulerTargets", label: "SyncSchedulerTargets", write: true },
] as const;

export type DbApiGrpcMethod = (typeof DB_API_GRPC_METHODS)[number]["value"];

export function defaultDbApiRequestBody(method: string): Record<string, unknown> {
  if (method === "ListInstruments") {
    return { filter: { q: "", limit: 20, offset: 0 }, lite: true };
  }
  if (method === "ListInstrumentVersions") {
    return { uid: "" };
  }
  if (method === "UpsertInstruments") {
    return { instruments: [] };
  }
  if (method === "ListLastDownloads") {
    return { filter: { q: "", limit: 20, offset: 0 } };
  }
  if (method === "SyncSchedulerTargets") {
    return {
      instruments: [{ uid: "", intervals: [1] }],
      allow_empty: false,
    };
  }
  return {};
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function listFilterFrom(request: Record<string, unknown>) {
  const src = asRecord(request.filter) ?? request;
  const filter = new dbApiPb.ListFilter();
  const q = str(src.q);
  if (q) filter.setQ(q);
  const limit = num(src.limit);
  if (limit > 0) filter.setLimit(limit);
  const offset = num(src.offset);
  if (offset > 0) filter.setOffset(offset);
  return filter;
}

function syncInstrumentsFrom(request: Record<string, unknown>) {
  const raw = request.instruments;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const uid = str(row.uid).trim();
    if (!uid) return [];
    const intervals = Array.isArray(row.intervals)
      ? row.intervals.map((n) => num(n)).filter((n) => n > 0)
      : [];
    const msg = new dbApiPb.SchedulerTargetInstrument();
    msg.setUid(uid);
    msg.setIntervalsList(intervals);
    return [msg];
  });
}

export async function callDbApiGrpc(
  method: DbApiGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  try {
    switch (method) {
      case "ListInstruments": {
        const req = new dbApiPb.ListInstrumentsRequest();
        req.setFilter(listFilterFrom(request));
        req.setLite(bool(request.lite, false));
        return toPlain(await dbApiClient.listInstruments(req));
      }
      case "ListInstrumentVersions": {
        const Pb = dbApiProto();
        const req = new Pb.ListInstrumentVersionsRequest();
        req.setUid(str(request.uid).trim());
        return toPlain(await dbApiClient.listInstrumentVersions(req));
      }
      case "UpsertInstruments": {
        const req = new SharesResponse();
        return toPlain(await dbApiClient.upsertInstruments(req));
      }
      case "ListSchedulerTargets": {
        return toPlain(
          await dbApiClient.listSchedulerTargets(new dbApiPb.ListSchedulerTargetsRequest()),
        );
      }
      case "ListLastDownloads": {
        const req = new dbApiPb.ListLastDownloadsRequest();
        req.setFilter(listFilterFrom(request));
        return toPlain(await dbApiClient.listLastDownloads(req));
      }
      case "SyncSchedulerTargets": {
        const req = new dbApiPb.SyncSchedulerTargetsRequest();
        req.setAllowEmpty(bool(request.allow_empty, false));
        for (const item of syncInstrumentsFrom(request)) {
          req.addInstruments(item);
        }
        return toPlain(await dbApiClient.syncSchedulerTargets(req));
      }
      default: {
        const exhaustiveCheck: never = method;
        throw new Error(`Неизвестный метод DbApi: ${exhaustiveCheck}`);
      }
    }
  } catch (err) {
    throw wrapRpcError(err);
  }
}
