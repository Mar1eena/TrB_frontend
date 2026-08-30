import { IndicatorsClient } from "@marleena/trb-proto/indicators/IndicatorsServiceClientPb";
import * as indPbModule from "@marleena/trb-proto/indicators/indicators_pb";
import { getGrpcBaseUrl } from "../common/client";
import { pickMessageCtor, resolveProtoNs } from "../common/protoNs";

function indicatorsGlobalNs(): unknown {
  return (globalThis as { proto?: { trb?: { indicators?: { v1?: unknown } } } }).proto?.trb
    ?.indicators?.v1;
}

export function indicatorsProto(): typeof indPbModule {
  return resolveProtoNs(indPbModule, indicatorsGlobalNs(), [
    "ComputeForInstrumentRequest",
    "ListSupportedRequest",
    "ListSchedulerTargetsRequest",
    "SyncSchedulerTargetsRequest",
    "SchedulerTarget",
    "ListIndicatorValuesRequest",
  ]);
}

export const indPb = indicatorsProto();
export const indicatorsClient = new IndicatorsClient(getGrpcBaseUrl());

export function newComputeForInstrumentRequest() {
  const fromGlobal = indicatorsGlobalNs() as { ComputeForInstrumentRequest?: unknown } | null;
  const Ctor = pickMessageCtor(
    [
      (indPbModule as { ComputeForInstrumentRequest?: unknown }).ComputeForInstrumentRequest,
      (indPbModule as { default?: { ComputeForInstrumentRequest?: unknown } }).default
        ?.ComputeForInstrumentRequest,
      indPb.ComputeForInstrumentRequest,
      fromGlobal?.ComputeForInstrumentRequest,
    ],
    ["setUid", "setPersist", "setMaxResponsePoints"],
  );
  if (!Ctor) {
    throw new Error("ComputeForInstrumentRequest нет в proto-клиенте — перезапустите Vite");
  }
  return new Ctor() as InstanceType<(typeof indPbModule)["ComputeForInstrumentRequest"]>;
}
