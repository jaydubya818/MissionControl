import {
  redactFactoryMemoryText,
  sanitizeFactoryMemoryValue,
} from "../../packages/shared/src/factoryMemorySecurity";

export const FACTORY_MEMORY_LIMITS = {
  maxContentCharacters: 100_000,
  maxChunkCharacters: 1_600,
  maxChunksPerDocument: 100,
  maxSearchCandidates: 160,
  maxSearchResults: 50,
  maxGraphDepth: 3,
  maxGraphNodes: 100,
  maxGraphFanOut: 25,
  maxContextItems: 50,
  maxContextTokens: 100_000,
} as const;

const SEMANTIC_GROUPS = [
  ["auth", "authentication", "authorization", "token", "identity"],
  ["test", "testing", "verification", "regression", "evidence"],
  ["incident", "failure", "failed", "outage", "error"],
  ["dependency", "depends", "downstream", "imports", "calls", "uses"],
  ["architecture", "adr", "decision", "governed", "constraint"],
  ["history", "historical", "previous", "prior", "git", "commit"],
] as const;

export interface FactoryChunkDraft {
  content: string;
  searchText: string;
  chunkIndex: number;
  estimatedTokens: number;
  lineStart: number;
  lineEnd: number;
}

export interface FactorySearchCandidate {
  _id: unknown;
  sourceType: string;
  sourceId: string;
  content: string;
  searchText: string;
  estimatedTokens: number;
  provenance: { path?: string; timestamp: number; derivation?: string };
  metadata?: Record<string, unknown>;
}

function terms(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_./:@-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .slice(0, 128);
}

function expandedTerms(input: string): Set<string> {
  const result = new Set(terms(input));
  for (const group of SEMANTIC_GROUPS) {
    if (group.some((term) => result.has(term))) {
      for (const term of group) result.add(term);
    }
  }
  return result;
}

export function normalizeFactorySearchText(
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

export function estimateFactoryTokens(content: string): number {
  return content.trim() ? Math.max(1, Math.ceil(content.length / 4)) : 0;
}

export function prepareFactoryMemoryContent(input: {
  content: string;
  metadata?: Record<string, unknown>;
}): {
  content: string;
  metadata: Record<string, unknown>;
  redactionCount: number;
  chunks: FactoryChunkDraft[];
} {
  const redacted = redactFactoryMemoryText(
    input.content,
    FACTORY_MEMORY_LIMITS.maxContentCharacters,
  );
  const sanitized = sanitizeFactoryMemoryValue(input.metadata ?? {});
  const metadata = sanitized.value as Record<string, unknown>;
  const lines = redacted.value.split("\n");
  const chunks: FactoryChunkDraft[] = [];
  let start = 0;
  while (
    start < lines.length &&
    chunks.length < FACTORY_MEMORY_LIMITS.maxChunksPerDocument
  ) {
    let end = start;
    let length = 0;
    while (end < lines.length) {
      const nextLength = length + lines[end].length + 1;
      if (end > start && nextLength > FACTORY_MEMORY_LIMITS.maxChunkCharacters)
        break;
      length = nextLength;
      end += 1;
    }
    if (end === start) end += 1;
    const content = lines.slice(start, end).join("\n").trim();
    if (content) {
      chunks.push({
        content,
        searchText: normalizeFactorySearchText(content, metadata),
        chunkIndex: chunks.length,
        estimatedTokens: estimateFactoryTokens(content),
        lineStart: start + 1,
        lineEnd: end,
      });
    }
    if (end >= lines.length) break;
    start = Math.max(start + 1, end - 2);
  }
  return {
    content: redacted.value,
    metadata,
    redactionCount: redacted.redactionCount + sanitized.redactionCount,
    chunks,
  };
}

function cosine(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const term of left) if (right.has(term)) intersection += 1;
  return intersection / Math.sqrt(left.size * right.size);
}

function stringList(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string[] {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function scoreFactorySearchCandidate(
  query: string,
  candidate: FactorySearchCandidate,
  now: number,
) {
  const queryTerms = terms(query);
  const bodyTerms = terms(candidate.searchText);
  const bodyCounts = new Map<string, number>();
  for (const term of bodyTerms)
    bodyCounts.set(term, (bodyCounts.get(term) ?? 0) + 1);
  let lexical = 0;
  for (const term of queryTerms) {
    const count = bodyCounts.get(term) ?? 0;
    if (count) lexical += 1 + Math.log1p(count);
  }
  lexical = Math.min(
    1,
    lexical / Math.max(1, queryTerms.length * 2) +
      (candidate.searchText.includes(query.toLowerCase().trim()) ? 0.25 : 0),
  );

  const semantic = cosine(
    expandedTerms(query),
    expandedTerms(candidate.searchText),
  );
  const codeFeatures = [
    candidate.provenance.path ?? "",
    ...stringList(candidate.metadata, "symbols"),
    ...stringList(candidate.metadata, "imports"),
    ...stringList(candidate.metadata, "references"),
  ].map((value) => value.toLowerCase());
  const expanded = expandedTerms(query);
  let codeMatches = 0;
  if (
    candidate.sourceType === "source-code" ||
    candidate.sourceType === "test"
  ) {
    for (const term of expanded)
      if (codeFeatures.some((feature) => feature.includes(term)))
        codeMatches += 1;
  }
  const code = Math.min(1, codeMatches / Math.max(1, expanded.size));
  const authority = candidate.provenance.derivation ?? "authoritative";
  const authorityBoost =
    authority === "authoritative"
      ? 0.12
      : authority === "deterministic"
        ? 0.07
        : 0;
  const ageDays = Math.max(
    0,
    (now - candidate.provenance.timestamp) / 86_400_000,
  );
  const score = Math.min(
    1,
    lexical * 0.45 +
      semantic * 0.35 +
      code * 0.2 +
      authorityBoost +
      Math.max(0, 1 - ageDays / 365) * 0.04,
  );
  const methods = [
    lexical > 0 ? "lexical" : null,
    semantic > 0 ? "semantic" : null,
    code > 0 ? "code" : null,
  ].filter((method): method is string => Boolean(method));
  return {
    score,
    retrievalMethod: methods.length > 1 ? "hybrid" : (methods[0] ?? "lexical"),
    reason: `Selected from ${[
      lexical > 0 ? `lexical ${lexical.toFixed(2)}` : null,
      semantic > 0 ? `semantic ${semantic.toFixed(2)}` : null,
      code > 0 ? `code ${code.toFixed(2)}` : null,
      authority,
    ]
      .filter(Boolean)
      .join(", ")}.`,
  };
}

export function validateFactoryRelationship(input: {
  sourceId: unknown;
  targetId: unknown;
  relation: string;
  derivation: string;
  confidence?: number;
  provenance: unknown[];
}): void {
  if (input.sourceId === input.targetId && input.relation !== "similar_to")
    throw new Error(
      "Self-referential Factory relationships are only valid for similar_to.",
    );
  if (!input.provenance.length)
    throw new Error("Factory relationships require provenance.");
  if (
    input.derivation === "inferred" &&
    (input.confidence === undefined ||
      input.confidence < 0 ||
      input.confidence > 1)
  )
    throw new Error(
      "Inferred Factory relationships require confidence between 0 and 1.",
    );
  if (
    input.confidence !== undefined &&
    (input.confidence < 0 || input.confidence > 1)
  )
    throw new Error("Factory relationship confidence must be between 0 and 1.");
}

export function sanitizeFactoryObservation<T>(value: T): T {
  return sanitizeFactoryMemoryValue(value).value as T;
}

export function sanitizeFactoryText(value: string, maxLength: number): string {
  return redactFactoryMemoryText(value, maxLength).value;
}
