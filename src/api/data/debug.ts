import { instrumentsClient, instrPb } from "../instruments/client";
import {
  historicCandleClient,
  hcPb,
  newListCandlesRequest,
  setNewestFirst,
} from "../historicCandle/client";
import { postgresqlClient, pgPb } from "../postgresql/client";
import { SharesResponse } from "@marleena/trb-proto/api/tinvest/instruments_pb";
import { toPlain, str, num, bool, parseTimestamp } from "../common/converters";
import { wrapRpcError } from "../common/errors";

export const DATA_API_GRPC_METHODS = [
  { value: "ListInstruments", label: "ListInstruments", write: false, service: "Instruments" },
  { value: "ListInstrumentVersions", label: "ListInstrumentVersions", write: false, service: "Instruments" },
  { value: "UpsertInstruments", label: "UpsertInstruments", write: true, service: "Instruments" },
  { value: "ListLastDownloads", label: "ListLastDownloads", write: false, service: "HistoricCandle" },
  { value: "ListCandles", label: "ListCandles", write: false, service: "HistoricCandle" },
  { value: "ListSchedulerTargets", label: "ListSchedulerTargets", write: false, service: "PostgreSQL" },
  { value: "SyncSchedulerTargets", label: "SyncSchedulerTargets", write: true, service: "PostgreSQL" },
] as const;

export const DB_API_GRPC_METHODS = DATA_API_GRPC_METHODS;

export type DataApiGrpcMethod = (typeof DATA_API_GRPC_METHODS)[number]["value"];
export type DbApiGrpcMethod = DataApiGrpcMethod;

export function defaultDataApiRequestBody(method: string): Record<string, unknown> {
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
  if (method === "ListCandles") {
    return { uid: "", interval: 1, from: "", to: "", limit: 500, newest_first: true };
  }
  if (method === "SyncSchedulerTargets") {
    return {
      instruments: [{ uid: "", intervals: [1] }],
      allow_empty: false,
    };
  }
  return {};
}

export const defaultDbApiRequestBody = defaultDataApiRequestBody;

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

type ListFilterLike = {
  setQ: (v: string) => unknown;
  setLimit: (v: number) => unknown;
  setOffset: (v: number) => unknown;
};

function fillListFilter<T extends ListFilterLike>(filter: T, request: Record<string, unknown>): T {
  const src = asRecord(request.filter) ?? request;
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
    const msg = new pgPb.SchedulerTargetInstrument();
    msg.setUid(uid);
    msg.setIntervalsList(intervals);
    return [msg];
  });
}

export function dataApiServiceName(method: DataApiGrpcMethod): string {
  return DATA_API_GRPC_METHODS.find((item) => item.value === method)?.service ?? "Instruments";
}

export async function callDataApiGrpc(
  method: DataApiGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  try {
    switch (method) {
      case "ListInstruments": {
        const req = new instrPb.ListInstrumentsRequest();
        req.setFilter(fillListFilter(new instrPb.ListFilter(), request));
        req.setLite(bool(request.lite, false));
        return toPlain(await instrumentsClient.listInstruments(req));
      }
      case "ListInstrumentVersions": {
        const req = new instrPb.ListInstrumentVersionsRequest();
        req.setUid(str(request.uid).trim());
        return toPlain(await instrumentsClient.listInstrumentVersions(req));
      }
      case "UpsertInstruments": {
        const req = new SharesResponse();
        return toPlain(await instrumentsClient.upsertInstruments(req));
      }
      case "ListSchedulerTargets": {
        return toPlain(
          await postgresqlClient.listSchedulerTargets(new pgPb.ListSchedulerTargetsRequest()),
        );
      }
      case "ListLastDownloads": {
        const req = new hcPb.ListLastDownloadsRequest();
        req.setFilter(fillListFilter(new hcPb.ListFilter(), request));
        return toPlain(await historicCandleClient.listLastDownloads(req));
      }
      case "ListCandles": {
        const req = newListCandlesRequest();
        req.setUid(str(request.uid).trim());
        req.setInterval(num(request.interval) || 1);
        const from = parseTimestamp(str(request.from));
        const to = parseTimestamp(str(request.to));
        if (from) req.setFrom(from);
        if (to) req.setTo(to);
        const limit = num(request.limit);
        if (limit > 0) req.setLimit(limit);
        setNewestFirst(req, bool(request.newest_first, false));
        return toPlain(await historicCandleClient.listCandles(req));
      }
      case "SyncSchedulerTargets": {
        const req = new pgPb.SyncSchedulerTargetsRequest();
        req.setAllowEmpty(bool(request.allow_empty, false));
        for (const item of syncInstrumentsFrom(request)) {
          req.addInstruments(item);
        }
        return toPlain(await postgresqlClient.syncSchedulerTargets(req));
      }
      default: {
        const exhaustiveCheck: never = method;
        throw new Error(`Неизвестный метод: ${exhaustiveCheck}`);
      }
    }
  } catch (err) {
    throw wrapRpcError(err);
  }
}

export const callDbApiGrpc = callDataApiGrpc;
