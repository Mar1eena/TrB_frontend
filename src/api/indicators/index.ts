import { parseTimestamp } from "../common/converters";
import { wrapRpcError } from "../common/errors";
import {
  indPb,
  indicatorsClient,
  invokeListIndicatorValues,
  newComputeForInstrumentRequest,
  newListIndicatorValuesRequest,
} from "./client";

export type IndicatorInfo = {
  type: number;
  name: string;
  minBars: number;
  defaultParams: Record<string, number>;
};

export type IndicatorPoint = {
  timeSec: number;
  time: string;
  values: Record<string, number>;
};

export type ComputeResult = {
  type: number;
  params: Record<string, number>;
  points: IndicatorPoint[];
  totalPoints: number;
};

export type ListIndicatorValuesResult = {
  type: number;
  params: Record<string, number>;
  points: IndicatorPoint[];
  hasMore: boolean;
};

export interface IndicatorConfig {
  id: string;
  type: number;
  name: string;
  params: Record<string, number>;
  persist: boolean;
  visible: boolean;
  color: string;
  lineWidth?: number;
}

function mapToRecord(map: { getEntryList(): Array<[string, number]> }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of map.getEntryList()) {
    out[key] = value;
  }
  return out;
}

function formatPointTime(ts: { getSeconds?: () => number } | undefined): string {
  const sec = ts?.getSeconds?.() ?? 0;
  if (!sec) return "";
  return new Date(sec * 1000).toISOString();
}

export async function listSupportedIndicators(): Promise<IndicatorInfo[]> {
  try {
    const resp = await indicatorsClient.listSupported(new indPb.ListSupportedRequest());
    return resp.getIndicatorsList().map((item) => ({
      type: item.getType(),
      name: item.getName(),
      minBars: item.getMinBars(),
      defaultParams: mapToRecord(item.getDefaultParamsMap()),
    }));
  } catch (err) {
    throw wrapRpcError(err);
  }
}

export async function computeForInstrument(params: {
  uid: string;
  interval: number;
  from: Date;
  to: Date;
  type: number;
  indicatorParams: Record<string, number>;
  persist: boolean;
  maxResponsePoints?: number;
}): Promise<ComputeResult> {
  const req = newComputeForInstrumentRequest();
  req.setUid(params.uid);
  req.setInterval(params.interval);
  const fromTs = parseTimestamp(params.from);
  const toTs = parseTimestamp(params.to);
  if (fromTs) req.setFrom(fromTs);
  if (toTs) req.setTo(toTs);
  req.setType(params.type);
  req.setPersist(params.persist);
  if (
    params.maxResponsePoints !== undefined &&
    typeof req.setMaxResponsePoints === "function"
  ) {
    req.setMaxResponsePoints(params.maxResponsePoints);
  }
  const map = req.getParamsMap();
  for (const [key, value] of Object.entries(params.indicatorParams)) {
    if (Number.isFinite(value)) map.set(key, value);
  }
  try {
    const resp = await indicatorsClient.computeForInstrument(req);
    return {
      type: resp.getType(),
      params: mapToRecord(resp.getParamsMap()),
      totalPoints: typeof resp.getTotalPoints === "function" ? resp.getTotalPoints() : resp.getPointsList().length,
      points: resp.getPointsList().map((point) => {
        const ts = point.getTime();
        const sec = ts?.getSeconds?.() ?? 0;
        return {
          timeSec: sec,
          time: formatPointTime(ts),
          values: mapToRecord(point.getValuesMap()),
        };
      }),
    };
  } catch (err) {
    throw wrapRpcError(err);
  }
}

export async function listIndicatorValues(params: {
  uid: string;
  interval: number;
  from: Date;
  to: Date;
  type: number;
  indicatorParams: Record<string, number>;
  limit?: number;
  after?: Date;
}): Promise<ListIndicatorValuesResult> {
  const req = newListIndicatorValuesRequest();
  req.setUid(params.uid);
  req.setInterval(params.interval);
  const fromTs = parseTimestamp(params.from);
  const toTs = parseTimestamp(params.to);
  if (fromTs) req.setFrom(fromTs);
  if (toTs) req.setTo(toTs);
  req.setType(params.type);
  if (params.limit) req.setLimit(params.limit);
  if (params.after) {
    const afterTs = parseTimestamp(params.after);
    if (afterTs) req.setAfter(afterTs);
  }
  const map = req.getParamsMap();
  for (const [key, value] of Object.entries(params.indicatorParams)) {
    if (Number.isFinite(value)) map.set(key, value);
  }
  try {
    const resp = await invokeListIndicatorValues(req);
    return {
      type: resp.getType(),
      params: mapToRecord(resp.getParamsMap()),
      hasMore: resp.getHasMore(),
      points: resp.getPointsList().map((point) => {
        const ts = point.getTime();
        const sec = ts?.getSeconds?.() ?? 0;
        return {
          timeSec: sec,
          time: formatPointTime(ts),
          values: mapToRecord(point.getValuesMap()),
        };
      }),
    };
  } catch (err) {
    throw wrapRpcError(err);
  }
}

export const FALLBACK_INDICATORS: IndicatorInfo[] = [
  { type: 1, name: "RSI", minBars: 14, defaultParams: { period: 14 } },
  { type: 2, name: "SMA", minBars: 20, defaultParams: { period: 20 } },
  { type: 3, name: "EMA", minBars: 20, defaultParams: { period: 20 } },
  {
    type: 4,
    name: "MACD",
    minBars: 26,
    defaultParams: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
  },
  {
    type: 5,
    name: "BB",
    minBars: 20,
    defaultParams: { period: 20, nbdevup: 2, nbdevdn: 2 },
  },
];
