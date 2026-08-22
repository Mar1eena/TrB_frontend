import { OrdersServiceClient } from "@marleena/trb-proto/api/tinvest/OrdersServiceClientPb";
import {
  CancelOrderRequest,
  GetMaxLotsRequest,
  GetOrderPriceRequest,
  GetOrderStateRequest,
  GetOrdersRequest,
  OrderDirection,
  OrderIdType,
  OrderType,
  PostOrderAsyncRequest,
  PostOrderRequest,
  ReplaceOrderRequest,
  TimeInForceType,
  type CancelOrderResponse,
  type GetMaxLotsResponse,
  type GetOrderPriceResponse,
  type GetOrdersResponse,
  type OrderState,
  type PostOrderAsyncResponse,
  type PostOrderResponse,
} from "@marleena/trb-proto/api/tinvest/orders_pb";
import { PriceType, type Quotation } from "@marleena/trb-proto/api/tinvest/common_pb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache, type CacheOptions } from "../common/cache";
import { toPlain, toQuotation, str, num } from "../common/converters";

export const ordersClient = new OrdersServiceClient(getGrpcBaseUrl());

export const ORDERS_GRPC_METHODS = [
  { value: "GetOrders", label: "GetOrders", write: false },
  { value: "GetOrderState", label: "GetOrderState", write: false },
  { value: "PostOrder", label: "PostOrder", write: true },
  { value: "PostOrderAsync", label: "PostOrderAsync", write: true },
  { value: "CancelOrder", label: "CancelOrder", write: true },
  { value: "ReplaceOrder", label: "ReplaceOrder", write: true },
  { value: "GetMaxLots", label: "GetMaxLots", write: false },
  { value: "GetOrderPrice", label: "GetOrderPrice", write: false },
] as const;

export type OrdersGrpcMethod = (typeof ORDERS_GRPC_METHODS)[number]["value"];

export async function getOrders(
  accountId: string,
  opts?: CacheOptions,
): Promise<GetOrdersResponse> {
  return globalApiCache.read(`orders:list:${accountId}`, async () => {
    const req = new GetOrdersRequest();
    req.setAccountId(accountId.trim());
    return ordersClient.getOrders(req);
  }, opts);
}

export async function getOrderState(params: {
  accountId: string;
  orderId: string;
  priceType?: PriceType | number;
  orderIdType?: OrderIdType | number;
}, opts?: CacheOptions): Promise<OrderState> {
  const key = `orders:state:${params.accountId}:${params.orderId}`;
  return globalApiCache.read(key, async () => {
    const req = new GetOrderStateRequest();
    req.setAccountId(params.accountId.trim());
    req.setOrderId(params.orderId.trim());
    if (params.priceType != null) req.setPriceType(params.priceType);
    if (params.orderIdType != null) req.setOrderIdType(params.orderIdType);
    return ordersClient.getOrderState(req);
  }, opts);
}

export async function postOrder(params: {
  accountId: string;
  instrumentId?: string;
  figi?: string;
  quantity: number;
  price?: Quotation | number | string;
  direction: OrderDirection | number;
  orderType: OrderType | number;
  orderId?: string;
  timeInForce?: TimeInForceType | number;
  priceType?: PriceType | number;
}): Promise<PostOrderResponse> {
  return globalApiCache.write(async () => {
    const req = new PostOrderRequest();
    req.setAccountId(params.accountId.trim());
    if (params.instrumentId) req.setInstrumentId(params.instrumentId.trim());
    if (params.figi) req.setFigi(params.figi.trim());
    req.setQuantity(params.quantity);
    if (params.price != null) req.setPrice(toQuotation(params.price));
    req.setDirection(params.direction);
    req.setOrderType(params.orderType);
    req.setOrderId(params.orderId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ord-${Date.now()}`));
    if (params.timeInForce != null) req.setTimeInForce(params.timeInForce);
    if (params.priceType != null) req.setPriceType(params.priceType);
    return ordersClient.postOrder(req);
  });
}

export async function postOrderAsync(params: {
  accountId: string;
  instrumentId?: string;
  figi?: string;
  quantity: number;
  price?: Quotation | number | string;
  direction: OrderDirection | number;
  orderType: OrderType | number;
  orderId?: string;
  timeInForce?: TimeInForceType | number;
  priceType?: PriceType | number;
}): Promise<PostOrderAsyncResponse> {
  return globalApiCache.write(async () => {
    const req = new PostOrderAsyncRequest();
    req.setAccountId(params.accountId.trim());
    const id = params.instrumentId || params.figi;
    if (id) req.setInstrumentId(id.trim());
    req.setQuantity(params.quantity);
    if (params.price != null) req.setPrice(toQuotation(params.price));
    req.setDirection(params.direction);
    req.setOrderType(params.orderType);
    req.setOrderId(params.orderId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ord-async-${Date.now()}`));
    if (params.timeInForce != null) req.setTimeInForce(params.timeInForce);
    if (params.priceType != null) req.setPriceType(params.priceType);
    return ordersClient.postOrderAsync(req);
  });
}

export async function cancelOrder(params: {
  accountId: string;
  orderId: string;
  orderIdType?: OrderIdType | number;
}): Promise<CancelOrderResponse> {
  return globalApiCache.write(async () => {
    const req = new CancelOrderRequest();
    req.setAccountId(params.accountId.trim());
    req.setOrderId(params.orderId.trim());
    if (params.orderIdType != null) req.setOrderIdType(params.orderIdType);
    return ordersClient.cancelOrder(req);
  });
}

export async function replaceOrder(params: {
  accountId: string;
  orderId: string;
  idempotencyKey?: string;
  quantity: number;
  price?: Quotation | number | string;
  priceType?: PriceType | number;
}): Promise<PostOrderResponse> {
  return globalApiCache.write(async () => {
    const req = new ReplaceOrderRequest();
    req.setAccountId(params.accountId.trim());
    req.setOrderId(params.orderId.trim());
    req.setIdempotencyKey(params.idempotencyKey || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `replace-${Date.now()}`));
    req.setQuantity(params.quantity);
    if (params.price != null) req.setPrice(toQuotation(params.price));
    if (params.priceType != null) req.setPriceType(params.priceType);
    return ordersClient.replaceOrder(req);
  });
}

export async function getMaxLots(params: {
  accountId: string;
  instrumentId: string;
  price?: Quotation | number | string;
}, opts?: CacheOptions): Promise<GetMaxLotsResponse> {
  const key = `orders:maxLots:${params.accountId}:${params.instrumentId}`;
  return globalApiCache.read(key, async () => {
    const req = new GetMaxLotsRequest();
    req.setAccountId(params.accountId.trim());
    req.setInstrumentId(params.instrumentId.trim());
    if (params.price != null) req.setPrice(toQuotation(params.price));
    return ordersClient.getMaxLots(req);
  }, opts);
}

export async function getOrderPrice(params: {
  accountId: string;
  instrumentId: string;
  price: Quotation | number | string;
  quantity: number;
  direction: OrderDirection | number;
}, opts?: CacheOptions): Promise<GetOrderPriceResponse> {
  const key = `orders:price:${params.accountId}:${params.instrumentId}:${params.quantity}`;
  return globalApiCache.read(key, async () => {
    const req = new GetOrderPriceRequest();
    req.setAccountId(params.accountId.trim());
    req.setInstrumentId(params.instrumentId.trim());
    req.setPrice(toQuotation(params.price));
    req.setQuantity(params.quantity);
    req.setDirection(params.direction);
    return ordersClient.getOrderPrice(req);
  }, opts);
}

export async function callOrdersGrpc(
  method: OrdersGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (method) {
    case "GetOrders": {
      const res = await getOrders(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    case "GetOrderState": {
      const res = await getOrderState({
        accountId: str(request.account_id),
        orderId: str(request.order_id),
        priceType: num(request.price_type) || undefined,
        orderIdType: num(request.order_id_type) || undefined,
      }, { fresh: true });
      return toPlain(res);
    }
    case "PostOrder": {
      const res = await postOrder({
        accountId: str(request.account_id),
        instrumentId: str(request.instrument_id) || undefined,
        figi: str(request.figi) || undefined,
        quantity: num(request.quantity),
        price: request.price as Quotation | number | string,
        direction: num(request.direction),
        orderType: num(request.order_type),
        orderId: str(request.order_id) || undefined,
      });
      return toPlain(res);
    }
    case "PostOrderAsync": {
      const res = await postOrderAsync({
        accountId: str(request.account_id),
        instrumentId: str(request.instrument_id) || undefined,
        figi: str(request.figi) || undefined,
        quantity: num(request.quantity),
        price: request.price as Quotation | number | string,
        direction: num(request.direction),
        orderType: num(request.order_type),
        orderId: str(request.order_id) || undefined,
      });
      return toPlain(res);
    }
    case "CancelOrder": {
      const res = await cancelOrder({
        accountId: str(request.account_id),
        orderId: str(request.order_id),
        orderIdType: num(request.order_id_type) || undefined,
      });
      return toPlain(res);
    }
    case "ReplaceOrder": {
      const res = await replaceOrder({
        accountId: str(request.account_id),
        orderId: str(request.order_id),
        quantity: num(request.quantity),
        price: request.price as Quotation | number | string,
      });
      return toPlain(res);
    }
    case "GetMaxLots": {
      const res = await getMaxLots({
        accountId: str(request.account_id),
        instrumentId: str(request.instrument_id),
        price: request.price as Quotation | number | string,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetOrderPrice": {
      const res = await getOrderPrice({
        accountId: str(request.account_id),
        instrumentId: str(request.instrument_id),
        price: request.price as Quotation | number | string,
        quantity: num(request.quantity),
        direction: num(request.direction),
      }, { fresh: true });
      return toPlain(res);
    }
    default: {
      const exhaustiveCheck: never = method;
      throw new Error(`Неизвестный метод OrdersService: ${exhaustiveCheck}`);
    }
  }
}
