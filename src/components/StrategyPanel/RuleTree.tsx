// Рекурсивные редакторы дерева правил (BoolExpr) и операндов (Operand).
// Значения — того же вида, что уходит на сервер (см. specModel.ts).

import { InfoTip } from "./InfoTip";
import { ENUMS } from "./specSchema.generated";
import { enumLabel, fieldDesc, NODE_KIND_RU, OPERAND_KIND_RU } from "./specI18n";
import type { Json } from "./specModel";

const CMP = ENUMS.CompareOp;
const ARITH = ENUMS.ArithOp;
const PRICE = ENUMS.PriceField;

const MAX_TREE_DEPTH = 6;

// ---------------------------------------------------------------------------
// Operand
// ---------------------------------------------------------------------------
type OperandKind = "indicatorId" | "price" | "constant" | "arith";

function operandKind(op: Json): OperandKind {
  if (op.arith != null) return "arith";
  if (op.indicatorId != null) return "indicatorId";
  if (op.price != null) return "price";
  return "constant";
}

function defaultOperand(kind: OperandKind, firstIndicator: string): Json {
  switch (kind) {
    case "indicatorId":
      return { indicatorId: firstIndicator };
    case "price":
      return { price: "PRICE_CLOSE" };
    case "arith":
      return {
        arith: { left: { constant: 0 }, op: "ARITH_OP_ADD", right: { constant: 0 } },
      };
    default:
      return { constant: 0 };
  }
}

export function OperandEditor({
  value,
  onChange,
  indicatorIds,
  depth = 0,
}: {
  value: Json;
  onChange: (v: Json) => void;
  indicatorIds: string[];
  depth?: number;
}) {
  const kind = operandKind(value);
  const shift = typeof value.shift === "number" ? value.shift : 0;
  const setShift = (n: number) => {
    const next = { ...value };
    if (n > 0) next.shift = n;
    else delete next.shift;
    onChange(next);
  };

  return (
    <div className="rule-operand">
      <select
        value={kind}
        onChange={(e) => {
          const next = defaultOperand(e.target.value as OperandKind, indicatorIds[0] ?? "");
          if (shift > 0) next.shift = shift;
          onChange(next);
        }}
      >
        {(["indicatorId", "price", "constant", "arith"] as OperandKind[]).map((k) => (
          <option key={k} value={k}>
            {OPERAND_KIND_RU[k].name}
          </option>
        ))}
      </select>

      {kind === "indicatorId" ? (
        indicatorIds.length ? (
          <select
            value={String(value.indicatorId ?? "")}
            onChange={(e) => onChange({ ...value, indicatorId: e.target.value })}
          >
            {indicatorIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : (
          <span className="rule-hint">сначала добавьте индикатор</span>
        )
      ) : null}

      {kind === "price" ? (
        <select
          value={String(value.price ?? "PRICE_CLOSE")}
          onChange={(e) => onChange({ ...value, price: e.target.value })}
        >
          {PRICE.map((p) => (
            <option key={p.value} value={p.value}>
              {enumLabel("PriceField", p.value)}
            </option>
          ))}
        </select>
      ) : null}

      {kind === "constant" ? (
        <input
          type="number"
          step="any"
          value={Number(value.constant ?? 0)}
          onChange={(e) => onChange({ ...value, constant: Number(e.target.value) })}
        />
      ) : null}

      {kind === "arith" && depth < MAX_TREE_DEPTH ? (
        <div className="rule-arith">
          <OperandEditor
            value={(value.arith as Json).left as Json}
            onChange={(l) => onChange({ ...value, arith: { ...(value.arith as Json), left: l } })}
            indicatorIds={indicatorIds}
            depth={depth + 1}
          />
          <select
            value={String((value.arith as Json).op ?? "ARITH_OP_ADD")}
            onChange={(e) =>
              onChange({ ...value, arith: { ...(value.arith as Json), op: e.target.value } })
            }
          >
            {ARITH.map((a) => (
              <option key={a.value} value={a.value}>
                {enumLabel("ArithOp", a.value)}
              </option>
            ))}
          </select>
          <OperandEditor
            value={(value.arith as Json).right as Json}
            onChange={(r) => onChange({ ...value, arith: { ...(value.arith as Json), right: r } })}
            indicatorIds={indicatorIds}
            depth={depth + 1}
          />
        </div>
      ) : null}

      {kind !== "arith" ? (
        <label className="rule-shift">
          <span>
            сдвиг
            <InfoTip text={fieldDesc("operand.shift")} />
          </span>
          <input
            type="number"
            min={0}
            value={shift}
            onChange={(e) => setShift(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
        </label>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BoolExpr
// ---------------------------------------------------------------------------
type NodeKind = "compare" | "all" | "any" | "negate" | "literal";

function nodeKind(e: Json): NodeKind {
  if (e.all != null) return "all";
  if (e.any != null) return "any";
  if (e.negate != null) return "negate";
  if (e.literal != null) return "literal";
  return "compare";
}

function defaultNode(kind: NodeKind): Json {
  switch (kind) {
    case "all":
      return { all: { operands: [] } };
    case "any":
      return { any: { operands: [] } };
    case "negate":
      return { negate: defaultNode("compare") };
    case "literal":
      return { literal: true };
    default:
      return {
        compare: { left: { constant: 0 }, op: "COMPARE_OP_GT", right: { constant: 0 } },
      };
  }
}

export function RuleTree({
  value,
  onChange,
  indicatorIds,
  depth = 0,
}: {
  value: Json;
  onChange: (v: Json) => void;
  indicatorIds: string[];
  depth?: number;
}) {
  const kind = nodeKind(value);
  const isCross =
    kind === "compare" &&
    /CROSSES_(ABOVE|BELOW)/.test(String((value.compare as Json).op ?? ""));

  return (
    <div className="rule-node" data-depth={depth}>
      <div className="rule-node-head">
        <select value={kind} onChange={(e) => onChange(defaultNode(e.target.value as NodeKind))}>
          {(["compare", "all", "any", "negate", "literal"] as NodeKind[]).map((k) => (
            <option key={k} value={k}>
              {NODE_KIND_RU[k].name}
            </option>
          ))}
        </select>
        <InfoTip text={NODE_KIND_RU[kind].desc} />
      </div>

      {kind === "compare" ? (
        <div className="rule-compare">
          <OperandEditor
            value={(value.compare as Json).left as Json}
            onChange={(l) =>
              onChange({ compare: { ...(value.compare as Json), left: l } })
            }
            indicatorIds={indicatorIds}
          />
          <div className="rule-op">
            <select
              value={String((value.compare as Json).op ?? "COMPARE_OP_GT")}
              onChange={(e) =>
                onChange({ compare: { ...(value.compare as Json), op: e.target.value } })
              }
            >
              {CMP.map((c) => (
                <option key={c.value} value={c.value}>
                  {enumLabel("CompareOp", c.value)}
                </option>
              ))}
            </select>
            {isCross ? <InfoTip text={fieldDesc("crosses")} /> : null}
          </div>
          <OperandEditor
            value={(value.compare as Json).right as Json}
            onChange={(r) =>
              onChange({ compare: { ...(value.compare as Json), right: r } })
            }
            indicatorIds={indicatorIds}
          />
        </div>
      ) : null}

      {kind === "all" || kind === "any" ? (
        <RuleList
          value={value}
          kind={kind}
          onChange={onChange}
          indicatorIds={indicatorIds}
          depth={depth}
        />
      ) : null}

      {kind === "negate" ? (
        <div className="rule-negate">
          <RuleTree
            value={value.negate as Json}
            onChange={(n) => onChange({ negate: n })}
            indicatorIds={indicatorIds}
            depth={depth + 1}
          />
        </div>
      ) : null}

      {kind === "literal" ? (
        <label className="rule-literal">
          <select
            value={value.literal ? "true" : "false"}
            onChange={(e) => onChange({ literal: e.target.value === "true" })}
          >
            <option value="true">истина</option>
            <option value="false">ложь</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

function RuleList({
  value,
  kind,
  onChange,
  indicatorIds,
  depth,
}: {
  value: Json;
  kind: "all" | "any";
  onChange: (v: Json) => void;
  indicatorIds: string[];
  depth: number;
}) {
  const container = value[kind] as Json;
  const operands = (container.operands as Json[]) ?? [];
  const setOperands = (next: Json[]) => onChange({ [kind]: { operands: next } });

  return (
    <div className="rule-list">
      {operands.map((child, i) => (
        <div className="rule-list-item" key={i}>
          <RuleTree
            value={child}
            onChange={(c) => setOperands(operands.map((o, j) => (j === i ? c : o)))}
            indicatorIds={indicatorIds}
            depth={depth + 1}
          />
          <button
            type="button"
            className="btn ghost rule-del"
            onClick={() => setOperands(operands.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      {depth < MAX_TREE_DEPTH ? (
        <button
          type="button"
          className="btn ghost rule-add"
          onClick={() => setOperands([...operands, defaultNode("compare")])}
        >
          + условие
        </button>
      ) : (
        <span className="rule-hint">достигнута максимальная вложенность</span>
      )}
    </div>
  );
}
