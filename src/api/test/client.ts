import { TestClient } from "@marleena/trb-proto/api/test/TestServiceClientPb";
import * as testPbModule from "@marleena/trb-proto/api/test/test_pb";
import { getGrpcBaseUrl } from "../common/client";

export function testProto(): typeof testPbModule {
  const rec = testPbModule as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  if (typeof rec.SyncInstrumentsRequest === "function") return testPbModule;
  if (rec.default && typeof rec.default.SyncInstrumentsRequest === "function") {
    return rec.default as unknown as typeof testPbModule;
  }
  const fromGlobal = (
    globalThis as {
      proto?: {
        trb?: { test?: { public?: { contract?: { v1?: typeof testPbModule } } } };
      };
    }
  ).proto?.trb?.test?.public?.contract?.v1;
  if (fromGlobal && typeof fromGlobal.SyncInstrumentsRequest === "function") return fromGlobal;
  return testPbModule;
}

export const testPb = testProto();
export const testClient = new TestClient(getGrpcBaseUrl());
