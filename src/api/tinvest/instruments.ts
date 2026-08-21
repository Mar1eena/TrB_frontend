import { InstrumentsServiceClient } from "@marleena/trb-proto/tinvest/InstrumentsServiceClientPb";
import {
  AssetRequest,
  AssetsRequest,
  EditFavoritesRequest,
  FindInstrumentRequest,
  GetBondCouponsRequest,
  GetBrandRequest,
  GetBrandsRequest,
  GetCountriesRequest,
  GetDividendsRequest,
  GetFavoritesRequest,
  GetForecastRequest,
  GetInsiderDealsRequest,
  InstrumentIdType,
  InstrumentRequest,
  InstrumentsRequest,
  NewsRequest,
  RiskRatesRequest,
  TradingSchedulesRequest,
  type AssetResponse,
  type AssetsResponse,
  type BondResponse,
  type BondsResponse,
  type Brand,
  type CurrenciesResponse,
  type CurrencyResponse,
  type DfaResponse,
  type DfasResponse,
  type EtfResponse,
  type EtfsResponse,
  type FindInstrumentResponse,
  type FutureResponse,
  type FuturesResponse,
  type GetBondCouponsResponse,
  type GetBrandsResponse,
  type GetCountriesResponse,
  type GetDividendsResponse,
  type GetFavoritesResponse,
  type GetForecastResponse,
  type GetInsiderDealsResponse,
  type IndicativesResponse,
  type InstrumentResponse,
  type NewsResponse,
  type OptionResponse,
  type OptionsResponse,
  type RiskRatesResponse,
  type ShareResponse,
  type SharesResponse,
  type TradingSchedulesResponse,
} from "@marleena/trb-proto/tinvest/instruments_pb";
import { InstrumentStatus, InstrumentType } from "@marleena/trb-proto/tinvest/common_pb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache, type CacheOptions } from "../common/cache";
import { toPlain, parseTimestamp, str, num, bool } from "../common/converters";

export const instrumentsClient = new InstrumentsServiceClient(getGrpcBaseUrl());

export const INSTRUMENTS_GRPC_METHODS = [
  { value: "TradingSchedules", label: "TradingSchedules", write: false },
  { value: "Shares", label: "Shares", write: false },
  { value: "ShareBy", label: "ShareBy", write: false },
  { value: "Bonds", label: "Bonds", write: false },
  { value: "BondBy", label: "BondBy", write: false },
  { value: "GetBondCoupons", label: "GetBondCoupons", write: false },
  { value: "Currencies", label: "Currencies", write: false },
  { value: "CurrencyBy", label: "CurrencyBy", write: false },
  { value: "Etfs", label: "Etfs", write: false },
  { value: "EtfBy", label: "EtfBy", write: false },
  { value: "Futures", label: "Futures", write: false },
  { value: "FutureBy", label: "FutureBy", write: false },
  { value: "Options", label: "Options", write: false },
  { value: "OptionBy", label: "OptionBy", write: false },
  { value: "Dfas", label: "Dfas", write: false },
  { value: "DfaBy", label: "DfaBy", write: false },
  { value: "Indicatives", label: "Indicatives", write: false },
  { value: "GetInstrumentBy", label: "GetInstrumentBy", write: false },
  { value: "FindInstrument", label: "FindInstrument", write: false },
  { value: "GetDividends", label: "GetDividends", write: false },
  { value: "GetAssets", label: "GetAssets", write: false },
  { value: "GetAssetBy", label: "GetAssetBy", write: false },
  { value: "GetFavorites", label: "GetFavorites", write: false },
  { value: "EditFavorites", label: "EditFavorites", write: true },
  { value: "GetCountries", label: "GetCountries", write: false },
  { value: "GetBrands", label: "GetBrands", write: false },
  { value: "GetBrandBy", label: "GetBrandBy", write: false },
  { value: "GetForecastBy", label: "GetForecastBy", write: false },
  { value: "GetRiskRates", label: "GetRiskRates", write: false },
  { value: "GetInsiderDeals", label: "GetInsiderDeals", write: false },
  { value: "News", label: "News", write: false },
] as const;

export type InstrumentsGrpcMethod = (typeof INSTRUMENTS_GRPC_METHODS)[number]["value"];

function buildInstrumentReq(id: string, idType?: InstrumentIdType | number, classCode?: string): InstrumentRequest {
  const req = new InstrumentRequest();
  req.setId(id.trim());
  if (idType != null) {
    req.setIdType(idType);
  }
  if (classCode?.trim()) {
    req.setClassCode(classCode.trim());
  }
  return req;
}

function buildInstrumentsReq(status?: InstrumentStatus | number): InstrumentsRequest {
  const req = new InstrumentsRequest();
  if (status != null) {
    req.setInstrumentStatus(status);
  }
  return req;
}

export async function getTradingSchedules(params?: {
  exchange?: string;
  from?: Date | string;
  to?: Date | string;
}, opts?: CacheOptions): Promise<TradingSchedulesResponse> {
  const ex = params?.exchange ?? "";
  return globalApiCache.read(`instruments:schedules:${ex}`, async () => {
    const req = new TradingSchedulesRequest();
    if (params?.exchange) req.setExchange(params.exchange);
    if (params?.from) {
      const fromTs = parseTimestamp(params.from);
      if (fromTs) req.setFrom(fromTs);
    }
    if (params?.to) {
      const toTs = parseTimestamp(params.to);
      if (toTs) req.setTo(toTs);
    }
    return instrumentsClient.tradingSchedules(req);
  }, opts);
}

export async function getShares(status?: InstrumentStatus | number, opts?: CacheOptions): Promise<SharesResponse> {
  return globalApiCache.read(`instruments:shares:${status ?? 0}`, async () => {
    return instrumentsClient.shares(buildInstrumentsReq(status));
  }, opts);
}

export async function getShareBy(id: string, idType?: InstrumentIdType | number, classCode?: string, opts?: CacheOptions): Promise<ShareResponse> {
  return globalApiCache.read(`instruments:shareBy:${id}:${idType ?? 0}:${classCode ?? ""}`, async () => {
    return instrumentsClient.shareBy(buildInstrumentReq(id, idType, classCode));
  }, opts);
}

export async function getBonds(status?: InstrumentStatus | number, opts?: CacheOptions): Promise<BondsResponse> {
  return globalApiCache.read(`instruments:bonds:${status ?? 0}`, async () => {
    return instrumentsClient.bonds(buildInstrumentsReq(status));
  }, opts);
}

export async function getBondBy(id: string, idType?: InstrumentIdType | number, classCode?: string, opts?: CacheOptions): Promise<BondResponse> {
  return globalApiCache.read(`instruments:bondBy:${id}:${idType ?? 0}:${classCode ?? ""}`, async () => {
    return instrumentsClient.bondBy(buildInstrumentReq(id, idType, classCode));
  }, opts);
}

export async function getBondCoupons(params: {
  figi?: string;
  from?: Date | string;
  to?: Date | string;
  instrumentId?: string;
}, opts?: CacheOptions): Promise<GetBondCouponsResponse> {
  const id = params.instrumentId || params.figi || "";
  return globalApiCache.read(`instruments:bondCoupons:${id}`, async () => {
    const req = new GetBondCouponsRequest();
    if (params.figi) req.setFigi(params.figi);
    if (params.instrumentId) req.setInstrumentId(params.instrumentId);
    if (params.from) {
      const ts = parseTimestamp(params.from);
      if (ts) req.setFrom(ts);
    }
    if (params.to) {
      const ts = parseTimestamp(params.to);
      if (ts) req.setTo(ts);
    }
    return instrumentsClient.getBondCoupons(req);
  }, opts);
}

export async function getCurrencies(status?: InstrumentStatus | number, opts?: CacheOptions): Promise<CurrenciesResponse> {
  return globalApiCache.read(`instruments:currencies:${status ?? 0}`, async () => {
    return instrumentsClient.currencies(buildInstrumentsReq(status));
  }, opts);
}

export async function getCurrencyBy(id: string, idType?: InstrumentIdType | number, classCode?: string, opts?: CacheOptions): Promise<CurrencyResponse> {
  return globalApiCache.read(`instruments:currencyBy:${id}:${idType ?? 0}:${classCode ?? ""}`, async () => {
    return instrumentsClient.currencyBy(buildInstrumentReq(id, idType, classCode));
  }, opts);
}

export async function getEtfs(status?: InstrumentStatus | number, opts?: CacheOptions): Promise<EtfsResponse> {
  return globalApiCache.read(`instruments:etfs:${status ?? 0}`, async () => {
    return instrumentsClient.etfs(buildInstrumentsReq(status));
  }, opts);
}

export async function getEtfBy(id: string, idType?: InstrumentIdType | number, classCode?: string, opts?: CacheOptions): Promise<EtfResponse> {
  return globalApiCache.read(`instruments:etfBy:${id}:${idType ?? 0}:${classCode ?? ""}`, async () => {
    return instrumentsClient.etfBy(buildInstrumentReq(id, idType, classCode));
  }, opts);
}

export async function getFutures(status?: InstrumentStatus | number, opts?: CacheOptions): Promise<FuturesResponse> {
  return globalApiCache.read(`instruments:futures:${status ?? 0}`, async () => {
    return instrumentsClient.futures(buildInstrumentsReq(status));
  }, opts);
}

export async function getFutureBy(id: string, idType?: InstrumentIdType | number, classCode?: string, opts?: CacheOptions): Promise<FutureResponse> {
  return globalApiCache.read(`instruments:futureBy:${id}:${idType ?? 0}:${classCode ?? ""}`, async () => {
    return instrumentsClient.futureBy(buildInstrumentReq(id, idType, classCode));
  }, opts);
}

export async function getOptions(status?: InstrumentStatus | number, opts?: CacheOptions): Promise<OptionsResponse> {
  return globalApiCache.read(`instruments:options:${status ?? 0}`, async () => {
    return instrumentsClient.options(buildInstrumentsReq(status));
  }, opts);
}

export async function getOptionBy(id: string, idType?: InstrumentIdType | number, classCode?: string, opts?: CacheOptions): Promise<OptionResponse> {
  return globalApiCache.read(`instruments:optionBy:${id}:${idType ?? 0}:${classCode ?? ""}`, async () => {
    return instrumentsClient.optionBy(buildInstrumentReq(id, idType, classCode));
  }, opts);
}

export async function getDfas(status?: InstrumentStatus | number, opts?: CacheOptions): Promise<DfasResponse> {
  return globalApiCache.read(`instruments:dfas:${status ?? 0}`, async () => {
    return instrumentsClient.dfas(buildInstrumentsReq(status));
  }, opts);
}

export async function getDfaBy(id: string, idType?: InstrumentIdType | number, classCode?: string, opts?: CacheOptions): Promise<DfaResponse> {
  return globalApiCache.read(`instruments:dfaBy:${id}:${idType ?? 0}:${classCode ?? ""}`, async () => {
    return instrumentsClient.dfaBy(buildInstrumentReq(id, idType, classCode));
  }, opts);
}

export async function getIndicatives(status?: InstrumentStatus | number, opts?: CacheOptions): Promise<IndicativesResponse> {
  return globalApiCache.read(`instruments:indicatives:${status ?? 0}`, async () => {
    return instrumentsClient.indicatives(buildInstrumentsReq(status));
  }, opts);
}

export async function getInstrumentBy(id: string, idType?: InstrumentIdType | number, classCode?: string, opts?: CacheOptions): Promise<InstrumentResponse> {
  return globalApiCache.read(`instruments:instrumentBy:${id}:${idType ?? 0}:${classCode ?? ""}`, async () => {
    return instrumentsClient.getInstrumentBy(buildInstrumentReq(id, idType, classCode));
  }, opts);
}

export async function getDividends(params: {
  figi?: string;
  from?: Date | string;
  to?: Date | string;
  instrumentId?: string;
}, opts?: CacheOptions): Promise<GetDividendsResponse> {
  const id = params.instrumentId || params.figi || "";
  return globalApiCache.read(`instruments:dividends:${id}`, async () => {
    const req = new GetDividendsRequest();
    if (params.figi) req.setFigi(params.figi);
    if (params.instrumentId) req.setInstrumentId(params.instrumentId);
    if (params.from) {
      const ts = parseTimestamp(params.from);
      if (ts) req.setFrom(ts);
    }
    if (params.to) {
      const ts = parseTimestamp(params.to);
      if (ts) req.setTo(ts);
    }
    return instrumentsClient.getDividends(req);
  }, opts);
}

export async function getAssets(instrumentType?: InstrumentType, opts?: CacheOptions): Promise<AssetsResponse> {
  return globalApiCache.read(`instruments:assets:${instrumentType ?? 0}`, async () => {
    const req = new AssetsRequest();
    if (instrumentType != null) {
      req.setInstrumentType(instrumentType);
    }
    return instrumentsClient.getAssets(req);
  }, opts);
}

export async function getAssetBy(id: string, opts?: CacheOptions): Promise<AssetResponse> {
  return globalApiCache.read(`instruments:assetBy:${id}`, async () => {
    const req = new AssetRequest();
    req.setId(id.trim());
    return instrumentsClient.getAssetBy(req);
  }, opts);
}

export async function getFavorites(opts?: CacheOptions): Promise<GetFavoritesResponse> {
  return globalApiCache.read("instruments:favorites", async () => {
    return instrumentsClient.getFavorites(new GetFavoritesRequest());
  }, opts);
}

export async function getCountries(opts?: CacheOptions): Promise<GetCountriesResponse> {
  return globalApiCache.read("instruments:countries", async () => {
    return instrumentsClient.getCountries(new GetCountriesRequest());
  }, opts);
}

export async function findInstrument(query: string, instrumentKind?: InstrumentType, apiTradeAvailable?: boolean, opts?: CacheOptions): Promise<FindInstrumentResponse> {
  return globalApiCache.read(`instruments:find:${query}:${instrumentKind ?? 0}:${apiTradeAvailable ?? ""}`, async () => {
    const req = new FindInstrumentRequest();
    req.setQuery(query.trim());
    if (instrumentKind != null) req.setInstrumentKind(instrumentKind);
    if (apiTradeAvailable != null) req.setApiTradeAvailableFlag(apiTradeAvailable);
    return instrumentsClient.findInstrument(req);
  }, opts);
}

export async function getBrands(opts?: CacheOptions): Promise<GetBrandsResponse> {
  return globalApiCache.read("instruments:brands", async () => {
    return instrumentsClient.getBrands(new GetBrandsRequest());
  }, opts);
}

export async function getBrandBy(id: string, opts?: CacheOptions): Promise<Brand> {
  return globalApiCache.read(`instruments:brandBy:${id}`, async () => {
    const req = new GetBrandRequest();
    req.setId(id.trim());
    return instrumentsClient.getBrandBy(req);
  }, opts);
}

export async function getForecastBy(instrumentId: string, opts?: CacheOptions): Promise<GetForecastResponse> {
  return globalApiCache.read(`instruments:forecastBy:${instrumentId}`, async () => {
    const req = new GetForecastRequest();
    req.setInstrumentId(instrumentId.trim());
    return instrumentsClient.getForecastBy(req);
  }, opts);
}

export async function getRiskRates(instrumentId?: string, opts?: CacheOptions): Promise<RiskRatesResponse> {
  const id = instrumentId?.trim() ?? "";
  return globalApiCache.read(`instruments:riskRates:${id}`, async () => {
    const req = new RiskRatesRequest();
    if (id) req.setInstrumentIdList([id]);
    return instrumentsClient.getRiskRates(req);
  }, opts);
}

export async function getInsiderDeals(params: {
  instrumentId: string;
  limit?: number;
  nextCursor?: string;
}, opts?: CacheOptions): Promise<GetInsiderDealsResponse> {
  return globalApiCache.read(`instruments:insiderDeals:${params.instrumentId}:${params.nextCursor ?? ""}`, async () => {
    const req = new GetInsiderDealsRequest();
    req.setInstrumentId(params.instrumentId.trim());
    if (params.limit != null && params.limit > 0) req.setLimit(params.limit);
    if (params.nextCursor) req.setNextCursor(params.nextCursor);
    return instrumentsClient.getInsiderDeals(req);
  }, opts);
}

export async function getNews(params?: {
  limit?: number;
  cursor?: number;
}, opts?: CacheOptions): Promise<NewsResponse> {
  return globalApiCache.read(`instruments:news:${params?.cursor ?? 0}:${params?.limit ?? 0}`, async () => {
    const req = new NewsRequest();
    if (params?.limit != null) req.setLimit(params.limit);
    if (params?.cursor != null) req.setCursor(params.cursor);
    return instrumentsClient.news(req);
  }, opts);
}

export async function callInstrumentsGrpc(
  method: InstrumentsGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (method) {
    case "TradingSchedules": {
      const res = await getTradingSchedules({
        exchange: str(request.exchange),
        from: request.from as string,
        to: request.to as string,
      }, { fresh: true });
      return toPlain(res);
    }
    case "Shares": {
      const res = await getShares(num(request.status), { fresh: true });
      return toPlain(res);
    }
    case "ShareBy": {
      const res = await getShareBy(str(request.id), num(request.id_type), str(request.class_code), { fresh: true });
      return toPlain(res);
    }
    case "Bonds": {
      const res = await getBonds(num(request.status), { fresh: true });
      return toPlain(res);
    }
    case "BondBy": {
      const res = await getBondBy(str(request.id), num(request.id_type), str(request.class_code), { fresh: true });
      return toPlain(res);
    }
    case "GetBondCoupons": {
      const res = await getBondCoupons({
        figi: str(request.figi),
        instrumentId: str(request.instrument_id),
        from: request.from as string,
        to: request.to as string,
      }, { fresh: true });
      return toPlain(res);
    }
    case "Currencies": {
      const res = await getCurrencies(num(request.status), { fresh: true });
      return toPlain(res);
    }
    case "CurrencyBy": {
      const res = await getCurrencyBy(str(request.id), num(request.id_type), str(request.class_code), { fresh: true });
      return toPlain(res);
    }
    case "Etfs": {
      const res = await getEtfs(num(request.status), { fresh: true });
      return toPlain(res);
    }
    case "EtfBy": {
      const res = await getEtfBy(str(request.id), num(request.id_type), str(request.class_code), { fresh: true });
      return toPlain(res);
    }
    case "Futures": {
      const res = await getFutures(num(request.status), { fresh: true });
      return toPlain(res);
    }
    case "FutureBy": {
      const res = await getFutureBy(str(request.id), num(request.id_type), str(request.class_code), { fresh: true });
      return toPlain(res);
    }
    case "Options": {
      const res = await getOptions(num(request.status), { fresh: true });
      return toPlain(res);
    }
    case "OptionBy": {
      const res = await getOptionBy(str(request.id), num(request.id_type), str(request.class_code), { fresh: true });
      return toPlain(res);
    }
    case "Dfas": {
      const res = await getDfas(num(request.status), { fresh: true });
      return toPlain(res);
    }
    case "DfaBy": {
      const res = await getDfaBy(str(request.id), num(request.id_type), str(request.class_code), { fresh: true });
      return toPlain(res);
    }
    case "Indicatives": {
      const res = await getIndicatives(num(request.status), { fresh: true });
      return toPlain(res);
    }
    case "GetInstrumentBy": {
      const res = await getInstrumentBy(str(request.id), num(request.id_type), str(request.class_code), { fresh: true });
      return toPlain(res);
    }
    case "FindInstrument": {
      const res = await findInstrument(str(request.query), num(request.instrument_kind), bool(request.api_trade_available_flag), { fresh: true });
      return toPlain(res);
    }
    case "GetDividends": {
      const res = await getDividends({
        figi: str(request.figi),
        instrumentId: str(request.instrument_id),
        from: request.from as string,
        to: request.to as string,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetAssets": {
      const res = await getAssets(num(request.instrument_type), { fresh: true });
      return toPlain(res);
    }
    case "GetAssetBy": {
      const res = await getAssetBy(str(request.id), { fresh: true });
      return toPlain(res);
    }
    case "GetFavorites": {
      const res = await getFavorites({ fresh: true });
      return toPlain(res);
    }
    case "EditFavorites": {
      const req = new EditFavoritesRequest();
      const res = await globalApiCache.write(async () => instrumentsClient.editFavorites(req));
      return toPlain(res);
    }
    case "GetCountries": {
      const res = await getCountries({ fresh: true });
      return toPlain(res);
    }
    case "GetBrands": {
      const res = await getBrands({ fresh: true });
      return toPlain(res);
    }
    case "GetBrandBy": {
      const res = await getBrandBy(str(request.id), { fresh: true });
      return toPlain(res);
    }
    case "GetForecastBy": {
      const res = await getForecastBy(str(request.instrument_id), { fresh: true });
      return toPlain(res);
    }
    case "GetRiskRates": {
      const res = await getRiskRates(str(request.instrument_id), { fresh: true });
      return toPlain(res);
    }
    case "GetInsiderDeals": {
      const res = await getInsiderDeals({
        instrumentId: str(request.instrument_id),
        limit: num(request.limit) || undefined,
        nextCursor: str(request.next_cursor) || undefined,
      }, { fresh: true });
      return toPlain(res);
    }
    case "News": {
      const res = await getNews({
        limit: num(request.limit) || undefined,
        cursor: num(request.cursor) || undefined,
      }, { fresh: true });
      return toPlain(res);
    }
    default: {
      const exhaustiveCheck: never = method;
      throw new Error(`Неизвестный метод InstrumentsService: ${exhaustiveCheck}`);
    }
  }
}
