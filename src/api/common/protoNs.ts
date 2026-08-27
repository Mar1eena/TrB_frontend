type PbNs = Record<string, unknown>;

function asPbNs(value: unknown): PbNs | null {
  if (!value || typeof value !== "object") return null;
  return value as PbNs;
}

type MsgCtor = (new () => object) & { prototype: object };

function isMsgCtor(value: unknown): value is MsgCtor {
  return typeof value === "function" && typeof (value as MsgCtor).prototype === "object";
}

export function pickMessageCtor(
  candidates: unknown[],
  requiredMethods: string[] = [],
): MsgCtor | undefined {
  const ctors = candidates.filter(isMsgCtor);
  const withMethods = ctors.find((Ctor) =>
    requiredMethods.every((name) => typeof (Ctor.prototype as Record<string, unknown>)[name] === "function"),
  );
  return withMethods ?? ctors[0];
}

/**
 * google-protobuf CJS builds expose constructors as named ESM bindings,
 * on `default`, or via goog.exportSymbol on globalThis.
 * Prefer the ES module over globalThis: the global namespace stays stale after proto regen.
 */
export function resolveProtoNs<T extends object>(
  module: T & { default?: unknown },
  fromGlobal: unknown,
  requiredCtors: string[],
): T {
  const candidates = [asPbNs(module), asPbNs(module.default), asPbNs(fromGlobal)].filter(
    Boolean,
  ) as PbNs[];

  for (const ns of candidates) {
    if (requiredCtors.every((name) => typeof ns[name] === "function")) {
      return ns as unknown as T;
    }
  }
  return module;
}
