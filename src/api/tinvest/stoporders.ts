import { StopOrdersServiceClient } from "@marleena/trb-proto/api/tinvest/StopordersServiceClientPb";
import {
  CancelStopOrderRequest,
  ExchangeOrderType,
  GetStopOrdersRequest,
  PostStopOrderRequest,
  StopOrderDirection,
  StopOrderExpirationType,
  StopOrderStatusOption,
  StopOrderType,
  TakeProfitType,
  TrailingValueType,
  type CancelStopOrderResponse,
  type GetStopOrdersResponse,
  type PostStopOrderResponse,
} from "@marleena/trb-proto/api/tinvest/stoporders_pb";
import { type Quotation } from "@marleena/trb-proto/api/tinvest/common_pb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache, type CacheOptions } from "../common/cache";
import { toPlain, toQuotation, parseTimestamp, str, num } from "../common/converters";

export const stopOrdersClient = new StopOrdersServiceClient(getGrpcBaseUrl());

export const STOPORDERS_GRPC_METHODS = [
  { value: "GetStopOrders", label: "GetStopOrders", write: false },
  { value: "PostStopOrder", label: "PostStopOrder", write: true },
  { value: "CancelStopOrder", label: "CancelStopOrder", write: true },
] as const;

export type StopOrdersGrpcMethod = (typeof STOPORDERS_GRPC_METHODS)[number]["value"];

export async function getStopOrders(params: {
  accountId: string;
  status?: StopOrderStatusOption | number;
  from?: Date | string;
  to?: Date | string;
}, opts?: CacheOptions): Promise<GetStopOrdersResponse> {
  const key = `stoporders:list:${params.accountId}:${params.status ?? 0}`;
  return globalApiCache.read(key, async () => {
    const req = new GetStopOrdersRequest();
    req.setAccountId(params.accountId.trim());
    if (params.status != null) req.setStatus(params.status);
    if (params.from) {
      const ts = parseTimestamp(params.from);
      if (ts) req.setFrom(ts);
    }
    if (params.to) {
      const ts = parseTimestamp(params.to);
      if (ts) req.setTo(ts);
    }
    return stopOrdersClient.getStopOrders(req);
  }, opts);
}

export async function postStopOrder(params: {
  accountId: string;
  instrumentId?: string;
  figi?: string;
  quantity: number;
  price?: Quotation | number | string;
  stopPrice?: Quotation | number | string;
  direction: StopOrderDirection | number;
  stopOrderType: StopOrderType | number;
  expirationType: StopOrderExpirationType | number;
  expireDate?: Date | string;
  exchangeOrderType?: ExchangeOrderType | number;
  takeProfitType?: TakeProfitType | number;
  trailingValue?: Quotation | number | string;
  trailingValueType?: TrailingValueType | number;
}): Promise<PostStopOrderResponse> {
  return globalApiCache.write(async () => {
    const req = new PostStopOrderRequest();
    req.setAccountId(params.accountId.trim());
    if (params.instrumentId) req.setInstrumentId(params.instrumentId.trim());
    if (params.figi) req.setFigi(params.figi.trim());
    req.setQuantity(params.quantity);
    if (params.price != null) req.setPrice(toQuotation(params.price));
    if (params.stopPrice != null) req.setStopPrice(toQuotation(params.stopPrice));
    req.setDirection(params.direction);
    req.setStopOrderType(params.stopOrderType);
    req.setExpirationType(params.expirationType);
    if (params.expireDate) {
      const ts = parseTimestamp(params.expireDate);
      if (ts) req.setExpireDate(ts);
    }
    if (params.exchangeOrderType != null) req.setExchangeOrderType(params.exchangeOrderType);
    if (params.takeProfitType != null) req.setTakeProfitType(params.takeProfitType);
    if (params.trailingValue != null) {
      const td = new PostStopOrderRequest.TrailingData();
      td.setIndent(toQuotation(params.trailingValue));
      if (params.trailingValueType != null) {
        td.setIndentType(params.trailingValueType);
      }
      req.setTrailingData(td);
    }
    return stopOrdersClient.postStopOrder(req);
  });
}

export async function cancelStopOrder(
  accountId: string,
  stopOrderId: string,
): Promise<CancelStopOrderResponse> {
  return globalApiCache.write(async () => {
    const req = new CancelStopOrderRequest();
    req.setAccountId(accountId.trim());
    req.setStopOrderId(stopOrderId.trim());
    return stopOrdersClient.cancelStopOrder(req);
  });
}

export async function callStopOrdersGrpc(
  method: StopOrdersGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (method) {
    case "GetStopOrders": {
      const res = await getStopOrders({
        accountId: str(request.account_id),
        status: num(request.status) || undefined,
        from: request.from as string,
        to: request.to as string,
      }, { fresh: true });
      return toPlain(res);
    }
    case "PostStopOrder": {
      const res = await postStopOrder({
        accountId: str(request.account_id),
        instrumentId: str(request.instrument_id) || undefined,
        figi: str(request.figi) || undefined,
        quantity: num(request.quantity),
        price: request.price as Quotation | number | string,
        stopPrice: request.stop_price as Quotation | number | string,
        direction: num(request.direction),
        stopOrderType: num(request.stop_order_type),
        expirationType: num(request.expiration_type),
        expireDate: request.expire_date as string,
      });
      return toPlain(res);
    }
    case "CancelStopOrder": {
      const res = await cancelStopOrder(str(request.account_id), str(request.stop_order_id));
      return toPlain(res);
    }
    default: {
      const exhaustiveCheck: never = method;
      throw new Error(`Неизвестный метод StopOrdersService: ${exhaustiveCheck}`);
    }
  }
}
