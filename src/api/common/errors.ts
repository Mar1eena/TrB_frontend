import { RpcError, StatusCode } from "grpc-web";

export class TinvestRpcError extends Error {
  code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = "TinvestRpcError";
    this.code = code;
  }
}

export function wrapRpcError(err: unknown): Error {
  if (err instanceof RpcError) {
    const message = err.message || `gRPC Error (${err.code})`;
    return new TinvestRpcError(message, err.code);
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error(String(err));
}

export function isAbsentMessage(err: unknown): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === StatusCode.NOT_FOUND
  ) {
    return true;
  }
  const text = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    text.includes("404") ||
    text.includes("not found") ||
    text.includes("no message") ||
    text.includes("deleted")
  );
}
