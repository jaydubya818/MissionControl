/**
 * Template Renderer
 * 
 * Renders step input templates with context variables using Mustache syntax.
 * Supports {{variable}} substitution for passing data between workflow steps.
 */

import Mustache from "mustache";

export interface RenderContext {
  [key: string]: any;
}

/**
 * Render a template string with context variables
 * 
 * @param template - Template string with {{variable}} placeholders
 * @param context - Context object with variable values
 * @returns Rendered string
 * 
 * @example
 * render("Hello {{name}}", { name: "World" })
 * // => "Hello World"
 * 
 * render("{{planOutput}}\n\nImplement: {{task}}", {
 *   planOutput: "Stories defined",
 *   task: "Add OAuth"
 * })
 * // => "Stories defined\n\nImplement: Add OAuth"
 */
export function render(template: string, context: RenderContext): string {
  // Disable HTML escaping (we're not rendering HTML)
  return Mustache.render(template, context, {}, { escape: (text) => text });
}

/**
 * Extract all variable names from a template
 * 
 * @param template - Template string with {{variable}} placeholders
 * @returns Array of variable names
 * 
 * @example
 * extractVariables("Hello {{name}}, your score is {{score}}")
 * // => ["name", "score"]
 */
export function extractVariables(template: string): string[] {
  const variables = new Set<string>();
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1].trim());
  }
  
  return Array.from(variables);
}

/**
 * Validate that all required variables are present in context
 * 
 * @param template - Template string with {{variable}} placeholders
 * @param context - Context object with variable values
 * @returns Array of missing variable names (empty = valid)
 */
export function validateContext(template: string, context: RenderContext): string[] {
  const required = extractVariables(template);
  const missing: string[] = [];
  
  for (const variable of required) {
    if (!(variable in context)) {
      missing.push(variable);
    }
  }
  
  return missing;
}
