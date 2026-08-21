import type { ClientReadableStream, RpcError, Status } from "grpc-web";
import { MarketDataStreamServiceClient } from "@marleena/trb-proto/tinvest/MarketdataServiceClientPb";
import {
  MarketDataServerSideStreamRequest,
  type MarketDataResponse,
} from "@marleena/trb-proto/tinvest/marketdata_pb";
import { getGrpcBaseUrl } from "../common/client";
import { wrapRpcError } from "../common/errors";

export const marketDataStreamClient = new MarketDataStreamServiceClient(getGrpcBaseUrl());

export type StreamSubscriptionCallbacks<T> = {
  onData?: (data: T) => void;
  onError?: (err: Error) => void;
  onEnd?: () => void;
  onStatus?: (status: Status) => void;
};

export type StreamSubscription = {
  cancel: () => void;
};

export function subscribeMarketDataServerSideStream(
  req: MarketDataServerSideStreamRequest,
  callbacks: StreamSubscriptionCallbacks<MarketDataResponse>,
): StreamSubscription {
  const stream: ClientReadableStream<MarketDataResponse> = marketDataStreamClient.marketDataServerSideStream(req);

  if (callbacks.onData) {
    stream.on("data", (response: MarketDataResponse) => {
      callbacks.onData?.(response);
    });
  }

  if (callbacks.onError) {
    stream.on("error", (err: RpcError) => {
      callbacks.onError?.(wrapRpcError(err));
    });
  }

  if (callbacks.onEnd) {
    stream.on("end", () => {
      callbacks.onEnd?.();
    });
  }

  if (callbacks.onStatus) {
    stream.on("status", (status: Status) => {
      callbacks.onStatus?.(status);
    });
  }

  return {
    cancel: () => {
      stream.cancel();
    },
  };
}
