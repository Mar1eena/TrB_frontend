import { OperationsServiceClient } from "@marleena/trb-proto/tinvest/OperationsServiceClientPb";
import {
  BrokerReportRequest,
  GenerateBrokerReportRequest,
  GenerateDividendsForeignIssuerReportRequest,
  GetBrokerReportRequest,
  GetDividendsForeignIssuerReportRequest,
  GetDividendsForeignIssuerRequest,
  GetOperationsByCursorRequest,
  OperationsRequest,
  OperationState,
  PortfolioRequest,
  PositionsRequest,
  WithdrawLimitsRequest,
  type BrokerReportResponse,
  type GetDividendsForeignIssuerResponse,
  type GetOperationsByCursorResponse,
  type OperationsResponse,
  type PortfolioResponse,
  type PositionsResponse,
  type WithdrawLimitsResponse,
} from "@marleena/trb-proto/tinvest/operations_pb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache, type CacheOptions } from "../common/cache";
import { toPlain, parseTimestamp, str, num, bool } from "../common/converters";

export const operationsClient = new OperationsServiceClient(getGrpcBaseUrl());

export const OPERATIONS_GRPC_METHODS = [
  { value: "GetOperations", label: "GetOperations", write: false },
  { value: "GetPortfolio", label: "GetPortfolio", write: false },
  { value: "GetPositions", label: "GetPositions", write: false },
  { value: "GetWithdrawLimits", label: "GetWithdrawLimits", write: false },
  { value: "GetBrokerReport", label: "GetBrokerReport", write: false },
  { value: "GetDividendsForeignIssuer", label: "GetDividendsForeignIssuer", write: false },
  { value: "GetOperationsByCursor", label: "GetOperationsByCursor", write: false },
] as const;

export type OperationsGrpcMethod = (typeof OPERATIONS_GRPC_METHODS)[number]["value"];

export async function getOperations(params: {
  accountId: string;
  from?: Date | string;
  to?: Date | string;
  state?: OperationState | number;
  figi?: string;
}, opts?: CacheOptions): Promise<OperationsResponse> {
  const key = `operations:list:${params.accountId}:${params.figi ?? ""}:${params.state ?? 0}`;
  return globalApiCache.read(key, async () => {
    const req = new OperationsRequest();
    req.setAccountId(params.accountId.trim());
    if (params.from) {
      const ts = parseTimestamp(params.from);
      if (ts) req.setFrom(ts);
    }
    if (params.to) {
      const ts = parseTimestamp(params.to);
      if (ts) req.setTo(ts);
    }
    if (params.state != null) req.setState(params.state);
    if (params.figi) req.setFigi(params.figi.trim());
    return operationsClient.getOperations(req);
  }, opts);
}

export async function getPortfolio(params: {
  accountId: string;
  currency?: PortfolioRequest.CurrencyRequest | number;
}, opts?: CacheOptions): Promise<PortfolioResponse> {
  const key = `operations:portfolio:${params.accountId}:${params.currency ?? 0}`;
  return globalApiCache.read(key, async () => {
    const req = new PortfolioRequest();
    req.setAccountId(params.accountId.trim());
    if (params.currency != null) req.setCurrency(params.currency);
    return operationsClient.getPortfolio(req);
  }, opts);
}

export async function getPositions(
  accountId: string,
  opts?: CacheOptions,
): Promise<PositionsResponse> {
  return globalApiCache.read(`operations:positions:${accountId}`, async () => {
    const req = new PositionsRequest();
    req.setAccountId(accountId.trim());
    return operationsClient.getPositions(req);
  }, opts);
}

export async function getWithdrawLimits(
  accountId: string,
  opts?: CacheOptions,
): Promise<WithdrawLimitsResponse> {
  return globalApiCache.read(`operations:withdrawLimits:${accountId}`, async () => {
    const req = new WithdrawLimitsRequest();
    req.setAccountId(accountId.trim());
    return operationsClient.getWithdrawLimits(req);
  }, opts);
}

export async function getBrokerReport(params: {
  generateReportRequest?: { accountId: string; from: Date | string; to: Date | string };
  getReportRequest?: { id: string; page?: number };
}, opts?: CacheOptions): Promise<BrokerReportResponse> {
  return globalApiCache.read("operations:brokerReport", async () => {
    const req = new BrokerReportRequest();
    if (params.generateReportRequest) {
      const gen = new GenerateBrokerReportRequest();
      gen.setAccountId(params.generateReportRequest.accountId);
      const fromTs = parseTimestamp(params.generateReportRequest.from);
      const toTs = parseTimestamp(params.generateReportRequest.to);
      if (fromTs) gen.setFrom(fromTs);
      if (toTs) gen.setTo(toTs);
      req.setGenerateBrokerReportRequest(gen);
    }
    if (params.getReportRequest) {
      const get = new GetBrokerReportRequest();
      get.setTaskId(params.getReportRequest.id);
      if (params.getReportRequest.page != null) get.setPage(params.getReportRequest.page);
      req.setGetBrokerReportRequest(get);
    }
    return operationsClient.getBrokerReport(req);
  }, opts);
}

export async function getDividendsForeignIssuer(params: {
  generateDivQuery?: { accountId: string; from: Date | string; to: Date | string };
  getDivReportQuery?: { id: string; page?: number };
}, opts?: CacheOptions): Promise<GetDividendsForeignIssuerResponse> {
  return globalApiCache.read("operations:divForeignIssuer", async () => {
    const req = new GetDividendsForeignIssuerRequest();
    if (params.generateDivQuery) {
      const gen = new GenerateDividendsForeignIssuerReportRequest();
      gen.setAccountId(params.generateDivQuery.accountId);
      const fromTs = parseTimestamp(params.generateDivQuery.from);
      const toTs = parseTimestamp(params.generateDivQuery.to);
      if (fromTs) gen.setFrom(fromTs);
      if (toTs) gen.setTo(toTs);
      req.setGenerateDivForeignIssuerReport(gen);
    }
    if (params.getDivReportQuery) {
      const get = new GetDividendsForeignIssuerReportRequest();
      get.setTaskId(params.getDivReportQuery.id);
      if (params.getDivReportQuery.page != null) get.setPage(params.getDivReportQuery.page);
      req.setGetDivForeignIssuerReport(get);
    }
    return operationsClient.getDividendsForeignIssuer(req);
  }, opts);
}

export async function getOperationsByCursor(params: {
  accountId: string;
  instrumentId?: string;
  from?: Date | string;
  to?: Date | string;
  cursor?: string;
  limit?: number;
  state?: OperationState | number;
  withoutCommissions?: boolean;
  withoutTrades?: boolean;
  withoutOvernights?: boolean;
}, opts?: CacheOptions): Promise<GetOperationsByCursorResponse> {
  const key = `operations:cursor:${params.accountId}:${params.cursor ?? ""}:${params.instrumentId ?? ""}`;
  return globalApiCache.read(key, async () => {
    const req = new GetOperationsByCursorRequest();
    req.setAccountId(params.accountId.trim());
    if (params.instrumentId) req.setInstrumentId(params.instrumentId.trim());
    if (params.from) {
      const ts = parseTimestamp(params.from);
      if (ts) req.setFrom(ts);
    }
    if (params.to) {
      const ts = parseTimestamp(params.to);
      if (ts) req.setTo(ts);
    }
    if (params.cursor) req.setCursor(params.cursor);
    if (params.limit != null && params.limit > 0) req.setLimit(params.limit);
    if (params.state != null) req.setState(params.state);
    if (params.withoutCommissions != null) req.setWithoutCommissions(params.withoutCommissions);
    if (params.withoutTrades != null) req.setWithoutTrades(params.withoutTrades);
    if (params.withoutOvernights != null) req.setWithoutOvernights(params.withoutOvernights);
    return operationsClient.getOperationsByCursor(req);
  }, opts);
}

export async function callOperationsGrpc(
  method: OperationsGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (method) {
    case "GetOperations": {
      const res = await getOperations({
        accountId: str(request.account_id),
        from: request.from as string,
        to: request.to as string,
        state: num(request.state) || undefined,
        figi: str(request.figi) || undefined,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetPortfolio": {
      const res = await getPortfolio({
        accountId: str(request.account_id),
        currency: num(request.currency) || undefined,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetPositions": {
      const res = await getPositions(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    case "GetWithdrawLimits": {
      const res = await getWithdrawLimits(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    case "GetBrokerReport": {
      const res = await getBrokerReport({}, { fresh: true });
      return toPlain(res);
    }
    case "GetDividendsForeignIssuer": {
      const res = await getDividendsForeignIssuer({}, { fresh: true });
      return toPlain(res);
    }
    case "GetOperationsByCursor": {
      const res = await getOperationsByCursor({
        accountId: str(request.account_id),
        instrumentId: str(request.instrument_id) || undefined,
        from: request.from as string,
        to: request.to as string,
        cursor: str(request.cursor) || undefined,
        limit: num(request.limit) || undefined,
        state: num(request.state) || undefined,
        withoutCommissions: bool(request.without_commissions),
        withoutTrades: bool(request.without_trades),
        withoutOvernights: bool(request.without_overnights),
      }, { fresh: true });
      return toPlain(res);
    }
    default: {
      const exhaustiveCheck: never = method;
      throw new Error(`Неизвестный метод OperationsService: ${exhaustiveCheck}`);
    }
  }
}
