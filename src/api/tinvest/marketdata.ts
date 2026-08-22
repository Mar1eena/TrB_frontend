import { MarketDataServiceClient } from "@marleena/trb-proto/api/tinvest/MarketdataServiceClientPb";
import {
  CandleInterval,
  CandleSource,
  GetCandlesRequest,
  GetClosePricesRequest,
  GetLastPricesRequest,
  GetLastTradesRequest,
  GetMarketValuesRequest,
  GetOrderBookRequest,
  GetTechAnalysisRequest,
  GetTradingStatusRequest,
  GetTradingStatusesRequest,
  InstrumentClosePriceRequest,
  type GetCandlesResponse,
  type GetClosePricesResponse,
  type GetLastPricesResponse,
  type GetLastTradesResponse,
  type GetMarketValuesResponse,
  type GetOrderBookResponse,
  type GetTechAnalysisResponse,
  type GetTradingStatusResponse,
  type GetTradingStatusesResponse,
} from "@marleena/trb-proto/api/tinvest/marketdata_pb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache, type CacheOptions } from "../common/cache";
import { toPlain, parseTimestamp, str, num } from "../common/converters";

export const marketDataClient = new MarketDataServiceClient(getGrpcBaseUrl());

export const MARKETDATA_GRPC_METHODS = [
  { value: "GetCandles", label: "GetCandles", write: false },
  { value: "GetLastPrices", label: "GetLastPrices", write: false },
  { value: "GetOrderBook", label: "GetOrderBook", write: false },
  { value: "GetTradingStatus", label: "GetTradingStatus", write: false },
  { value: "GetTradingStatuses", label: "GetTradingStatuses", write: false },
  { value: "GetLastTrades", label: "GetLastTrades", write: false },
  { value: "GetClosePrices", label: "GetClosePrices", write: false },
  { value: "GetTechAnalysis", label: "GetTechAnalysis", write: false },
  { value: "GetMarketValues", label: "GetMarketValues", write: false },
] as const;

export type MarketDataGrpcMethod = (typeof MARKETDATA_GRPC_METHODS)[number]["value"];

export async function getCandles(params: {
  instrumentId?: string;
  figi?: string;
  from: Date | string;
  to: Date | string;
  interval?: CandleInterval | number;
  candleSourceType?: CandleSource | number;
  limit?: number;
}, opts?: CacheOptions): Promise<GetCandlesResponse> {
  const id = params.instrumentId || params.figi || "";
  const fromTs = parseTimestamp(params.from);
  const toTs = parseTimestamp(params.to);
  const iv = params.interval ?? CandleInterval.CANDLE_INTERVAL_1_MIN;
  const key = `marketdata:candles:${id}:${iv}:${fromTs?.getSeconds() ?? 0}:${toTs?.getSeconds() ?? 0}`;
  return globalApiCache.read(key, async () => {
    const req = new GetCandlesRequest();
    if (params.instrumentId) req.setInstrumentId(params.instrumentId);
    if (params.figi) req.setFigi(params.figi);
    if (fromTs) req.setFrom(fromTs);
    if (toTs) req.setTo(toTs);
    req.setInterval(iv);
    if (params.candleSourceType != null) req.setCandleSourceType(params.candleSourceType);
    if (params.limit != null && params.limit > 0) req.setLimit(params.limit);
    return marketDataClient.getCandles(req);
  }, opts);
}

export async function getLastPrices(
  instrumentIds: string[],
  opts?: CacheOptions,
): Promise<GetLastPricesResponse> {
  const list = instrumentIds.filter(Boolean);
  const key = `marketdata:lastPrices:${list.join(",")}`;
  return globalApiCache.read(key, async () => {
    const req = new GetLastPricesRequest();
    req.setInstrumentIdList(list);
    return marketDataClient.getLastPrices(req);
  }, opts);
}

export async function getOrderBook(params: {
  instrumentId?: string;
  figi?: string;
  depth?: number;
}, opts?: CacheOptions): Promise<GetOrderBookResponse> {
  const id = params.instrumentId || params.figi || "";
  const depth = params.depth || 20;
  return globalApiCache.read(`marketdata:orderbook:${id}:${depth}`, async () => {
    const req = new GetOrderBookRequest();
    if (params.instrumentId) req.setInstrumentId(params.instrumentId);
    if (params.figi) req.setFigi(params.figi);
    req.setDepth(depth);
    return marketDataClient.getOrderBook(req);
  }, opts);
}

export async function getTradingStatus(params: {
  instrumentId?: string;
  figi?: string;
}, opts?: CacheOptions): Promise<GetTradingStatusResponse> {
  const id = params.instrumentId || params.figi || "";
  return globalApiCache.read(`marketdata:tradingStatus:${id}`, async () => {
    const req = new GetTradingStatusRequest();
    if (params.instrumentId) req.setInstrumentId(params.instrumentId);
    if (params.figi) req.setFigi(params.figi);
    return marketDataClient.getTradingStatus(req);
  }, opts);
}

export async function getTradingStatuses(
  instrumentIds: string[],
  opts?: CacheOptions,
): Promise<GetTradingStatusesResponse> {
  const list = instrumentIds.filter(Boolean);
  return globalApiCache.read(`marketdata:tradingStatuses:${list.join(",")}`, async () => {
    const req = new GetTradingStatusesRequest();
    req.setInstrumentIdList(list);
    return marketDataClient.getTradingStatuses(req);
  }, opts);
}

export async function getLastTrades(params: {
  instrumentId?: string;
  figi?: string;
  from?: Date | string;
  to?: Date | string;
  tradeSource?: number;
}, opts?: CacheOptions): Promise<GetLastTradesResponse> {
  const id = params.instrumentId || params.figi || "";
  return globalApiCache.read(`marketdata:lastTrades:${id}`, async () => {
    const req = new GetLastTradesRequest();
    if (params.instrumentId) req.setInstrumentId(params.instrumentId);
    if (params.figi) req.setFigi(params.figi);
    if (params.from) {
      const ts = parseTimestamp(params.from);
      if (ts) req.setFrom(ts);
    }
    if (params.to) {
      const ts = parseTimestamp(params.to);
      if (ts) req.setTo(ts);
    }
    return marketDataClient.getLastTrades(req);
  }, opts);
}

export async function getClosePrices(
  instrumentIds: string[],
  opts?: CacheOptions,
): Promise<GetClosePricesResponse> {
  const list = instrumentIds.filter(Boolean);
  return globalApiCache.read(`marketdata:closePrices:${list.join(",")}`, async () => {
    const req = new GetClosePricesRequest();
    for (const id of list) {
      const item = new InstrumentClosePriceRequest();
      item.setInstrumentId(id);
      req.addInstruments(item);
    }
    return marketDataClient.getClosePrices(req);
  }, opts);
}

export async function getTechAnalysis(params: {
  indicatorType: GetTechAnalysisRequest.IndicatorType | number;
  instrumentUid: string;
  from: Date | string;
  to: Date | string;
  interval: GetTechAnalysisRequest.IndicatorInterval | number;
  typeOfPrice: GetTechAnalysisRequest.TypeOfPrice | number;
  length?: number;
}, opts?: CacheOptions): Promise<GetTechAnalysisResponse> {
  const fromTs = parseTimestamp(params.from);
  const toTs = parseTimestamp(params.to);
  const key = `marketdata:techAnalysis:${params.instrumentUid}:${params.indicatorType}:${params.interval}`;
  return globalApiCache.read(key, async () => {
    const req = new GetTechAnalysisRequest();
    req.setIndicatorType(params.indicatorType);
    req.setInstrumentUid(params.instrumentUid);
    if (fromTs) req.setFrom(fromTs);
    if (toTs) req.setTo(toTs);
    req.setInterval(params.interval);
    req.setTypeOfPrice(params.typeOfPrice);
    if (params.length != null) req.setLength(params.length);
    return marketDataClient.getTechAnalysis(req);
  }, opts);
}

export async function getMarketValues(
  instrumentIds: string[],
  opts?: CacheOptions,
): Promise<GetMarketValuesResponse> {
  const list = instrumentIds.filter(Boolean);
  return globalApiCache.read(`marketdata:marketValues:${list.join(",")}`, async () => {
    const req = new GetMarketValuesRequest();
    req.setInstrumentIdList(list);
    return marketDataClient.getMarketValues(req);
  }, opts);
}

export async function callMarketDataGrpc(
  method: MarketDataGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (method) {
    case "GetCandles": {
      const res = await getCandles({
        instrumentId: str(request.instrument_id),
        figi: str(request.figi),
        from: request.from as string,
        to: request.to as string,
        interval: num(request.interval),
        limit: num(request.limit) || undefined,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetLastPrices": {
      const ids = Array.isArray(request.instrument_id)
        ? request.instrument_id.map(String)
        : str(request.instrument_id)
        ? [str(request.instrument_id)]
        : [];
      const res = await getLastPrices(ids, { fresh: true });
      return toPlain(res);
    }
    case "GetOrderBook": {
      const res = await getOrderBook({
        instrumentId: str(request.instrument_id),
        figi: str(request.figi),
        depth: num(request.depth) || 20,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetTradingStatus": {
      const res = await getTradingStatus({
        instrumentId: str(request.instrument_id),
        figi: str(request.figi),
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetTradingStatuses": {
      const ids = Array.isArray(request.instrument_id)
        ? request.instrument_id.map(String)
        : [];
      const res = await getTradingStatuses(ids, { fresh: true });
      return toPlain(res);
    }
    case "GetLastTrades": {
      const res = await getLastTrades({
        instrumentId: str(request.instrument_id),
        figi: str(request.figi),
        from: request.from as string,
        to: request.to as string,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetClosePrices": {
      const ids = Array.isArray(request.instruments)
        ? request.instruments.map(String)
        : [str(request.instrument_id)].filter(Boolean);
      const res = await getClosePrices(ids, { fresh: true });
      return toPlain(res);
    }
    case "GetTechAnalysis": {
      const res = await getTechAnalysis({
        indicatorType: num(request.indicator_type),
        instrumentUid: str(request.instrument_uid),
        from: request.from as string,
        to: request.to as string,
        interval: num(request.interval),
        typeOfPrice: num(request.type_of_price),
        length: num(request.length) || undefined,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetMarketValues": {
      const ids = Array.isArray(request.instrument_id)
        ? request.instrument_id.map(String)
        : [str(request.instrument_id)].filter(Boolean);
      const res = await getMarketValues(ids, { fresh: true });
      return toPlain(res);
    }
    default: {
      const exhaustiveCheck: never = method;
      throw new Error(`Неизвестный метод MarketDataService: ${exhaustiveCheck}`);
    }
  }
}
