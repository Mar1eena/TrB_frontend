import type { IndicatorsClient as IndicatorsClientType } from "@marleena/trb-proto/indicators/IndicatorsServiceClientPb";
import { IndicatorsClient } from "@marleena/trb-proto/indicators/IndicatorsServiceClientPb";
import * as indPbModule from "@marleena/trb-proto/indicators/indicators_pb";
import * as grpcWeb from "grpc-web";
import { getGrpcBaseUrl } from "../common/client";
import { pickPbCtor, resolveProtoNs } from "../common/protoNs";

/** Force evaluation of the CJS `default` interop object (Vite prebundle). */
void (indPbModule as { default?: unknown }).default;

type ListIndicatorValuesRequest = InstanceType<(typeof indPbModule)["ListIndicatorValuesRequest"]>;
type ListIndicatorValuesResponse = InstanceType<(typeof indPbModule)["ListIndicatorValuesResponse"]>;

function indicatorsGlobalNs(): unknown {
  return (globalThis as { proto?: { trb?: { indicators?: { v1?: unknown } } } }).proto?.trb
    ?.indicators?.v1;
}

export function indicatorsProto(): typeof indPbModule {
  return resolveProtoNs(indPbModule, indicatorsGlobalNs(), [
    "ComputeForInstrumentRequest",
    "ListSupportedRequest",
    "ListIndicatorValuesRequest",
  ]);
}

export const indPb = indicatorsProto();

export const indicatorsClient: IndicatorsClientType = new IndicatorsClient(getGrpcBaseUrl());

let listIndicatorValuesDescriptor: grpcWeb.MethodDescriptor<
  ListIndicatorValuesRequest,
  ListIndicatorValuesResponse
> | null = null;
let listIndicatorValuesGrpcClient: grpcWeb.GrpcWebClientBase | null = null;

function listIndicatorValuesResponseCtor(): {
  deserializeBinary: (bytes: Uint8Array) => ListIndicatorValuesResponse;
} {
  const Ctor = pickPbCtor(indPbModule, indicatorsGlobalNs(), "ListIndicatorValuesResponse", [
    "deserializeBinary",
    "getPointsList",
  ]);
  if (!Ctor) {
    throw new Error("ListIndicatorValuesResponse нет в proto-клиенте — перезапустите Vite");
  }
  return Ctor as {
    deserializeBinary: (bytes: Uint8Array) => ListIndicatorValuesResponse;
  };
}

function getListIndicatorValuesDescriptor(): grpcWeb.MethodDescriptor<
  ListIndicatorValuesRequest,
  ListIndicatorValuesResponse
> {
  if (!listIndicatorValuesDescriptor) {
    const RequestCtor = pickPbCtor(indPbModule, indicatorsGlobalNs(), "ListIndicatorValuesRequest", [
      "serializeBinary",
    ]);
    const ResponseCtor = listIndicatorValuesResponseCtor();
    if (!RequestCtor) {
      throw new Error("ListIndicatorValuesRequest нет в proto-клиенте — перезапустите Vite");
    }
    listIndicatorValuesDescriptor = new grpcWeb.MethodDescriptor(
      "/trb.indicators.v1.Indicators/ListIndicatorValues",
      grpcWeb.MethodType.UNARY,
      RequestCtor as unknown as new () => ListIndicatorValuesRequest,
      ResponseCtor as unknown as new () => ListIndicatorValuesResponse,
      (request) => request.serializeBinary(),
      ResponseCtor.deserializeBinary,
    );
  }
  return listIndicatorValuesDescriptor;
}

/** Обходит устаревший IndicatorsClient без listIndicatorValues (кэш Vite / CJS interop). */
export function invokeListIndicatorValues(
  request: ListIndicatorValuesRequest,
): Promise<ListIndicatorValuesResponse> {
  if (!listIndicatorValuesGrpcClient) {
    listIndicatorValuesGrpcClient = new grpcWeb.GrpcWebClientBase({ format: "binary" });
  }
  return listIndicatorValuesGrpcClient.unaryCall(
    `${getGrpcBaseUrl()}/trb.indicators.v1.Indicators/ListIndicatorValues`,
    request,
    {},
    getListIndicatorValuesDescriptor(),
  );
}

export function newComputeForInstrumentRequest() {
  const Ctor = pickPbCtor(indPbModule, indicatorsGlobalNs(), "ComputeForInstrumentRequest", [
    "setUid",
    "setPersist",
    "setMaxResponsePoints",
  ]);
  if (!Ctor) {
    throw new Error("ComputeForInstrumentRequest нет в proto-клиенте — перезапустите Vite");
  }
  return new Ctor() as InstanceType<(typeof indPbModule)["ComputeForInstrumentRequest"]>;
}

export function newListIndicatorValuesRequest() {
  const Ctor = pickPbCtor(indPbModule, indicatorsGlobalNs(), "ListIndicatorValuesRequest", [
    "setUid",
    "setInterval",
    "setFrom",
    "setTo",
    "setType",
  ]);
  if (!Ctor) {
    throw new Error("ListIndicatorValuesRequest нет в proto-клиенте — перезапустите Vite");
  }
  return new Ctor() as InstanceType<(typeof indPbModule)["ListIndicatorValuesRequest"]>;
}
