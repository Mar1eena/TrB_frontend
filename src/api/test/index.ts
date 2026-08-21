import { testClient, testPb } from "./client";

export * from "./client";

function grpcError(err: unknown, fallback: string): Error {
  if (err instanceof Error && err.message) {
    return new Error(err.message);
  }
  return new Error(fallback);
}

export async function syncInstruments() {
  try {
    const resp = await testClient.syncInstruments(new testPb.SyncInstrumentsRequest());
    const upsert = resp.getUpsert();
    return {
      fetched: upsert?.getFetched() ?? 0,
      inserted: upsert?.getInserted() ?? 0,
      updated: upsert?.getUpdated() ?? 0,
      unchanged: upsert?.getUnchanged() ?? 0,
    };
  } catch (err) {
    throw grpcError(err, "Не удалось синхронизировать инструменты");
  }
}
