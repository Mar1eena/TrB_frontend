import { useState, type CSSProperties } from "react";
import type { ServiceNode } from "../../data/services";

type ServiceTreeProps = {
  nodes: ServiceNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type TreeNodeProps = {
  node: ServiceNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function TreeNode({ node, depth, selectedId, onSelect }: TreeNodeProps) {
  const hasChildren = Boolean(node.children?.length);
  const isGroup = node.kind === "group" || hasChildren;
  const [open, setOpen] = useState(true);
  const selected = selectedId === node.id;

  return (
    <li className="tree-node" style={{ "--depth": depth } as CSSProperties}>
      <div className={`tree-row${selected && !isGroup ? " is-selected" : ""}`}>
        {isGroup ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={open}
            aria-label={open ? "Свернуть" : "Развернуть"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="tree-toggle-spacer" aria-hidden="true" />
        )}

        <button
          type="button"
          className={`tree-label${isGroup ? " is-group" : ""}`}
          onClick={() => {
            if (isGroup) {
              setOpen((value) => !value);
              return;
            }
            onSelect(node.id);
          }}
        >
          {node.label}
        </button>
      </div>

      {hasChildren && open ? (
        <ul className="tree-children">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function ServiceTree({
  nodes,
  selectedId,
  onSelect,
}: ServiceTreeProps) {
  return (
    <nav className="service-tree" aria-label="Микросервисы">
      <ul className="tree-root">
        {nodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </nav>
  );
}
