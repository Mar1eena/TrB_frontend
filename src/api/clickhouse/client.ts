import { ClickHouse_AdminClient } from "@marleena/trb-proto/clickhouse/AdminServiceClientPb";
import { ClickHouseClient } from "@marleena/trb-proto/clickhouse/ClickhouseServiceClientPb";
import * as chAdminPbModule from "@marleena/trb-proto/clickhouse/admin_pb";
import * as chPbModule from "@marleena/trb-proto/clickhouse/clickhouse_pb";
import { getGrpcBaseUrl } from "../common/client";
import { getClickHouseConnection, withConnectionMetadata } from "../common/connection";
import { pickMessageCtor, resolveProtoNs } from "../common/protoNs";

function clickhouseGlobalNs(): unknown {
  return (globalThis as { proto?: { trb?: { clickhouse?: { v1?: unknown } } } }).proto?.trb
    ?.clickhouse?.v1;
}

export function clickhouseAdminProto(): typeof chAdminPbModule {
  return resolveProtoNs(chAdminPbModule, clickhouseGlobalNs(), [
    "ListDatabasesRequest",
    "ListConnectionsRequest",
    "TableOptionsRequest",
  ]);
}

export function clickhouseProto(): typeof chPbModule {
  return resolveProtoNs(chPbModule, clickhouseGlobalNs(), [
    "ListInstrumentsRequest",
    "ListFilter",
    "ListCandlesRequest",
  ]);
}

export const chAdminPb = clickhouseAdminProto();
export const chPb = clickhouseProto();

export function newListCandlesRequest() {
  const Ctor = pickMessageCtor(
    [
      (chPbModule as { ListCandlesRequest?: unknown }).ListCandlesRequest,
      (chPbModule as { default?: { ListCandlesRequest?: unknown } }).default?.ListCandlesRequest,
      chPb.ListCandlesRequest,
    ],
    ["setUid", "setLimit", "setNewestFirst"],
  );
  if (!Ctor) {
    throw new Error("ListCandlesRequest нет в proto-клиенте — перезапустите Vite");
  }
  return new Ctor() as InstanceType<(typeof chPbModule)["ListCandlesRequest"]>;
}

export function setNewestFirst(req: { setNewestFirst?: (value: boolean) => unknown }, value: boolean) {
  if (typeof req.setNewestFirst === "function") {
    req.setNewestFirst(value);
  }
}

export const clickhouseAdminClient = withConnectionMetadata(
  new ClickHouse_AdminClient(getGrpcBaseUrl()),
  getClickHouseConnection,
);
export const clickhouseClient = withConnectionMetadata(
  new ClickHouseClient(getGrpcBaseUrl()),
  getClickHouseConnection,
);
