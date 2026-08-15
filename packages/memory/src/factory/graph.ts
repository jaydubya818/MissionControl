import {
  FACTORY_RELATIONS,
  type FactoryEntity,
  type FactoryEntityType,
  type FactoryKnowledgeGraph,
  type FactoryRelation,
  type FactoryRelationship,
  type FactoryScope,
  type GraphPath,
  type GraphQueryOptions,
  type GraphSlice,
  type GraphTraversalOptions,
  type KnowledgeDerivation,
} from "./types.js";
import { assertSameScope } from "./security.js";
const RELATION_SET = new Set<string>(FACTORY_RELATIONS);
const MAX_DEPTH = 3;
const MAX_NODES = 100;
const MAX_FAN_OUT = 25;
export function isFactoryRelation(
  relation: string,
): relation is FactoryRelation {
  return RELATION_SET.has(relation);
}
export function validateFactoryRelationship(
  relationship: FactoryRelationship,
): void {
  if (!isFactoryRelation(relationship.relation))
    throw new Error(
      `Unsupported Factory relationship: ${relationship.relation}`,
    );
  if (
    relationship.sourceId === relationship.targetId &&
    relationship.relation !== "similar_to"
  )
    throw new Error(
      "Self-referential relationships are only valid for similar_to.",
    );
  if (!relationship.provenance.length)
    throw new Error("Factory relationships require provenance.");
  if (
    relationship.derivation === "inferred" &&
    (relationship.confidence === undefined ||
      relationship.confidence < 0 ||
      relationship.confidence > 1)
  )
    throw new Error(
      "Inferred Factory relationships require confidence between 0 and 1.",
    );
  if (
    relationship.confidence !== undefined &&
    (relationship.confidence < 0 || relationship.confidence > 1)
  )
    throw new Error("Factory relationship confidence must be between 0 and 1.");
}
function normalizedReference(reference: string): string {
  return reference
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9./:#-]/g, "");
}
function matchesOptions(
  relationship: FactoryRelationship,
  options: GraphQueryOptions,
): boolean {
  return (
    !(
      options.relations?.length &&
      !options.relations.includes(relationship.relation)
    ) &&
    !(
      options.derivations?.length &&
      !options.derivations.includes(relationship.derivation)
    )
  );
}
export class InMemoryFactoryKnowledgeGraph implements FactoryKnowledgeGraph {
  private readonly entities = new Map<string, FactoryEntity>();
  private readonly relationships = new Map<string, FactoryRelationship>();

  private entityInScope(
    scope: FactoryScope,
    entityId: string,
  ): FactoryEntity | null {
    const entity = this.entities.get(entityId);
    if (!entity || entity.projectId !== scope.projectId) return null;
    if (scope.repositoryId && entity.repositoryId !== scope.repositoryId)
      return null;
    return entity;
  }

  async upsertEntity(entity: FactoryEntity): Promise<void> {
    const existing = this.entities.get(entity.id);
    if (existing) assertSameScope(existing, entity);
    this.entities.set(entity.id, {
      ...entity,
      aliases: [
        ...new Set(entity.aliases.map((alias) => alias.trim()).filter(Boolean)),
      ],
      provenance: [...entity.provenance],
    });
  }
  async upsertRelationship(relationship: FactoryRelationship): Promise<void> {
    validateFactoryRelationship(relationship);
    const source = this.entities.get(relationship.sourceId);
    const target = this.entities.get(relationship.targetId);
    if (!source || !target)
      throw new Error("Both Factory relationship endpoints must exist.");
    assertSameScope(source, relationship);
    assertSameScope(target, relationship);
    if (
      source.type !== relationship.sourceType ||
      target.type !== relationship.targetType
    )
      throw new Error("Factory relationship endpoint type mismatch.");
    this.relationships.set(relationship.id, {
      ...relationship,
      provenance: [...relationship.provenance],
    });
  }
  async resolveEntity(
    scope: FactoryScope,
    reference: string,
    type?: FactoryEntityType,
  ): Promise<FactoryEntity | null> {
    const normalized = normalizedReference(reference);
    return (
      [...this.entities.values()]
        .filter(
          (entity) =>
            entity.projectId === scope.projectId &&
            (!scope.repositoryId ||
              entity.repositoryId === scope.repositoryId) &&
            (!type || entity.type === type) &&
            [entity.id, entity.key, entity.label, ...entity.aliases].some(
              (value) => normalizedReference(value) === normalized,
            ),
        )
        .sort((left, right) => {
          const l = normalizedReference(left.key) === normalized ? 1 : 0;
          const r = normalizedReference(right.key) === normalized ? 1 : 0;
          return r - l || left.label.localeCompare(right.label);
        })[0] ?? null
    );
  }
  private incident(
    entityId: string,
    options: GraphQueryOptions = {},
  ): FactoryRelationship[] {
    const direction = options.direction ?? "both";
    const limit = Math.max(
      1,
      Math.min(MAX_FAN_OUT, options.limit ?? MAX_FAN_OUT),
    );
    return [...this.relationships.values()]
      .filter((relationship) => {
        const incoming = relationship.targetId === entityId;
        const outgoing = relationship.sourceId === entityId;
        const directional =
          direction === "incoming"
            ? incoming
            : direction === "outgoing"
              ? outgoing
              : incoming || outgoing;
        return directional && matchesOptions(relationship, options);
      })
      .sort((left, right) => {
        const authority: Record<KnowledgeDerivation, number> = {
          authoritative: 3,
          deterministic: 2,
          inferred: 1,
        };
        return (
          authority[right.derivation] - authority[left.derivation] ||
          (right.confidence ?? 1) - (left.confidence ?? 1) ||
          left.relation.localeCompare(right.relation)
        );
      })
      .slice(0, limit);
  }
  private slice(entityId: string, options: GraphQueryOptions): GraphSlice {
    if (!this.entities.has(entityId))
      return { entities: [], relationships: [], truncated: false };
    const direction = options.direction ?? "both";
    const allMatching = [...this.relationships.values()].filter(
      (relationship) => {
        const incoming = relationship.targetId === entityId;
        const outgoing = relationship.sourceId === entityId;
        const directional =
          direction === "incoming"
            ? incoming
            : direction === "outgoing"
              ? outgoing
              : incoming || outgoing;
        return directional && matchesOptions(relationship, options);
      },
    );
    const relationships = this.incident(entityId, options);
    const ids = new Set([entityId]);
    for (const relationship of relationships) {
      ids.add(relationship.sourceId);
      ids.add(relationship.targetId);
    }
    return {
      entities: [...ids]
        .map((id) => this.entities.get(id))
        .filter((entity): entity is FactoryEntity => Boolean(entity)),
      relationships,
      truncated: allMatching.length > relationships.length,
    };
  }
  async neighbors(
    scope: FactoryScope,
    entityId: string,
    options: GraphQueryOptions = {},
  ): Promise<GraphSlice> {
    if (!this.entityInScope(scope, entityId))
      return { entities: [], relationships: [], truncated: false };
    return this.slice(entityId, {
      ...options,
      direction: options.direction ?? "both",
    });
  }
  async incoming(
    scope: FactoryScope,
    entityId: string,
    options: GraphQueryOptions = {},
  ): Promise<GraphSlice> {
    if (!this.entityInScope(scope, entityId))
      return { entities: [], relationships: [], truncated: false };
    return this.slice(entityId, { ...options, direction: "incoming" });
  }
  async outgoing(
    scope: FactoryScope,
    entityId: string,
    options: GraphQueryOptions = {},
  ): Promise<GraphSlice> {
    if (!this.entityInScope(scope, entityId))
      return { entities: [], relationships: [], truncated: false };
    return this.slice(entityId, { ...options, direction: "outgoing" });
  }
  async traverse(
    scope: FactoryScope,
    entityId: string,
    options: GraphTraversalOptions = {},
  ): Promise<GraphSlice> {
    if (!this.entityInScope(scope, entityId))
      return { entities: [], relationships: [], truncated: false };
    const maxDepth = Math.max(0, Math.min(MAX_DEPTH, options.maxDepth ?? 2));
    const maxNodes = Math.max(1, Math.min(MAX_NODES, options.maxNodes ?? 50));
    const fanOut = Math.max(1, Math.min(MAX_FAN_OUT, options.fanOut ?? 15));
    const visited = new Set([entityId]);
    const relationshipIds = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [
      { id: entityId, depth: 0 },
    ];
    let truncated = false;
    while (queue.length) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      const allIncident = this.incident(current.id, {
        ...options,
        limit: MAX_FAN_OUT,
      });
      const incident = allIncident.slice(0, fanOut);
      if (allIncident.length > incident.length) truncated = true;
      for (const relationship of incident) {
        relationshipIds.add(relationship.id);
        const nextId =
          relationship.sourceId === current.id
            ? relationship.targetId
            : relationship.sourceId;
        if (visited.has(nextId)) continue;
        if (visited.size >= maxNodes) {
          truncated = true;
          continue;
        }
        visited.add(nextId);
        queue.push({ id: nextId, depth: current.depth + 1 });
      }
    }
    return {
      entities: [...visited]
        .map((id) => this.entities.get(id))
        .filter((entity): entity is FactoryEntity => Boolean(entity)),
      relationships: [...relationshipIds]
        .map((id) => this.relationships.get(id))
        .filter((relationship): relationship is FactoryRelationship =>
          Boolean(relationship),
        ),
      truncated,
    };
  }
  async findPath(
    scope: FactoryScope,
    sourceId: string,
    targetId: string,
    options: GraphTraversalOptions = {},
  ): Promise<GraphPath | null> {
    if (
      !this.entityInScope(scope, sourceId) ||
      !this.entityInScope(scope, targetId)
    )
      return null;
    const maxDepth = Math.max(
      1,
      Math.min(MAX_DEPTH, options.maxDepth ?? MAX_DEPTH),
    );
    const maxNodes = Math.max(2, Math.min(MAX_NODES, options.maxNodes ?? 75));
    const fanOut = Math.max(1, Math.min(MAX_FAN_OUT, options.fanOut ?? 20));
    const queue: Array<{
      id: string;
      depth: number;
      relationships: FactoryRelationship[];
    }> = [{ id: sourceId, depth: 0, relationships: [] }];
    const visited = new Set([sourceId]);
    while (queue.length && visited.size <= maxNodes) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      for (const relationship of this.incident(current.id, {
        ...options,
        limit: fanOut,
      })) {
        const nextId =
          relationship.sourceId === current.id
            ? relationship.targetId
            : relationship.sourceId;
        const path = [...current.relationships, relationship];
        if (nextId === targetId) return this.toPath(sourceId, path);
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({
            id: nextId,
            depth: current.depth + 1,
            relationships: path,
          });
        }
      }
    }
    return null;
  }
  private toPath(
    sourceId: string,
    relationships: FactoryRelationship[],
  ): GraphPath {
    const entityIds = [sourceId];
    const steps = [];
    let currentId = sourceId;
    for (const relationship of relationships) {
      const nextId =
        relationship.sourceId === currentId
          ? relationship.targetId
          : relationship.sourceId;
      const source = this.entities.get(currentId)!;
      const target = this.entities.get(nextId)!;
      steps.push({
        source: source.label,
        relation: relationship.relation,
        target: target.label,
        derivation: relationship.derivation,
      });
      entityIds.push(nextId);
      currentId = nextId;
    }
    return {
      entities: entityIds.map((id) => this.entities.get(id)!),
      relationships,
      steps,
    };
  }
  async subgraph(
    scope: FactoryScope,
    entityIds: string[],
  ): Promise<GraphSlice> {
    const limited = [...new Set(entityIds)]
      .filter((entityId) => this.entityInScope(scope, entityId))
      .slice(0, MAX_NODES);
    const ids = new Set(limited);
    return {
      entities: limited
        .map((id) => this.entities.get(id))
        .filter((entity): entity is FactoryEntity => Boolean(entity)),
      relationships: [...this.relationships.values()].filter(
        (relationship) =>
          ids.has(relationship.sourceId) && ids.has(relationship.targetId),
      ),
      truncated: entityIds.length > MAX_NODES,
    };
  }
}
