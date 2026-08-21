import { SandboxServiceClient } from "@marleena/trb-proto/tinvest/SandboxServiceClientPb";
import {
  CloseSandboxAccountRequest,
  OpenSandboxAccountRequest,
  SandboxPayInRequest,
  type CloseSandboxAccountResponse,
  type OpenSandboxAccountResponse,
  type SandboxPayInResponse,
} from "@marleena/trb-proto/tinvest/sandbox_pb";
import {
  GetAccountsRequest,
  AccountStatus,
  type GetAccountsResponse,
} from "@marleena/trb-proto/tinvest/users_pb";
import {
  CancelOrderRequest,
  GetMaxLotsRequest,
  GetOrderStateRequest,
  GetOrdersRequest,
  OrderDirection,
  OrderType,
  PostOrderAsyncRequest,
  PostOrderRequest,
  ReplaceOrderRequest,
  type CancelOrderResponse,
  type GetOrdersResponse,
  type OrderState,
  type PostOrderResponse,
} from "@marleena/trb-proto/tinvest/orders_pb";
import {
  OperationsRequest,
  PortfolioRequest,
  PositionsRequest,
  WithdrawLimitsRequest,
  type OperationsResponse,
  type PortfolioResponse,
  type PositionsResponse,
  type WithdrawLimitsResponse,
} from "@marleena/trb-proto/tinvest/operations_pb";
import {
  GetStopOrdersRequest,
  type GetStopOrdersResponse,
} from "@marleena/trb-proto/tinvest/stoporders_pb";
import { MoneyValue, type Quotation } from "@marleena/trb-proto/tinvest/common_pb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache, type CacheOptions } from "../common/cache";
import { toPlain, toQuotation, toMoneyValue, parseTimestamp, str, num } from "../common/converters";
import { toAccountStatus } from "./users";

export const sandboxClient = new SandboxServiceClient(getGrpcBaseUrl());

export const SANDBOX_GRPC_METHODS = [
  { value: "OpenSandboxAccount", label: "OpenSandboxAccount", write: true },
  { value: "GetSandboxAccounts", label: "GetSandboxAccounts", write: false },
  { value: "CloseSandboxAccount", label: "CloseSandboxAccount", write: true },
  { value: "PostSandboxOrder", label: "PostSandboxOrder", write: true },
  { value: "PostSandboxOrderAsync", label: "PostSandboxOrderAsync", write: true },
  { value: "ReplaceSandboxOrder", label: "ReplaceSandboxOrder", write: true },
  { value: "GetSandboxOrders", label: "GetSandboxOrders", write: false },
  { value: "CancelSandboxOrder", label: "CancelSandboxOrder", write: true },
  { value: "GetSandboxOrderState", label: "GetSandboxOrderState", write: false },
  { value: "GetSandboxPositions", label: "GetSandboxPositions", write: false },
  { value: "GetSandboxOperations", label: "GetSandboxOperations", write: false },
  { value: "GetSandboxPortfolio", label: "GetSandboxPortfolio", write: false },
  { value: "SandboxPayIn", label: "SandboxPayIn", write: true },
  { value: "GetSandboxWithdrawLimits", label: "GetSandboxWithdrawLimits", write: false },
  { value: "GetSandboxMaxLots", label: "GetSandboxMaxLots", write: false },
  { value: "GetSandboxStopOrders", label: "GetSandboxStopOrders", write: false },
] as const;

export type SandboxGrpcMethod = (typeof SANDBOX_GRPC_METHODS)[number]["value"];

export async function openSandboxAccount(name?: string): Promise<OpenSandboxAccountResponse> {
  return globalApiCache.write(async () => {
    const req = new OpenSandboxAccountRequest();
    if (name) req.setName(name);
    return sandboxClient.openSandboxAccount(req);
  });
}

export async function getSandboxAccounts(status?: AccountStatus | string | number, opts?: CacheOptions): Promise<GetAccountsResponse> {
  const statusEnum = status != null ? toAccountStatus(status) : AccountStatus.ACCOUNT_STATUS_ALL;
  return globalApiCache.read(`sandbox:accounts:${statusEnum}`, async () => {
    const req = new GetAccountsRequest();
    if (status != null) req.setStatus(statusEnum);
    return sandboxClient.getSandboxAccounts(req);
  }, opts);
}

export async function closeSandboxAccount(accountId: string): Promise<CloseSandboxAccountResponse> {
  return globalApiCache.write(async () => {
    const req = new CloseSandboxAccountRequest();
    req.setAccountId(accountId.trim());
    return sandboxClient.closeSandboxAccount(req);
  });
}

export async function postSandboxOrder(params: {
  accountId: string;
  instrumentId?: string;
  figi?: string;
  quantity: number;
  price?: Quotation | number | string;
  direction: OrderDirection | number;
  orderType: OrderType | number;
  orderId?: string;
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
    req.setOrderId(params.orderId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `sb-ord-${Date.now()}`));
    return sandboxClient.postSandboxOrder(req);
  });
}

export async function getSandboxOrders(accountId: string, opts?: CacheOptions): Promise<GetOrdersResponse> {
  return globalApiCache.read(`sandbox:orders:${accountId}`, async () => {
    const req = new GetOrdersRequest();
    req.setAccountId(accountId.trim());
    return sandboxClient.getSandboxOrders(req);
  }, opts);
}

export async function cancelSandboxOrder(accountId: string, orderId: string): Promise<CancelOrderResponse> {
  return globalApiCache.write(async () => {
    const req = new CancelOrderRequest();
    req.setAccountId(accountId.trim());
    req.setOrderId(orderId.trim());
    return sandboxClient.cancelSandboxOrder(req);
  });
}

export async function getSandboxOrderState(accountId: string, orderId: string, opts?: CacheOptions): Promise<OrderState> {
  return globalApiCache.read(`sandbox:orderState:${accountId}:${orderId}`, async () => {
    const req = new GetOrderStateRequest();
    req.setAccountId(accountId.trim());
    req.setOrderId(orderId.trim());
    return sandboxClient.getSandboxOrderState(req);
  }, opts);
}

export async function getSandboxPositions(accountId: string, opts?: CacheOptions): Promise<PositionsResponse> {
  return globalApiCache.read(`sandbox:positions:${accountId}`, async () => {
    const req = new PositionsRequest();
    req.setAccountId(accountId.trim());
    return sandboxClient.getSandboxPositions(req);
  }, opts);
}

export async function getSandboxOperations(params: {
  accountId: string;
  from?: Date | string;
  to?: Date | string;
}, opts?: CacheOptions): Promise<OperationsResponse> {
  return globalApiCache.read(`sandbox:operations:${params.accountId}`, async () => {
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
    return sandboxClient.getSandboxOperations(req);
  }, opts);
}

export async function getSandboxPortfolio(accountId: string, opts?: CacheOptions): Promise<PortfolioResponse> {
  return globalApiCache.read(`sandbox:portfolio:${accountId}`, async () => {
    const req = new PortfolioRequest();
    req.setAccountId(accountId.trim());
    return sandboxClient.getSandboxPortfolio(req);
  }, opts);
}

export async function sandboxPayIn(params: {
  accountId: string;
  amount: MoneyValue | number | string;
}): Promise<SandboxPayInResponse> {
  return globalApiCache.write(async () => {
    const req = new SandboxPayInRequest();
    req.setAccountId(params.accountId.trim());
    req.setAmount(toMoneyValue(params.amount));
    return sandboxClient.sandboxPayIn(req);
  });
}

export async function getSandboxWithdrawLimits(accountId: string, opts?: CacheOptions): Promise<WithdrawLimitsResponse> {
  return globalApiCache.read(`sandbox:withdrawLimits:${accountId}`, async () => {
    const req = new WithdrawLimitsRequest();
    req.setAccountId(accountId.trim());
    return sandboxClient.getSandboxWithdrawLimits(req);
  }, opts);
}

export async function getSandboxStopOrders(accountId: string, opts?: CacheOptions): Promise<GetStopOrdersResponse> {
  return globalApiCache.read(`sandbox:stopOrders:${accountId}`, async () => {
    const req = new GetStopOrdersRequest();
    req.setAccountId(accountId.trim());
    return sandboxClient.getSandboxStopOrders(req);
  }, opts);
}

export async function callSandboxGrpc(
  method: SandboxGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (method) {
    case "OpenSandboxAccount": {
      const res = await openSandboxAccount(str(request.name) || undefined);
      return toPlain(res);
    }
    case "GetSandboxAccounts": {
      const res = await getSandboxAccounts(request.status as AccountStatus | string | number, { fresh: true });
      return toPlain(res);
    }
    case "CloseSandboxAccount": {
      const res = await closeSandboxAccount(str(request.account_id));
      return toPlain(res);
    }
    case "PostSandboxOrder": {
      const res = await postSandboxOrder({
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
    case "PostSandboxOrderAsync": {
      const res = await globalApiCache.write(async () => {
        const req = new PostOrderAsyncRequest();
        req.setAccountId(str(request.account_id));
        const id = str(request.instrument_id) || str(request.figi);
        if (id) req.setInstrumentId(id);
        req.setQuantity(num(request.quantity));
        if (request.price != null) req.setPrice(toQuotation(request.price));
        req.setDirection(num(request.direction));
        req.setOrderType(num(request.order_type));
        return sandboxClient.postSandboxOrderAsync(req);
      });
      return toPlain(res);
    }
    case "ReplaceSandboxOrder": {
      const res = await globalApiCache.write(async () => {
        const req = new ReplaceOrderRequest();
        req.setAccountId(str(request.account_id));
        req.setOrderId(str(request.order_id));
        req.setQuantity(num(request.quantity));
        if (request.price != null) req.setPrice(toQuotation(request.price));
        return sandboxClient.replaceSandboxOrder(req);
      });
      return toPlain(res);
    }
    case "GetSandboxOrders": {
      const res = await getSandboxOrders(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    case "CancelSandboxOrder": {
      const res = await cancelSandboxOrder(str(request.account_id), str(request.order_id));
      return toPlain(res);
    }
    case "GetSandboxOrderState": {
      const res = await getSandboxOrderState(str(request.account_id), str(request.order_id), { fresh: true });
      return toPlain(res);
    }
    case "GetSandboxPositions": {
      const res = await getSandboxPositions(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    case "GetSandboxOperations": {
      const res = await getSandboxOperations({
        accountId: str(request.account_id),
        from: request.from as string,
        to: request.to as string,
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetSandboxPortfolio": {
      const res = await getSandboxPortfolio(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    case "SandboxPayIn": {
      const res = await sandboxPayIn({
        accountId: str(request.account_id),
        amount: request.amount as MoneyValue,
      });
      return toPlain(res);
    }
    case "GetSandboxWithdrawLimits": {
      const res = await getSandboxWithdrawLimits(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    case "GetSandboxMaxLots": {
      const res = await globalApiCache.read(`sandbox:maxLots:${str(request.account_id)}:${str(request.instrument_id)}`, async () => {
        const req = new GetMaxLotsRequest();
        req.setAccountId(str(request.account_id));
        req.setInstrumentId(str(request.instrument_id));
        return sandboxClient.getSandboxMaxLots(req);
      }, { fresh: true });
      return toPlain(res);
    }
    case "GetSandboxStopOrders": {
      const res = await getSandboxStopOrders(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    default: {
      const exhaustiveCheck: never = method;
      throw new Error(`Неизвестный метод SandboxService: ${exhaustiveCheck}`);
    }
  }
}
