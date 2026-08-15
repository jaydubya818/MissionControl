import type {
  ContextBudget,
  FactoryMemoryChunk,
  FactoryMemoryDocument,
  FactoryMemoryQuery,
  FactoryMemoryResult,
  FactoryMemoryStore,
  FactoryScope,
  KnowledgeDerivation,
  RetrievalMethod,
  SemanticIndex,
} from "./types.js";
import { assertSameScope } from "./security.js";
const SEMANTIC_GROUPS = [
  [
    "auth",
    "authentication",
    "authorization",
    "token",
    "credential",
    "identity",
  ],
  [
    "test",
    "tests",
    "testing",
    "verification",
    "validate",
    "regression",
    "evidence",
  ],
  ["incident", "failure", "failed", "break", "broke", "outage", "error"],
  ["dependency", "depends", "downstream", "imports", "calls", "uses"],
  ["architecture", "adr", "decision", "governed", "policy", "constraint"],
  ["history", "historical", "previous", "prior", "before", "git", "commit"],
  ["component", "service", "module", "file", "symbol", "api", "endpoint"],
] as const;
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
  for (const group of SEMANTIC_GROUPS)
    if (group.some((term) => result.has(term)))
      for (const term of group) result.add(term);
  return result;
}
function vector(input: string): Map<string, number> {
  const output = new Map<string, number>();
  for (const term of expandedTerms(input))
    output.set(term, (output.get(term) ?? 0) + 1);
  return output;
}
function cosine(left: Map<string, number>, right: Map<string, number>): number {
  let dot = 0,
    leftNorm = 0,
    rightNorm = 0;
  for (const value of left.values()) leftNorm += value * value;
  for (const value of right.values()) rightNorm += value * value;
  for (const [key, value] of left) dot += value * (right.get(key) ?? 0);
  return leftNorm && rightNorm
    ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
    : 0;
}
export class DeterministicSemanticIndex implements SemanticIndex {
  async index(_chunks: FactoryMemoryChunk[]): Promise<void> {}
  async search(
    query: string,
    chunks: FactoryMemoryChunk[],
    limit: number,
  ): Promise<Array<{ chunkId: string; score: number }>> {
    const queryVector = vector(query);
    return chunks
      .map((chunk) => ({
        chunkId: chunk.id,
        score: cosine(queryVector, vector(chunk.searchText)),
      }))
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.chunkId.localeCompare(right.chunkId),
      )
      .slice(0, Math.max(1, Math.min(256, limit)));
  }
}
export class InMemoryFactoryMemoryStore implements FactoryMemoryStore {
  private readonly documents = new Map<string, FactoryMemoryDocument>();
  private readonly chunks = new Map<string, FactoryMemoryChunk>();
  async upsertDocument(
    document: FactoryMemoryDocument,
    chunks: FactoryMemoryChunk[],
  ): Promise<void> {
    for (const chunk of chunks) {
      assertSameScope(document, chunk);
      if (chunk.documentId !== document.id)
        throw new Error("Factory Memory chunk parent mismatch.");
    }
    const existing = this.documents.get(document.id);
    if (existing) assertSameScope(existing, document);
    for (const [id, chunk] of this.chunks)
      if (chunk.documentId === document.id) this.chunks.delete(id);
    this.documents.set(document.id, { ...document });
    for (const chunk of chunks) this.chunks.set(chunk.id, { ...chunk });
  }
  async getDocument(
    scope: FactoryScope,
    id: string,
  ): Promise<FactoryMemoryDocument | null> {
    const document = this.documents.get(id);
    if (!document) return null;
    assertSameScope(scope, document);
    return { ...document };
  }
  async listChunks(scope: FactoryScope): Promise<FactoryMemoryChunk[]> {
    return [...this.chunks.values()].filter(
      (chunk) =>
        chunk.projectId === scope.projectId &&
        (!scope.repositoryId || chunk.repositoryId === scope.repositoryId),
    );
  }
}
function matchesQueryScope(
  chunk: FactoryMemoryChunk,
  query: FactoryMemoryQuery,
): boolean {
  if (chunk.projectId !== query.projectId) return false;
  if (query.repositoryId && chunk.repositoryId !== query.repositoryId)
    return false;
  if (
    query.repositoryIds?.length &&
    (!chunk.repositoryId || !query.repositoryIds.includes(chunk.repositoryId))
  )
    return false;
  if (
    query.sourceTypes?.length &&
    !query.sourceTypes.includes(chunk.sourceType)
  )
    return false;
  if (query.workOrderId && chunk.workOrderId !== query.workOrderId)
    return false;
  if (query.attemptId && chunk.attemptId !== query.attemptId) return false;
  if (
    query.factoryVersionId &&
    chunk.factoryVersionId !== query.factoryVersionId
  )
    return false;
  if (query.fromTimestamp && chunk.provenance.timestamp < query.fromTimestamp)
    return false;
  if (query.toTimestamp && chunk.provenance.timestamp > query.toTimestamp)
    return false;
  if (query.filters)
    for (const [key, value] of Object.entries(query.filters))
      if (chunk.metadata?.[key] !== value) return false;
  return true;
}
function lexicalScore(queryText: string, chunk: FactoryMemoryChunk): number {
  const queryTerms = terms(queryText);
  if (!queryTerms.length) return 0;
  const body = new Map<string, number>();
  for (const term of terms(chunk.searchText))
    body.set(term, (body.get(term) ?? 0) + 1);
  let score = 0;
  for (const term of queryTerms) {
    const count = body.get(term) ?? 0;
    if (count) score += 1 + Math.log1p(count);
  }
  return Math.min(
    1,
    score / Math.max(1, queryTerms.length * 2) +
      (chunk.searchText.includes(queryText.toLowerCase().trim()) ? 0.25 : 0),
  );
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
function codeScore(queryText: string, chunk: FactoryMemoryChunk): number {
  if (chunk.sourceType !== "source-code" && chunk.sourceType !== "test")
    return 0;
  const queryTerms = expandedTerms(queryText);
  const path = chunk.provenance.path?.toLowerCase() ?? "";
  const features = [
    path,
    ...stringList(chunk.metadata, "symbols"),
    ...stringList(chunk.metadata, "imports"),
    ...stringList(chunk.metadata, "references"),
    typeof chunk.metadata?.language === "string" ? chunk.metadata.language : "",
  ].map((value) => value.toLowerCase());
  let matches = 0;
  for (const term of queryTerms)
    if (features.some((feature) => feature.includes(term))) matches += 1;
  return Math.min(
    1,
    matches / Math.max(1, queryTerms.size) +
      (terms(queryText).some((term) => path.includes(term)) ? 0.3 : 0),
  );
}
function authorityFor(chunk: FactoryMemoryChunk): KnowledgeDerivation {
  return chunk.provenance.derivation ?? "authoritative";
}
function authorityBoost(authority: KnowledgeDerivation): number {
  return authority === "authoritative"
    ? 0.12
    : authority === "deterministic"
      ? 0.07
      : 0;
}
export async function hybridRetrieve(input: {
  chunks: FactoryMemoryChunk[];
  query: FactoryMemoryQuery;
  semanticIndex?: SemanticIndex;
  now?: number;
}): Promise<FactoryMemoryResult[]> {
  const now = input.now ?? Date.now();
  const filtered = input.chunks.filter((chunk) =>
    matchesQueryScope(chunk, input.query),
  );
  const semanticIndex = input.semanticIndex ?? new DeterministicSemanticIndex();
  const candidateLimit = Math.max(
    20,
    Math.min(256, (input.query.limit ?? 20) * 8),
  );
  const semantic = new Map(
    (
      await semanticIndex.search(input.query.query, filtered, candidateLimit)
    ).map((item) => [item.chunkId, item.score]),
  );
  const scored = filtered
    .map((chunk) => {
      const lexical = lexicalScore(input.query.query, chunk);
      const semanticScore = semantic.get(chunk.id) ?? 0;
      const code = codeScore(input.query.query, chunk);
      const active: RetrievalMethod[] = [];
      if (lexical > 0) active.push("lexical");
      if (semanticScore > 0) active.push("semantic");
      if (code > 0) active.push("code");
      const retrievalMethod: RetrievalMethod =
        active.length > 1 ? "hybrid" : (active[0] ?? "lexical");
      const authority = authorityFor(chunk);
      const ageDays = Math.max(
        0,
        (now - chunk.provenance.timestamp) / 86_400_000,
      );
      const score = Math.min(
        1,
        lexical * 0.45 +
          semanticScore * 0.35 +
          code * 0.2 +
          authorityBoost(authority) +
          Math.max(0, 1 - ageDays / 365) * 0.04,
      );
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        title: chunk.title,
        content: chunk.content,
        score,
        retrievalMethod,
        estimatedTokens: chunk.estimatedTokens,
        authority,
        reason: `Selected from ${[lexical > 0 ? `lexical ${lexical.toFixed(2)}` : null, semanticScore > 0 ? `semantic ${semanticScore.toFixed(2)}` : null, code > 0 ? `code ${code.toFixed(2)}` : null, authority].filter(Boolean).join(", ")}.`,
        provenance: chunk.provenance,
        metadata: chunk.metadata,
      } satisfies FactoryMemoryResult;
    })
    .filter((result) => result.score > 0);
  return applyResultBudget(
    deduplicateResults(scored).sort(
      (left, right) =>
        right.score - left.score ||
        right.provenance.timestamp - left.provenance.timestamp ||
        left.chunkId.localeCompare(right.chunkId),
    ),
    input.query.budget ?? { maxItems: input.query.limit ?? 20 },
    input.query.limit,
  );
}
export function deduplicateResults(
  results: FactoryMemoryResult[],
): FactoryMemoryResult[] {
  const byKey = new Map<string, FactoryMemoryResult>();
  for (const result of results) {
    const normalized = result.content.toLowerCase().replace(/\s+/g, " ").trim();
    const key = `${result.sourceType}:${result.sourceId}:${result.provenance.revision ?? ""}:${normalized}`;
    const existing = byKey.get(key);
    if (!existing || result.score > existing.score) byKey.set(key, result);
  }
  return [...byKey.values()];
}
export function applyResultBudget(
  results: FactoryMemoryResult[],
  budget: ContextBudget,
  explicitLimit?: number,
): FactoryMemoryResult[] {
  const maxItems = Math.max(
    0,
    Math.min(100, budget.maxItems ?? explicitLimit ?? 20),
  );
  const maxTokens = Math.max(
    0,
    budget.maxEstimatedTokens ?? Number.MAX_SAFE_INTEGER,
  );
  const selected: FactoryMemoryResult[] = [];
  let tokens = 0;
  for (const result of results) {
    if (selected.length >= maxItems) break;
    if (tokens + result.estimatedTokens > maxTokens) continue;
    selected.push(result);
    tokens += result.estimatedTokens;
  }
  return selected;
}
