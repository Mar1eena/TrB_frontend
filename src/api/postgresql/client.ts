import { PostgreSQLClient } from "@marleena/trb-proto/postgresql/PostgresqlServiceClientPb";
import { PostgreSQL_AdminClient } from "@marleena/trb-proto/postgresql/AdminServiceClientPb";
import * as pgAdminPbModule from "@marleena/trb-proto/postgresql/admin_pb";
import * as pgPbModule from "@marleena/trb-proto/postgresql/postgresql_pb";
import { getGrpcBaseUrl } from "../common/client";
import { getPostgresConnection, withConnectionMetadata } from "../common/connection";
import { resolveProtoNs } from "../common/protoNs";

function postgresqlGlobalNs(): unknown {
  return (globalThis as { proto?: { trb?: { postgresql?: { v1?: unknown } } } }).proto
    ?.trb?.postgresql?.v1;
}

export function postgresqlAdminProto(): typeof pgAdminPbModule {
  return resolveProtoNs(pgAdminPbModule, postgresqlGlobalNs(), [
    "ListDatabasesRequest",
    "ListConnectionsRequest",
    "TableOptionsRequest",
  ]);
}

export function postgresqlProto(): typeof pgPbModule {
  return resolveProtoNs(pgPbModule, postgresqlGlobalNs(), [
    "ListSchedulerTargetsRequest",
    "SchedulerTargetInstrument",
  ]);
}

export const pgAdminPb = postgresqlAdminProto();
export const pgPb = postgresqlProto();
export const postgresqlAdminClient = withConnectionMetadata(
  new PostgreSQL_AdminClient(getGrpcBaseUrl()),
  getPostgresConnection,
);
export const postgresqlClient = new PostgreSQLClient(getGrpcBaseUrl());
