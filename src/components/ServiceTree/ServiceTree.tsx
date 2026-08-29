import { useState, type CSSProperties } from "react";
import type { ServiceNode } from "../../data/services";
import { ServiceIcon } from "./ServiceIcons";

type ServiceTreeProps = {
  nodes: ServiceNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed?: boolean;
};

type TreeNodeProps = {
  node: ServiceNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed: boolean;
};

function TreeNode({ node, depth, selectedId, onSelect, collapsed }: TreeNodeProps) {
  const hasChildren = Boolean(node.children?.length);
  const isGroup = node.kind === "group" || hasChildren;
  const [open, setOpen] = useState(true);
  const selected = selectedId === node.id;
  const showChildren = hasChildren && (collapsed || open);

  return (
    <li
      className={`tree-node${isGroup ? " is-group-node" : ""}`}
      style={{ "--depth": collapsed ? 0 : depth } as CSSProperties}
    >
      <div className={`tree-row${selected && !isGroup ? " is-selected" : ""}`}>
        {!collapsed && isGroup ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={open}
            aria-label={open ? "Свернуть" : "Развернуть"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : !collapsed ? (
          <span className="tree-toggle-spacer" aria-hidden="true" />
        ) : null}

        <button
          type="button"
          className={`tree-label${isGroup ? " is-group" : ""}`}
          title={node.label}
          onClick={() => {
            if (isGroup) {
              if (!collapsed) setOpen((value) => !value);
              return;
            }
            onSelect(node.id);
          }}
        >
          <ServiceIcon id={node.id} className="tree-icon" />
          {!collapsed ? <span className="tree-label-text">{node.label}</span> : null}
        </button>
      </div>

      {showChildren ? (
        <ul className="tree-children">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              collapsed={collapsed}
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
  collapsed = false,
}: ServiceTreeProps) {
  return (
    <nav className={`service-tree${collapsed ? " is-collapsed" : ""}`} aria-label="Микросервисы">
      <ul className="tree-root">
        {nodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            collapsed={collapsed}
          />
        ))}
      </ul>
    </nav>
  );
}
