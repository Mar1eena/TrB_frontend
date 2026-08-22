import type { ClientReadableStream, RpcError, Status } from "grpc-web";
import { OrdersStreamServiceClient } from "@marleena/trb-proto/api/tinvest/OrdersServiceClientPb";
import {
  OrderStateStreamRequest,
  TradesStreamRequest,
  type OrderStateStreamResponse,
  type TradesStreamResponse,
} from "@marleena/trb-proto/api/tinvest/orders_pb";
import { getGrpcBaseUrl } from "../common/client";
import { wrapRpcError } from "../common/errors";
import type { StreamSubscription, StreamSubscriptionCallbacks } from "./marketdataStream";

export const ordersStreamClient = new OrdersStreamServiceClient(getGrpcBaseUrl());

function attachCallbacks<T>(
  stream: ClientReadableStream<T>,
  callbacks: StreamSubscriptionCallbacks<T>,
): StreamSubscription {
  if (callbacks.onData) {
    stream.on("data", (data: T) => callbacks.onData?.(data));
  }
  if (callbacks.onError) {
    stream.on("error", (err: RpcError) => callbacks.onError?.(wrapRpcError(err)));
  }
  if (callbacks.onEnd) {
    stream.on("end", () => callbacks.onEnd?.());
  }
  if (callbacks.onStatus) {
    stream.on("status", (status: Status) => callbacks.onStatus?.(status));
  }
  return {
    cancel: () => stream.cancel(),
  };
}

export function subscribeTradesStream(
  accounts: string[],
  callbacks: StreamSubscriptionCallbacks<TradesStreamResponse>,
): StreamSubscription {
  const req = new TradesStreamRequest();
  req.setAccountsList(accounts.filter(Boolean));
  const stream = ordersStreamClient.tradesStream(req);
  return attachCallbacks(stream, callbacks);
}

export function subscribeOrderStateStream(
  accounts: string[],
  callbacks: StreamSubscriptionCallbacks<OrderStateStreamResponse>,
): StreamSubscription {
  const req = new OrderStateStreamRequest();
  req.setAccountsList(accounts.filter(Boolean));
  const stream = ordersStreamClient.orderStateStream(req);
  return attachCallbacks(stream, callbacks);
}
