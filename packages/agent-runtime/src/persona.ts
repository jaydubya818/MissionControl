/**
 * Persona Loader
 * 
 * Loads and validates agent persona definitions from YAML files.
 * Persona files define an agent's identity, capabilities, permissions, and system prompt.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

export interface AgentPersona {
  name: string;
  emoji: string;
  role: "INTERN" | "SPECIALIST" | "LEAD";
  description: string;
  trigger_patterns: string[];
  risk_profile: "GREEN" | "YELLOW" | "RED";
  allowed_task_types: string[];
  allowed_tools: string[];
  budgets: {
    daily_cap: number;
    per_run_cap: number;
  };
  capabilities: string[];
  system_prompt: string;
}

export interface PersonaValidationError {
  field: string;
  message: string;
}

/**
 * Load a persona from a YAML file.
 */
export function loadPersona(filePath: string): AgentPersona {
  const absolutePath = path.resolve(filePath);
  
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Persona file not found: ${absolutePath}`);
  }
  
  const content = fs.readFileSync(absolutePath, "utf-8");
  const parsed = yaml.parse(content);
  
  const errors = validatePersona(parsed);
  if (errors.length > 0) {
    const errorMessages = errors.map((e) => `  - ${e.field}: ${e.message}`).join("\n");
    throw new Error(`Invalid persona file ${filePath}:\n${errorMessages}`);
  }
  
  return parsed as AgentPersona;
}

/**
 * Load all personas from a directory.
 */
export function loadAllPersonas(dirPath: string): Map<string, AgentPersona> {
  const absoluteDir = path.resolve(dirPath);
  const personas = new Map<string, AgentPersona>();
  
  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`Personas directory not found: ${absoluteDir}`);
  }
  
  const files = fs.readdirSync(absoluteDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  
  for (const file of files) {
    const persona = loadPersona(path.join(absoluteDir, file));
    personas.set(persona.name.toLowerCase(), persona);
  }
  
  return personas;
}

/**
 * Validate a parsed persona object.
 * Returns an array of validation errors (empty = valid).
 */
export function validatePersona(data: any): PersonaValidationError[] {
  const errors: PersonaValidationError[] = [];
  
  if (!data || typeof data !== "object") {
    errors.push({ field: "root", message: "Persona must be an object" });
    return errors;
  }
  
  // Required string fields
  const requiredStrings = ["name", "emoji", "role", "description", "system_prompt"];
  for (const field of requiredStrings) {
    if (!data[field] || typeof data[field] !== "string") {
      errors.push({ field, message: `Required string field '${field}' is missing or not a string` });
    }
  }
  
  // Role validation
  const validRoles = ["INTERN", "SPECIALIST", "LEAD"];
  if (data.role && !validRoles.includes(data.role)) {
    errors.push({ field: "role", message: `Role must be one of: ${validRoles.join(", ")}` });
  }
  
  // Risk profile validation
  const validRisks = ["GREEN", "YELLOW", "RED"];
  if (!data.risk_profile || !validRisks.includes(data.risk_profile)) {
    errors.push({ field: "risk_profile", message: `Risk profile must be one of: ${validRisks.join(", ")}` });
  }
  
  // Required arrays
  const requiredArrays = ["trigger_patterns", "allowed_task_types", "allowed_tools", "capabilities"];
  for (const field of requiredArrays) {
    if (!Array.isArray(data[field])) {
      errors.push({ field, message: `Required array field '${field}' is missing or not an array` });
    }
  }
  
  // Budgets validation
  if (!data.budgets || typeof data.budgets !== "object") {
    errors.push({ field: "budgets", message: "Budgets object is required" });
  } else {
    if (typeof data.budgets.daily_cap !== "number" || data.budgets.daily_cap <= 0) {
      errors.push({ field: "budgets.daily_cap", message: "daily_cap must be a positive number" });
    }
    if (typeof data.budgets.per_run_cap !== "number" || data.budgets.per_run_cap <= 0) {
      errors.push({ field: "budgets.per_run_cap", message: "per_run_cap must be a positive number" });
    }
  }
  
  return errors;
}

/**
 * Match a task description to the best persona based on trigger patterns.
 */
export function matchPersona(
  description: string,
  personas: Map<string, AgentPersona>
): AgentPersona | null {
  const lower = description.toLowerCase();
  let bestMatch: { persona: AgentPersona; matchCount: number } | null = null;
  
  for (const persona of personas.values()) {
    // Skip the coordinator (it's always active, not triggered)
    if (persona.trigger_patterns.includes("always_active")) continue;
    if (persona.trigger_patterns.includes("runs_on_schedule")) continue;
    
    const matchCount = persona.trigger_patterns.filter((p) =>
      lower.includes(p.toLowerCase())
    ).length;
    
    if (matchCount > 0 && (!bestMatch || matchCount > bestMatch.matchCount)) {
      bestMatch = { persona, matchCount };
    }
  }
  
  return bestMatch?.persona ?? null;
}
