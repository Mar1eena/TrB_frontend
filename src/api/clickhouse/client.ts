import { ClickHouse_AdminClient } from "@marleena/trb-proto/clickhouse/AdminServiceClientPb";
import * as chAdminPbModule from "@marleena/trb-proto/clickhouse/admin_pb";
import { getGrpcBaseUrl } from "../common/client";
import { getClickHouseConnection, withConnectionMetadata } from "../common/connection";
import { resolveProtoNs } from "../common/protoNs";

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

export const chAdminPb = clickhouseAdminProto();

export const clickhouseAdminClient = withConnectionMetadata(
  new ClickHouse_AdminClient(getGrpcBaseUrl()),
  getClickHouseConnection,
);
