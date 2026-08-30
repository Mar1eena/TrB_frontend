type PbNs = Record<string, unknown>;

function asPbNs(value: unknown): PbNs | null {
  if (!value || typeof value !== "object") return null;
  return value as PbNs;
}

type MsgCtor = (new () => object) & { prototype: object };

function isMsgCtor(value: unknown): value is MsgCtor {
  return (
    typeof value === "function" &&
    typeof (value as MsgCtor).prototype === "object" &&
    (value as MsgCtor).prototype !== null
  );
}

/** Vite CJS interop: constructors live on the module, `.default`, or nested `.default.default`. */
export function pbModuleLayers(module: unknown): PbNs[] {
  const layers: PbNs[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = module;
  for (let i = 0; i < 4 && cur && typeof cur === "object" && !seen.has(cur); i++) {
    seen.add(cur);
    layers.push(cur as PbNs);
    cur = (cur as { default?: unknown }).default;
  }
  return layers;
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

export function pickPbCtor(
  module: unknown,
  fromGlobal: unknown,
  name: string,
  requiredMethods: string[] = [],
): MsgCtor | undefined {
  const globalNs = asPbNs(fromGlobal);
  return pickMessageCtor(
    [...pbModuleLayers(module).map((ns) => ns[name]), globalNs?.[name]],
    requiredMethods,
  );
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
  const candidates = [...pbModuleLayers(module), asPbNs(fromGlobal)].filter(Boolean) as PbNs[];

  for (const ns of candidates) {
    if (requiredCtors.every((name) => typeof ns[name] === "function")) {
      return ns as unknown as T;
    }
  }
  return module;
}
