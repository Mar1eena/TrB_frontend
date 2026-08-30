import { IndicatorsClient } from "@marleena/trb-proto/indicators/IndicatorsServiceClientPb";
import * as indPbModule from "@marleena/trb-proto/indicators/indicators_pb";
import { getGrpcBaseUrl } from "../common/client";
import { resolveProtoNs } from "../common/protoNs";

function indicatorsGlobalNs(): unknown {
  return (globalThis as { proto?: { trb?: { indicators?: { v1?: unknown } } } }).proto?.trb
    ?.indicators?.v1;
}

export function indicatorsProto(): typeof indPbModule {
  return resolveProtoNs(indPbModule, indicatorsGlobalNs(), [
    "ComputeForInstrumentRequest",
    "ListSupportedRequest",
  ]);
}

export const indPb = indicatorsProto();
export const indicatorsClient = new IndicatorsClient(getGrpcBaseUrl());
