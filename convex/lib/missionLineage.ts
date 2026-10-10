import schema from "../schema";
import type { QueryCtx } from "../_generated/server";

type Validator = { type: string; tableName?: string; value?: any; values?: any };
const validators = Object.fromEntries(Object.entries(schema.tables).map(([table, definition]) => [table, (definition.validator as unknown as { json: Validator }).json])) as Record<string, Validator>;
// Shared identities describe actors, not resources owned by their current Task.
const sharedIdentities = new Set(["operators", "orgMembers", "agents", "agentInstances", "agentIdentities"]);
// Any resource can carry an opaque provenance ID. Follow every resource parent;
// typed-only closure misses children of polymorphic records such as qcRuns.
const scopedTables = new Set(Object.keys(validators).filter(table => !sharedIdentities.has(table)));
export const missionLineageTables = [...scopedTables];

export function missionLineage(db: QueryCtx["db"]) {
  const tableCache = new Map<string, string | null>();
  function tableOf(id: string) {
    if (!tableCache.has(id)) tableCache.set(id, Object.keys(validators).find(table => db.normalizeId(table as any, id)) ?? null);
    return tableCache.get(id)!;
  }
  function dynamic(value: unknown): string[] {
    if (typeof value === "string") return (value.match(/(?<![a-z0-9])[a-z0-9]{32}(?![a-z0-9])/g) ?? []).filter(id => scopedTables.has(tableOf(id) ?? ""));
    if (Array.isArray(value)) return value.flatMap(dynamic);
    if (value && typeof value === "object" && !(value instanceof ArrayBuffer)) return Object.values(value).flatMap(dynamic);
    return [];
  }
  function references(validator: Validator, value: any): string[] {
    if (value === undefined || value === null) return [];
    if (validator.type === "id") return scopedTables.has(validator.tableName!) && typeof value === "string" ? [value] : [];
    if (validator.type === "object") return Object.entries(validator.value).flatMap(([key, field]: [string, any]) => references(field.fieldType, value[key]));
    if (validator.type === "array") return Array.isArray(value) ? value.flatMap(item => references(validator.value, item)) : [];
    if (validator.type === "union") return validator.value.flatMap((variant: Validator) => references(variant, value));
    if (validator.type === "record") return Object.values(value).flatMap(item => references(validator.values.fieldType, item));
    // Opaque snapshots and provenance often store Convex IDs as strings.
    if (validator.type === "any" || validator.type === "string") return dynamic(value);
    return [];
  }
  return {
    tableOf,
    references: (row: Record<string, any>, table?: string) => sharedIdentities.has(table ?? "") ? [] : [...new Set(table && validators[table]
      ? references(validators[table], row) : dynamic(Object.fromEntries(Object.entries(row).filter(([key]) => key !== "_id"))))],
  };
}
