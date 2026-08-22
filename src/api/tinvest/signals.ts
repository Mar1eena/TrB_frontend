import { SignalServiceClient } from "@marleena/trb-proto/api/tinvest/SignalsServiceClientPb";
import {
  GetSignalsRequest,
  GetStrategiesRequest,
  SignalDirection,
  SignalState,
  StrategyType,
  type GetSignalsResponse,
  type GetStrategiesResponse,
} from "@marleena/trb-proto/api/tinvest/signals_pb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache, type CacheOptions } from "../common/cache";
import { toPlain, parseTimestamp, str, num } from "../common/converters";

export const signalsClient = new SignalServiceClient(getGrpcBaseUrl());

export const SIGNALS_GRPC_METHODS = [
  { value: "GetStrategies", label: "GetStrategies", write: false },
  { value: "GetSignals", label: "GetSignals", write: false },
] as const;

export type SignalsGrpcMethod = (typeof SIGNALS_GRPC_METHODS)[number]["value"];

export async function getStrategies(strategyId?: string, opts?: CacheOptions): Promise<GetStrategiesResponse> {
  const id = strategyId?.trim() ?? "";
  return globalApiCache.read(`signals:strategies:${id}`, async () => {
    const req = new GetStrategiesRequest();
    if (id) req.setStrategyId(id);
    return signalsClient.getStrategies(req);
  }, opts);
}

export async function getSignals(params?: {
  signalId?: string;
  strategyId?: string;
  strategyType?: StrategyType | number;
  instrumentUid?: string;
  from?: Date | string;
  to?: Date | string;
  direction?: SignalDirection | number;
  active?: SignalState | number;
}, opts?: CacheOptions): Promise<GetSignalsResponse> {
  const key = `signals:list:${params?.strategyId ?? ""}:${params?.instrumentUid ?? ""}`;
  return globalApiCache.read(key, async () => {
    const req = new GetSignalsRequest();
    if (params?.signalId) req.setSignalId(params.signalId.trim());
    if (params?.strategyId) req.setStrategyId(params.strategyId.trim());
    if (params?.strategyType != null) req.setStrategyType(params.strategyType);
    if (params?.instrumentUid) req.setInstrumentUid(params.instrumentUid.trim());
    if (params?.from) {
      const ts = parseTimestamp(params.from);
      if (ts) req.setFrom(ts);
    }
    if (params?.to) {
      const ts = parseTimestamp(params.to);
      if (ts) req.setTo(ts);
    }
    if (params?.direction != null) req.setDirection(params.direction);
    if (params?.active != null) req.setActive(params.active);
    return signalsClient.getSignals(req);
  }, opts);
}

export async function callSignalsGrpc(
  method: SignalsGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (method) {
    case "GetStrategies": {
      const res = await getStrategies(str(request.strategy_id) || undefined, { fresh: true });
      return toPlain(res);
    }
    case "GetSignals": {
      const res = await getSignals({
        signalId: str(request.signal_id) || undefined,
        strategyId: str(request.strategy_id) || undefined,
        strategyType: num(request.strategy_type) || undefined,
        instrumentUid: str(request.instrument_uid) || undefined,
        from: request.from as string,
        to: request.to as string,
        direction: num(request.direction) || undefined,
        active: num(request.active) || undefined,
      }, { fresh: true });
      return toPlain(res);
    }
    default: {
      const exhaustiveCheck: never = method;
      throw new Error(`Неизвестный метод SignalsService: ${exhaustiveCheck}`);
    }
  }
}
