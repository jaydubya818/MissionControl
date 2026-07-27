import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface FileTreeNode {
  name: string;
  path: string;
  kind: "file" | "folder";
  children?: FileTreeNode[];
}

function defaultFileTree(skillPath: string): FileTreeNode[] {
  const skillFile = skillPath.split("/").pop() ?? "SKILL.md";
  const skillDir = skillPath.includes("/") ? skillPath.replace(/\/[^/]+$/, "") : "skills";
  return [
    {
      name: "docs",
      path: "docs",
      kind: "folder",
      children: [
        { name: "authoring.md", path: "docs/authoring.md", kind: "file" },
        { name: "index.md", path: "docs/index.md", kind: "file" },
        { name: "migration.md", path: "docs/migration.md", kind: "file" },
      ],
    },
    { name: "evals", path: "evals", kind: "folder", children: [] },
    { name: "rules", path: "rules", kind: "folder", children: [] },
    {
      name: skillDir.split("/").pop() ?? "skills",
      path: skillDir,
      kind: "folder",
      children: [{ name: skillFile, path: skillPath, kind: "file" }],
    },
    { name: "tile.json", path: "tile.json", kind: "file" },
  ];
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(depth === 0);
  const isFolder = node.kind === "folder";
  const selected = node.path === selectedPath;

  if (isFolder) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="registry-file-row"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Folder size={13} className="text-ink-muted" aria-hidden />
          <span>{node.name}</span>
        </button>
        {open
          ? node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))
          : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={cn("registry-file-row", selected && "registry-file-row-active")}
      style={{ paddingLeft: 24 + depth * 12 }}
    >
      <File size={13} className="text-ink-muted" aria-hidden />
      <span>{node.name}</span>
    </button>
  );
}

export interface RegistryFileBrowserProps {
  skillPath: string;
  selectedPath: string;
  onSelect: (path: string) => void;
  tree?: FileTreeNode[];
}

/** Sidebar file tree (Tessl Files tab). */
export function RegistryFileBrowser({
  skillPath,
  selectedPath,
  onSelect,
  tree,
}: RegistryFileBrowserProps): JSX.Element {
  const nodes = tree ?? defaultFileTree(skillPath);

  return (
    <div className="registry-file-browser rounded-xl border border-line bg-surface-1 p-2">
      <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Files
      </div>
      <div className="mt-1">
        {nodes.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
