import type { ClientReadableStream, RpcError, Status } from "grpc-web";
import { OperationsStreamServiceClient } from "@marleena/trb-proto/tinvest/OperationsServiceClientPb";
import {
  OperationsStreamRequest,
  PortfolioStreamRequest,
  PositionsStreamRequest,
  type OperationsStreamResponse,
  type PortfolioStreamResponse,
  type PositionsStreamResponse,
} from "@marleena/trb-proto/tinvest/operations_pb";
import { getGrpcBaseUrl } from "../common/client";
import { wrapRpcError } from "../common/errors";
import type { StreamSubscription, StreamSubscriptionCallbacks } from "./marketdataStream";

export const operationsStreamClient = new OperationsStreamServiceClient(getGrpcBaseUrl());

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

export function subscribePortfolioStream(
  accounts: string[],
  callbacks: StreamSubscriptionCallbacks<PortfolioStreamResponse>,
): StreamSubscription {
  const req = new PortfolioStreamRequest();
  req.setAccountsList(accounts.filter(Boolean));
  const stream = operationsStreamClient.portfolioStream(req);
  return attachCallbacks(stream, callbacks);
}

export function subscribePositionsStream(
  accounts: string[],
  callbacks: StreamSubscriptionCallbacks<PositionsStreamResponse>,
): StreamSubscription {
  const req = new PositionsStreamRequest();
  req.setAccountsList(accounts.filter(Boolean));
  const stream = operationsStreamClient.positionsStream(req);
  return attachCallbacks(stream, callbacks);
}

export function subscribeOperationsStream(
  accounts: string[],
  callbacks: StreamSubscriptionCallbacks<OperationsStreamResponse>,
): StreamSubscription {
  const req = new OperationsStreamRequest();
  req.setAccountsList(accounts.filter(Boolean));
  const stream = operationsStreamClient.operationsStream(req);
  return attachCallbacks(stream, callbacks);
}
