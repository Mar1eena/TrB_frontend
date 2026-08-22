type PbNs = Record<string, unknown>;

function asPbNs(value: unknown): PbNs | null {
  if (!value || typeof value !== "object") return null;
  return value as PbNs;
}

/**
 * google-protobuf CJS builds expose constructors as named ESM bindings,
 * on `default`, or via goog.exportSymbol on globalThis.
 */
export function resolveProtoNs<T extends object>(
  module: T & { default?: unknown },
  fromGlobal: unknown,
  requiredCtors: string[],
): T {
  const candidates = [asPbNs(module.default), asPbNs(module), asPbNs(fromGlobal)].filter(
    Boolean,
  ) as PbNs[];

  for (const ns of candidates) {
    if (requiredCtors.every((name) => typeof ns[name] === "function")) {
      return ns as unknown as T;
    }
  }
  for (const ns of candidates) {
    if (requiredCtors.some((name) => typeof ns[name] === "function")) {
      return ns as unknown as T;
    }
  }
  return module;
}
