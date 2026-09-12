/**
 * Skill frontmatter standard for Mission Control skills.
 *
 * A SKILL.md file starts with a YAML frontmatter block delimited by "---"
 * lines. Only a minimal, deterministic YAML subset is supported — anything
 * outside it raises a SkillFrontmatterError with a line number:
 *
 *   - plain scalars:            key: value          (optional single/double quotes)
 *   - folded block scalars:     key: >   /  key: >- (lines joined with spaces,
 *                               blank lines become newlines, trailing whitespace chomped)
 *   - literal block scalars:    key: |   /  key: |- (lines joined with newlines,
 *                               trailing whitespace chomped)
 *   - string lists:             key:
 *                                 - item
 *   - portable metadata:        metadata:
 *                                 key: value
 *
 * NOT supported (typed error): nested maps below metadata, flow collections
 * ([] / {}), anchors/aliases, multi-document streams, tabs in indentation,
 * non-string metadata values (everything else parses as a string).
 */

import { SemverError, parseVersion } from "./semver.js";

export class SkillFrontmatterError extends Error {
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(line !== undefined ? `line ${line}: ${message}` : message);
    this.name = "SkillFrontmatterError";
    this.line = line;
  }
}

export const SKILL_RISK_LEVELS = ["low", "medium", "high"] as const;
export type SkillRisk = (typeof SKILL_RISK_LEVELS)[number];

export interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly version?: string;
  readonly owner?: string;
  readonly risk?: SkillRisk;
  readonly capabilities?: readonly string[];
  readonly requires_tools?: readonly string[];
  readonly related_skills?: readonly string[];
  readonly compatibility?: string;
  readonly license?: string;
  readonly allowedTools?: string;
  readonly userInvocable?: boolean;
  readonly metadata?: Readonly<Record<string, string>>;
}

export const REQUIRED_SKILL_FIELDS = ["name", "description"] as const;

const OPTIONAL_SKILL_FIELDS = [
  "version",
  "owner",
  "risk",
  "capabilities",
  "requires_tools",
  "related_skills",
  "compatibility",
  "license",
  "allowed-tools",
  "user-invocable",
  "metadata",
] as const;

const LIST_FIELDS: readonly string[] = ["capabilities", "requires_tools", "related_skills"];

const KNOWN_FIELDS: readonly string[] = [...REQUIRED_SKILL_FIELDS, ...OPTIONAL_SKILL_FIELDS];

const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isKebabCase(value: string): boolean {
  return KEBAB_CASE_RE.test(value);
}

// ---------------------------------------------------------------------------
// Raw structural parse
// ---------------------------------------------------------------------------

export interface RawFrontmatterEntry {
  readonly value: string | readonly string[] | RawFrontmatterMap;
  /** 1-based line number of the key. */
  readonly line: number;
}

export type RawFrontmatterMap = Readonly<Record<string, RawFrontmatterEntry>>;

export interface RawFrontmatter {
  readonly entries: Readonly<Record<string, RawFrontmatterEntry>>;
  /** Markdown body after the closing "---" line. */
  readonly body: string;
  /** 1-based line number where the body begins. */
  readonly bodyStartLine: number;
}

const KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/;

function indentOf(line: string, lineNo: number): number {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    if (line[i] === "\t") {
      throw new SkillFrontmatterError("tabs are not allowed in frontmatter indentation", lineNo);
    }
    i++;
  }
  return i;
}

function unquoteScalar(raw: string, lineNo: number): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    if (value.length < 2 || !value.endsWith('"')) {
      throw new SkillFrontmatterError(`unterminated double-quoted scalar: ${value}`, lineNo);
    }
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value.startsWith("'")) {
    if (value.length < 2 || !value.endsWith("'")) {
      throw new SkillFrontmatterError(`unterminated single-quoted scalar: ${value}`, lineNo);
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith("[") || value.startsWith("{")) {
    throw new SkillFrontmatterError("flow collections ([...] / {...}) are not supported", lineNo);
  }
  if (value.startsWith("&") || value.startsWith("*")) {
    throw new SkillFrontmatterError("YAML anchors and aliases are not supported", lineNo);
  }
  return value;
}

interface BlockScalarResult {
  readonly value: string;
  /** Index (into the lines array) of the first line after the block. */
  readonly next: number;
}

function parseBlockScalar(lines: readonly string[], start: number, folded: boolean): BlockScalarResult {
  const collected: string[] = [];
  let indent = -1;
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      collected.push("");
      continue;
    }
    const lineIndent = indentOf(line, i + 1);
    if (indent === -1) {
      if (lineIndent === 0) break; // empty block
      indent = lineIndent;
    }
    if (lineIndent < indent) {
      if (lineIndent === 0) break; // next top-level key
      throw new SkillFrontmatterError(
        `inconsistent indentation in block scalar (expected at least ${indent} spaces)`,
        i + 1,
      );
    }
    collected.push(line.slice(indent));
  }
  // Drop trailing blank lines (chomping).
  while (collected.length > 0 && collected[collected.length - 1] === "") {
    collected.pop();
  }
  let value: string;
  if (folded) {
    const paragraphs: string[][] = [[]];
    for (const line of collected) {
      if (line === "") {
        paragraphs.push([]);
      } else {
        paragraphs[paragraphs.length - 1].push(line);
      }
    }
    value = paragraphs
      .filter((p) => p.length > 0)
      .map((p) => p.join(" "))
      .join("\n");
  } else {
    value = collected.join("\n");
  }
  return { value, next: i };
}

interface ListResult {
  readonly value: string[];
  readonly next: number;
}

function parseList(lines: readonly string[], start: number, keyLine: number): ListResult {
  const items: string[] = [];
  let indent = -1;
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const lineIndent = indentOf(line, i + 1);
    if (lineIndent === 0) break; // next top-level key
    const rest = line.slice(lineIndent);
    if (!rest.startsWith("- ") && rest !== "-") {
      throw new SkillFrontmatterError(`expected a "- item" list entry`, i + 1);
    }
    if (indent === -1) {
      indent = lineIndent;
    } else if (lineIndent !== indent) {
      throw new SkillFrontmatterError(
        `inconsistent list indentation (expected ${indent} spaces, got ${lineIndent})`,
        i + 1,
      );
    }
    const item = rest === "-" ? "" : unquoteScalar(rest.slice(2), i + 1);
    if (item === "") {
      throw new SkillFrontmatterError("empty list item", i + 1);
    }
    items.push(item);
  }
  if (items.length === 0) {
    throw new SkillFrontmatterError("expected list items or a value after the key", keyLine);
  }
  return { value: items, next: i };
}

interface MapResult {
  readonly value: RawFrontmatterMap;
  readonly next: number;
}

function parseMetadataMap(lines: readonly string[], start: number, keyLine: number): MapResult {
  const entries: Record<string, RawFrontmatterEntry> = {};
  let indent = -1;
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const lineIndent = indentOf(line, i + 1);
    if (lineIndent === 0) break;
    if (indent === -1) {
      indent = lineIndent;
    } else if (lineIndent !== indent) {
      throw new SkillFrontmatterError("metadata values must be scalars", i + 1);
    }
    const match = KEY_RE.exec(line.slice(lineIndent));
    if (match === null) {
      throw new SkillFrontmatterError(`expected "key: value" in metadata, got: ${line.trim()}`, i + 1);
    }
    const key = match[1];
    if (key in entries) {
      throw new SkillFrontmatterError(`duplicate metadata key "${key}"`, i + 1);
    }
    const rest = match[2].trim();
    if (rest === "" || rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
      throw new SkillFrontmatterError("metadata values must be scalars", i + 1);
    }
    entries[key] = { value: unquoteScalar(rest, i + 1), line: i + 1 };
  }
  if (Object.keys(entries).length === 0) {
    throw new SkillFrontmatterError("expected metadata entries", keyLine);
  }
  return { value: entries, next: i };
}

/**
 * Structurally parse the frontmatter block. Returns null when the file does
 * not start with a "---" line. Throws SkillFrontmatterError (with line
 * numbers) on any syntax outside the supported YAML subset.
 */
export function extractRawFrontmatter(markdown: string): RawFrontmatter | null {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? "").trimEnd() !== "---") return null;

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) {
    throw new SkillFrontmatterError('unterminated frontmatter block: missing closing "---"', 1);
  }

  const yamlLines = lines.slice(1, close);
  const entries: Record<string, RawFrontmatterEntry> = {};
  let i = 0;
  while (i < yamlLines.length) {
    const line = yamlLines[i];
    const lineNo = i + 2; // +1 for opening "---", +1 for 1-based
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      i++;
      continue;
    }
    if (indentOf(line, lineNo) > 0) {
      throw new SkillFrontmatterError("unexpected indentation: nested mappings are not supported", lineNo);
    }
    const match = KEY_RE.exec(line);
    if (match === null) {
      throw new SkillFrontmatterError(`expected "key: value", got: ${line.trim()}`, lineNo);
    }
    const key = match[1];
    if (key in entries) {
      throw new SkillFrontmatterError(`duplicate key "${key}"`, lineNo);
    }
    const rest = match[2].trim();
    if (rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
      const block = parseBlockScalar(yamlLines, i + 1, rest.startsWith(">"));
      entries[key] = { value: block.value, line: lineNo };
      i = block.next;
    } else if (rest === "") {
      if (key === "metadata") {
        const map = parseMetadataMap(yamlLines, i + 1, lineNo);
        entries[key] = { value: map.value, line: lineNo };
        i = map.next;
      } else {
        const list = parseList(yamlLines, i + 1, lineNo);
        entries[key] = { value: list.value, line: lineNo };
        i = list.next;
      }
    } else {
      entries[key] = { value: unquoteScalar(rest, lineNo), line: lineNo };
      i++;
    }
  }

  return {
    entries,
    body: lines.slice(close + 1).join("\n"),
    bodyStartLine: close + 2,
  };
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

export interface FrontmatterFieldIssue {
  readonly field: string;
  readonly kind: "missing" | "invalid" | "unknown";
  readonly message: string;
  readonly line?: number;
}

function expectScalar(entry: RawFrontmatterEntry, field: string): string | FrontmatterFieldIssue {
  if (typeof entry.value !== "string") {
    return {
      field,
      kind: "invalid",
      message: `"${field}" must be a string, got ${Array.isArray(entry.value) ? "a list" : "a mapping"}`,
      line: entry.line,
    };
  }
  return entry.value;
}

function expectList(entry: RawFrontmatterEntry, field: string): readonly string[] | FrontmatterFieldIssue {
  if (!Array.isArray(entry.value)) {
    return {
      field,
      kind: "invalid",
      message: `"${field}" must be a string list ("- item" entries), got ${typeof entry.value === "string" ? "a scalar" : "a mapping"}`,
      line: entry.line,
    };
  }
  return entry.value;
}

function isStringList(value: RawFrontmatterEntry["value"]): value is readonly string[] {
  return Array.isArray(value);
}

function expectMetadata(entry: RawFrontmatterEntry):
  | { readonly value: RawFrontmatterMap }
  | { readonly issue: FrontmatterFieldIssue } {
  if (typeof entry.value === "string" || isStringList(entry.value)) {
    return {
      issue: {
        field: "metadata",
        kind: "invalid",
        message: `"metadata" must be a string mapping`,
        line: entry.line,
      },
    };
  }
  return { value: entry.value };
}

function metadataStrings(metadata: RawFrontmatterMap): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(metadata).map(([key, entry]) => [key, entry.value as string]));
}

function resolvedEntry(
  raw: RawFrontmatter,
  metadata: RawFrontmatterMap,
  field: string,
): RawFrontmatterEntry | undefined {
  return raw.entries[field] ?? metadata[field];
}

function commaSeparatedList(entry: RawFrontmatterEntry, field: string): readonly string[] | FrontmatterFieldIssue {
  const scalar = expectScalar(entry, field);
  if (typeof scalar !== "string") return scalar;
  const values = scalar.split(",").map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) {
    return {
      field,
      kind: "invalid",
      message: `"metadata.${field}" must contain at least one comma-separated value`,
      line: entry.line,
    };
  }
  return values;
}

/**
 * Validate a raw frontmatter block against the skill standard. Never throws;
 * returns the typed frontmatter (when every field validates) plus the list of
 * field-level issues. Used by both the strict parser and the linter.
 */
export function validateRawFrontmatter(raw: RawFrontmatter): {
  frontmatter: SkillFrontmatter | null;
  issues: FrontmatterFieldIssue[];
} {
  const issues: FrontmatterFieldIssue[] = [];
  const result: {
    name?: string;
    description?: string;
    version?: string;
    owner?: string;
    risk?: SkillRisk;
    capabilities?: readonly string[];
    requires_tools?: readonly string[];
    related_skills?: readonly string[];
    compatibility?: string;
    license?: string;
    allowedTools?: string;
    userInvocable?: boolean;
    metadata?: Readonly<Record<string, string>>;
  } = {};

  let metadata: RawFrontmatterMap = {};
  const metadataEntry = raw.entries.metadata;
  if (metadataEntry !== undefined) {
    const parsedMetadata = expectMetadata(metadataEntry);
    if ("issue" in parsedMetadata) {
      issues.push(parsedMetadata.issue);
    } else {
      metadata = parsedMetadata.value;
      result.metadata = metadataStrings(metadata);
    }
  }

  for (const [key, entry] of Object.entries(raw.entries)) {
    if (!KNOWN_FIELDS.includes(key)) {
      issues.push({
        field: key,
        kind: "unknown",
        message: `unknown field "${key}" — allowed fields: ${KNOWN_FIELDS.join(", ")}`,
        line: entry.line,
      });
    }
  }

  for (const field of REQUIRED_SKILL_FIELDS) {
    const entry = raw.entries[field];
    if (entry === undefined || (typeof entry.value === "string" && entry.value.trim() === "")) {
      issues.push({
        field,
        kind: "missing",
        message: `required field "${field}" is ${entry === undefined ? "missing" : "empty"}`,
        line: entry?.line,
      });
      continue;
    }
    const scalar = expectScalar(entry, field);
    if (typeof scalar !== "string") {
      issues.push(scalar);
      continue;
    }
    if (field === "name" && !isKebabCase(scalar)) {
      issues.push({
        field,
        kind: "invalid",
        message: `"name" must be kebab-case (lowercase alphanumerics joined by "-"), got "${scalar}"`,
        line: entry.line,
      });
      continue;
    }
    result[field] = scalar;
  }

  for (const field of ["version", "owner"] as const) {
    const entry = resolvedEntry(raw, metadata, field);
    if (entry === undefined) continue;
    const scalar = expectScalar(entry, field);
    if (typeof scalar !== "string") {
      issues.push(scalar);
      continue;
    }
    if (scalar.trim() === "") {
      issues.push({ field, kind: "invalid", message: `"${field}" is empty`, line: entry.line });
      continue;
    }
    if (field === "version") {
      try {
        parseVersion(scalar);
      } catch (err) {
        if (err instanceof SemverError) {
          issues.push({ field, kind: "invalid", message: `"version": ${err.message}`, line: entry.line });
          continue;
        }
        throw err;
      }
    }
    result[field] = scalar;
  }

  const risk = resolvedEntry(raw, metadata, "risk");
  if (risk !== undefined) {
    const scalar = expectScalar(risk, "risk");
    if (typeof scalar !== "string") {
      issues.push(scalar);
    } else if (!(SKILL_RISK_LEVELS as readonly string[]).includes(scalar)) {
      issues.push({
        field: "risk",
        kind: "invalid",
        message: `"risk" must be one of ${SKILL_RISK_LEVELS.join(", ")}, got "${scalar}"`,
        line: risk.line,
      });
    } else {
      result.risk = scalar as SkillRisk;
    }
  }

  for (const field of LIST_FIELDS) {
    const entry = resolvedEntry(raw, metadata, field);
    if (entry === undefined) continue;
    const list = raw.entries[field] !== undefined
      ? expectList(entry, field)
      : commaSeparatedList(entry, field);
    if (!Array.isArray(list)) {
      issues.push(list as FrontmatterFieldIssue);
      continue;
    }
    result[field as "capabilities" | "requires_tools" | "related_skills"] = list;
  }

  const compatibility = raw.entries.compatibility;
  if (compatibility !== undefined) {
    const scalar = expectScalar(compatibility, "compatibility");
    if (typeof scalar !== "string") {
      issues.push(scalar);
    } else {
      result.compatibility = scalar;
    }
  }

  for (const [field, resultField] of [
    ["license", "license"],
    ["allowed-tools", "allowedTools"],
  ] as const) {
    const entry = raw.entries[field];
    if (entry === undefined) continue;
    const scalar = expectScalar(entry, field);
    if (typeof scalar !== "string") {
      issues.push(scalar);
    } else {
      result[resultField] = scalar;
    }
  }

  const userInvocable = raw.entries["user-invocable"];
  if (userInvocable !== undefined) {
    const scalar = expectScalar(userInvocable, "user-invocable");
    if (typeof scalar !== "string") {
      issues.push(scalar);
    } else if (scalar !== "true" && scalar !== "false") {
      issues.push({
        field: "user-invocable",
        kind: "invalid",
        message: `"user-invocable" must be "true" or "false", got "${scalar}"`,
        line: userInvocable.line,
      });
    } else {
      result.userInvocable = scalar === "true";
    }
  }

  const complete =
    issues.length === 0 &&
    result.name !== undefined &&
    result.description !== undefined;

  return { frontmatter: complete ? (result as SkillFrontmatter) : null, issues };
}

/**
 * Parse and validate SKILL.md frontmatter. Throws SkillFrontmatterError on
 * missing frontmatter, syntax outside the supported subset, or any field
 * validation failure.
 */
export function parseSkillFrontmatter(markdown: string): SkillFrontmatter {
  const raw = extractRawFrontmatter(markdown);
  if (raw === null) {
    throw new SkillFrontmatterError('missing frontmatter: file must start with a "---" line');
  }
  const { frontmatter, issues } = validateRawFrontmatter(raw);
  if (frontmatter === null) {
    const first = issues[0];
    throw new SkillFrontmatterError(first.message, first.line);
  }
  return frontmatter;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const PLAIN_SCALAR_SAFE_RE = /^[A-Za-z0-9][^#:'"[\]{}\n]*$/;

function serializeScalar(value: string): string {
  if (PLAIN_SCALAR_SAFE_RE.test(value) && value === value.trim() && !/^[>|&*-]/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Serialize frontmatter to a canonical block: fixed key order, description as
 * a block scalar, lists as "- item" entries. Output round-trips through
 * parseSkillFrontmatter. Throws SkillFrontmatterError if the input would not
 * validate.
 */
export function serializeSkillFrontmatter(fm: SkillFrontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${serializeScalar(fm.name)}`);
  if (fm.description.includes("\n")) {
    lines.push("description: |-");
    for (const ln of fm.description.split("\n")) {
      lines.push(ln === "" ? "" : `  ${ln}`);
    }
  } else {
    lines.push("description: >-");
    lines.push(`  ${fm.description}`);
  }
  const metadata = fm.metadata ?? {};
  if (fm.version !== undefined && metadata.version === undefined) {
    lines.push(`version: ${serializeScalar(fm.version)}`);
  }
  if (fm.owner !== undefined && metadata.owner === undefined) {
    lines.push(`owner: ${serializeScalar(fm.owner)}`);
  }
  if (fm.risk !== undefined && metadata.risk === undefined) {
    lines.push(`risk: ${fm.risk}`);
  }
  for (const field of ["capabilities", "requires_tools", "related_skills"] as const) {
    const list = fm[field];
    if (list === undefined || metadata[field] !== undefined) continue;
    lines.push(`${field}:`);
    for (const item of list) {
      lines.push(`  - ${serializeScalar(item)}`);
    }
  }
  if (fm.compatibility !== undefined) {
    lines.push(`compatibility: ${serializeScalar(fm.compatibility)}`);
  }
  if (fm.license !== undefined) {
    lines.push(`license: ${serializeScalar(fm.license)}`);
  }
  if (fm.allowedTools !== undefined) {
    lines.push(`allowed-tools: ${serializeScalar(fm.allowedTools)}`);
  }
  if (Object.keys(metadata).length > 0) {
    lines.push("metadata:");
    for (const [key, value] of Object.entries(metadata)) {
      lines.push(`  ${key}: ${serializeScalar(value)}`);
    }
  }
  if (fm.userInvocable !== undefined) {
    lines.push(`user-invocable: ${fm.userInvocable}`);
  }
  lines.push("---");
  const block = lines.join("\n") + "\n";
  // Guarantee the canonical form round-trips.
  parseSkillFrontmatter(block);
  return block;
}
