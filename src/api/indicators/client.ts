import { Indicator_SettingsClient } from "@marleena/trb-proto/indicators/IndicatorsServiceClientPb";
import * as indPbModule from "@marleena/trb-proto/indicators/indicators_pb";
import * as paramsPbModule from "@marleena/trb-proto/indicators/params_pb";
import { getGrpcBaseUrl } from "../common/client";
import { pickPbCtor, resolveProtoNs } from "../common/protoNs";

function indicatorsGlobalNs(): unknown {
  return (globalThis as { proto?: { trb?: { indicators?: { v1?: unknown } } } }).proto?.trb
    ?.indicators?.v1;
}

export function indicatorsProto(): typeof indPbModule {
  return resolveProtoNs(indPbModule, indicatorsGlobalNs(), ["Settings", "SettingsHash", "UpdateSettingsResponse"]);
}

export function indicatorParamsProto(): typeof paramsPbModule {
  return resolveProtoNs(paramsPbModule, indicatorsGlobalNs(), ["IndicatorSettings", "RsiParams"]);
}

export const indPb = indicatorsProto();
export const indParamsPb = indicatorParamsProto();

export const indicatorSettingsClient: Indicator_SettingsClient = new Indicator_SettingsClient(getGrpcBaseUrl());

function requireCtor<T>(name: string, requiredMethods: string[] = []): new () => T {
  const Ctor = pickPbCtor(indPbModule, indicatorsGlobalNs(), name, requiredMethods)
    ?? pickPbCtor(paramsPbModule, indicatorsGlobalNs(), name, requiredMethods);
  if (!Ctor) {
    throw new Error(`${name} нет в proto-клиенте — перезапустите Vite`);
  }
  return Ctor as unknown as new () => T;
}

export function newSettingsMessage() {
  const Ctor = requireCtor<InstanceType<(typeof indPbModule)["Settings"]>>("Settings", [
    "setUid",
    "setInterval",
    "setSettings",
  ]);
  return new Ctor();
}

export function newIndicatorSettingsMessage() {
  const Ctor = requireCtor<InstanceType<(typeof paramsPbModule)["IndicatorSettings"]>>("IndicatorSettings", [
    "setRsi",
    "setMacd",
  ]);
  return new Ctor();
}

export function newRsiParams() {
  return new (requireCtor<InstanceType<(typeof paramsPbModule)["RsiParams"]>>("RsiParams", ["setPeriod"]))();
}

export function newSmaParams() {
  return new (requireCtor<InstanceType<(typeof paramsPbModule)["SmaParams"]>>("SmaParams", ["setPeriod"]))();
}

export function newEmaParams() {
  return new (requireCtor<InstanceType<(typeof paramsPbModule)["EmaParams"]>>("EmaParams", ["setPeriod"]))();
}

export function newMacdParams() {
  return new (requireCtor<InstanceType<(typeof paramsPbModule)["MacdParams"]>>("MacdParams", [
    "setFastPeriod",
    "setSlowPeriod",
    "setSignalPeriod",
  ]))();
}

export function newBbandsParams() {
  return new (requireCtor<InstanceType<(typeof paramsPbModule)["BbandsParams"]>>("BbandsParams", [
    "setPeriod",
    "setNbDevUp",
    "setNbDevDn",
  ]))();
}
