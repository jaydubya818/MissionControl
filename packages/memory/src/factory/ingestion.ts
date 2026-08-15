import { createHash } from "node:crypto";
import type {
  FactoryEntity,
  FactoryMemoryChunk,
  FactoryMemoryDocument,
  FactoryMemorySourceType,
  FactoryRelationship,
  FactoryScope,
  MemoryProvenance,
} from "./types.js";
import {
  redactFactoryMemoryText,
  sanitizeFactoryMemoryValue,
} from "./security.js";
export function contentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
export function stableId(...parts: Array<string | number | undefined>): string {
  return createHash("sha256")
    .update(parts.filter((part) => part !== undefined).join("|"))
    .digest("hex")
    .slice(0, 24);
}
export function estimateTokens(content: string): number {
  return content.trim() ? Math.max(1, Math.ceil(content.length / 4)) : 0;
}
function normalizeSearchText(
  content: string,
  metadata?: Record<string, unknown>,
): string {
  const metadataText = metadata
    ? Object.values(metadata)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter(
          (value) => typeof value === "string" || typeof value === "number",
        )
        .join(" ")
    : "";
  return `${content}\n${metadataText}`
    .toLowerCase()
    .replace(/[^a-z0-9_./:@-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export interface BuildDocumentInput extends FactoryScope {
  id?: string;
  sourceType: FactoryMemorySourceType;
  sourceId: string;
  workOrderId?: string;
  attemptId?: string;
  factoryVersionId?: string;
  title?: string;
  content: string;
  path?: string;
  revision?: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
  indexedAt?: number;
}
export function buildFactoryMemoryDocument(input: BuildDocumentInput): {
  document: FactoryMemoryDocument;
  redactionCount: number;
} {
  const redacted = redactFactoryMemoryText(input.content);
  const sanitizedMetadata = sanitizeFactoryMemoryValue(input.metadata ?? {});
  const now = input.indexedAt ?? Date.now();
  const provenance: MemoryProvenance = {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    path: input.path,
    revision: input.revision,
    timestamp: input.createdAt ?? now,
    derivation: "authoritative",
  };
  const hash = contentHash(redacted.value);
  return {
    document: {
      id:
        input.id ??
        stableId(
          input.projectId,
          input.repositoryId,
          input.sourceType,
          input.sourceId,
          input.revision,
          hash,
        ),
      projectId: input.projectId,
      repositoryId: input.repositoryId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      workOrderId: input.workOrderId,
      attemptId: input.attemptId,
      factoryVersionId: input.factoryVersionId,
      title: input.title,
      content: redacted.value,
      metadata: sanitizedMetadata.value as Record<string, unknown>,
      contentHash: hash,
      sourceRevision: input.revision,
      createdAt: input.createdAt ?? now,
      indexedAt: now,
      provenance,
    },
    redactionCount: redacted.redactionCount + sanitizedMetadata.redactionCount,
  };
}
export interface ChunkOptions {
  maxCharacters?: number;
  overlapLines?: number;
  maxChunks?: number;
}
export function chunkFactoryMemoryDocument(
  document: FactoryMemoryDocument,
  options: ChunkOptions = {},
): FactoryMemoryChunk[] {
  const maxCharacters = Math.max(
    256,
    Math.min(8_000, options.maxCharacters ?? 1_600),
  );
  const overlapLines = Math.max(0, Math.min(10, options.overlapLines ?? 2));
  const maxChunks = Math.max(1, Math.min(500, options.maxChunks ?? 100));
  const lines = document.content.split("\n");
  const chunks: FactoryMemoryChunk[] = [];
  let start = 0;
  while (start < lines.length && chunks.length < maxChunks) {
    let end = start;
    let length = 0;
    while (end < lines.length) {
      const nextLength = length + lines[end].length + 1;
      if (end > start && nextLength > maxCharacters) break;
      length = nextLength;
      end += 1;
    }
    if (end === start) end += 1;
    const content = lines.slice(start, end).join("\n").trim();
    if (content) {
      const hash = contentHash(content);
      const provenance: MemoryProvenance = {
        ...document.provenance,
        parentDocumentId: document.id,
        lineStart: start + 1,
        lineEnd: end,
      };
      chunks.push({
        id: stableId(document.id, chunks.length, hash),
        documentId: document.id,
        projectId: document.projectId,
        repositoryId: document.repositoryId,
        sourceType: document.sourceType,
        sourceId: document.sourceId,
        workOrderId: document.workOrderId,
        attemptId: document.attemptId,
        factoryVersionId: document.factoryVersionId,
        title: document.title,
        content,
        searchText: normalizeSearchText(content, document.metadata),
        chunkIndex: chunks.length,
        estimatedTokens: estimateTokens(content),
        contentHash: hash,
        metadata: document.metadata,
        provenance,
      });
    }
    if (end >= lines.length) break;
    start = Math.max(start + 1, end - overlapLines);
  }
  return chunks;
}
export function shouldReindex(
  existing:
    | Pick<
        FactoryMemoryDocument,
        "contentHash" | "sourceRevision" | "invalidatedAt"
      >
    | null
    | undefined,
  incoming: Pick<FactoryMemoryDocument, "contentHash" | "sourceRevision">,
): boolean {
  return (
    !existing ||
    Boolean(existing.invalidatedAt) ||
    existing.contentHash !== incoming.contentHash ||
    existing.sourceRevision !== incoming.sourceRevision
  );
}
export interface TypeScriptCodeFacts {
  imports: string[];
  symbols: string[];
  references: string[];
  language: "typescript" | "javascript";
}
export function extractTypeScriptCodeFacts(
  path: string,
  content: string,
): TypeScriptCodeFacts {
  const imports = [
    ...content.matchAll(
      /(?:import[\s\S]*?from\s*|require\s*\()\s*["']([^"']+)["']/g,
    ),
  ].map((match) => match[1]);
  const symbols = [
    ...content.matchAll(
      /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    ),
  ].map((match) => match[1]);
  const references = [...content.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => match[1])
    .filter(
      (symbol) => !["if", "for", "while", "switch", "catch"].includes(symbol),
    );
  return {
    imports: [...new Set(imports)].slice(0, 200),
    symbols: [...new Set(symbols)].slice(0, 500),
    references: [...new Set(references)].slice(0, 500),
    language: /\.[cm]?tsx?$/.test(path) ? "typescript" : "javascript",
  };
}
export function buildCodeGraphProjection(input: {
  scope: FactoryScope;
  repositoryEntity: FactoryEntity;
  path: string;
  content: string;
  revision: string;
  timestamp: number;
}): { entities: FactoryEntity[]; relationships: FactoryRelationship[] } {
  const { scope, repositoryEntity, path, content, revision, timestamp } = input;
  const provenance: MemoryProvenance = {
    sourceType: "source-code",
    sourceId: path,
    path,
    revision,
    timestamp,
    derivation: "deterministic",
  };
  const fileId = stableId(scope.projectId, scope.repositoryId, "file", path);
  const fileEntity: FactoryEntity = {
    ...scope,
    id: fileId,
    type: "file",
    key: `file:${path}`,
    label: path,
    aliases: [path.split("/").at(-1) ?? path],
    metadata: { path },
    provenance: [provenance],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const facts = extractTypeScriptCodeFacts(path, content);
  const entities: FactoryEntity[] = [fileEntity];
  const relationships: FactoryRelationship[] = [
    {
      ...scope,
      id: stableId(repositoryEntity.id, "contains", fileId),
      sourceType: "repository",
      sourceId: repositoryEntity.id,
      relation: "contains",
      targetType: "file",
      targetId: fileId,
      provenance: [provenance],
      derivation: "deterministic",
      createdAt: timestamp,
    },
  ];
  for (const symbol of facts.symbols) {
    const symbolId = stableId(
      scope.projectId,
      scope.repositoryId,
      "symbol",
      path,
      symbol,
    );
    entities.push({
      ...scope,
      id: symbolId,
      type: "symbol",
      key: `symbol:${path}#${symbol}`,
      label: symbol,
      aliases: [],
      metadata: { path, language: facts.language },
      provenance: [provenance],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    relationships.push({
      ...scope,
      id: stableId(fileId, "defines", symbolId),
      sourceType: "file",
      sourceId: fileId,
      relation: "defines",
      targetType: "symbol",
      targetId: symbolId,
      provenance: [provenance],
      derivation: "deterministic",
      createdAt: timestamp,
    });
  }
  for (const importedPath of facts.imports) {
    const moduleId = stableId(
      scope.projectId,
      scope.repositoryId,
      "module",
      importedPath,
    );
    entities.push({
      ...scope,
      id: moduleId,
      type: "module",
      key: `module:${importedPath}`,
      label: importedPath,
      aliases: [],
      provenance: [provenance],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    relationships.push({
      ...scope,
      id: stableId(fileId, "imports", moduleId),
      sourceType: "file",
      sourceId: fileId,
      relation: "imports",
      targetType: "module",
      targetId: moduleId,
      provenance: [provenance],
      derivation: "deterministic",
      createdAt: timestamp,
    });
  }
  return { entities, relationships };
}
