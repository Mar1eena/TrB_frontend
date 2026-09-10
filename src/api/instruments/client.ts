import { InstrumentsClient } from "@marleena/trb-proto/instruments/InstrumentsServiceClientPb";
import * as instrPbModule from "@marleena/trb-proto/instruments/instruments_pb";
import { getGrpcBaseUrl } from "../common/client";
import { getClickHouseConnection, withConnectionMetadata } from "../common/connection";
import { resolveProtoNs } from "../common/protoNs";

function instrumentsGlobalNs(): unknown {
  return (globalThis as { proto?: { trb?: { instruments?: { v1?: unknown } } } }).proto?.trb
    ?.instruments?.v1;
}

export function instrumentsProto(): typeof instrPbModule {
  return resolveProtoNs(instrPbModule, instrumentsGlobalNs(), [
    "ListInstrumentsRequest",
    "ListFilter",
    "ListInstrumentVersionsRequest",
  ]);
}

export const instrPb = instrumentsProto();

export const instrumentsClient = withConnectionMetadata(
  new InstrumentsClient(getGrpcBaseUrl()),
  getClickHouseConnection,
);
