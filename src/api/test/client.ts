import { TestClient } from "@marleena/trb-proto/test/TestServiceClientPb";
import * as testPbModule from "@marleena/trb-proto/test/test_pb";
import { getGrpcBaseUrl } from "../common/client";
import { resolveProtoNs } from "../common/protoNs";

export function testProto(): typeof testPbModule {
  const fromGlobal = (globalThis as { proto?: { trb?: { test?: { v1?: unknown } } } }).proto?.trb
    ?.test?.v1;
  return resolveProtoNs(testPbModule, fromGlobal, ["SyncInstrumentsRequest"]);
}

export const testPb = testProto();
export const testClient = new TestClient(getGrpcBaseUrl());
