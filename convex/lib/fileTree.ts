export interface FileTreeNode {
  name: string;
  path: string;
  kind: "file" | "folder";
  children?: FileTreeNode[];
}

export function buildFileTreeFromPaths(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const filePath of paths.sort()) {
    const parts = filePath.split("/").filter(Boolean);
    let level = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;
      const existing = level.find((n) => n.name === part);

      if (existing) {
        if (isFile && existing.kind === "folder") {
          existing.kind = "file";
        }
        if (!isFile && existing.kind === "file") {
          existing.kind = "folder";
          existing.children = existing.children ?? [];
        }
        level = existing.children ?? (existing.children = []);
        continue;
      }

      const node: FileTreeNode = {
        name: part,
        path: currentPath,
        kind: isFile ? "file" : "folder",
        children: isFile ? undefined : [],
      };
      level.push(node);
      level = node.children ?? [];
    }
  }

  return root;
}

export function skillDirectoryPrefix(sourcePath?: string): string {
  if (!sourcePath) return "";
  const idx = sourcePath.lastIndexOf("/");
  return idx >= 0 ? sourcePath.slice(0, idx) : "";
}
