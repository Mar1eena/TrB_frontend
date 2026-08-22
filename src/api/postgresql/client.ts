import { PostgreSQLClient } from "@marleena/trb-proto/postgresql/PostgresqlServiceClientPb";
import * as pgPbModule from "@marleena/trb-proto/postgresql/postgresql_pb";
import { getGrpcBaseUrl } from "../common/client";
import { resolveProtoNs } from "../common/protoNs";

export function postgresqlProto(): typeof pgPbModule {
  const fromGlobal = (globalThis as { proto?: { trb?: { postgresql?: { v1?: unknown } } } }).proto
    ?.trb?.postgresql?.v1;
  return resolveProtoNs(pgPbModule, fromGlobal, [
    "ListSchedulerTargetsRequest",
    "SchedulerTargetInstrument",
  ]);
}

export const pgPb = postgresqlProto();
export const postgresqlClient = new PostgreSQLClient(getGrpcBaseUrl());
