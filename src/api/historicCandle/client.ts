import { HistoricCandleClient } from "@marleena/trb-proto/historiccandle/HistoriccandleServiceClientPb";
import * as hcPbModule from "@marleena/trb-proto/historiccandle/historiccandle_pb";
import { getGrpcBaseUrl } from "../common/client";
import { getClickHouseConnection, withConnectionMetadata } from "../common/connection";
import { pickMessageCtor, resolveProtoNs } from "../common/protoNs";

function historicCandleGlobalNs(): unknown {
  return (globalThis as { proto?: { trb?: { historiccandle?: { v1?: unknown } } } }).proto?.trb
    ?.historiccandle?.v1;
}

export function historicCandleProto(): typeof hcPbModule {
  return resolveProtoNs(hcPbModule, historicCandleGlobalNs(), [
    "ListCandlesRequest",
    "ListFilter",
    "ListLastDownloadsRequest",
  ]);
}

export const hcPb = historicCandleProto();

export function newListCandlesRequest() {
  const Ctor = pickMessageCtor(
    [
      (hcPbModule as { ListCandlesRequest?: unknown }).ListCandlesRequest,
      (hcPbModule as { default?: { ListCandlesRequest?: unknown } }).default?.ListCandlesRequest,
      hcPb.ListCandlesRequest,
    ],
    ["setUid", "setLimit", "setNewestFirst"],
  );
  if (!Ctor) {
    throw new Error("ListCandlesRequest нет в proto-клиенте — перезапустите Vite");
  }
  return new Ctor() as InstanceType<(typeof hcPbModule)["ListCandlesRequest"]>;
}

export function setNewestFirst(req: { setNewestFirst?: (value: boolean) => unknown }, value: boolean) {
  if (typeof req.setNewestFirst === "function") {
    req.setNewestFirst(value);
  }
}

export const historicCandleClient = withConnectionMetadata(
  new HistoricCandleClient(getGrpcBaseUrl()),
  getClickHouseConnection,
);
