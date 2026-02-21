/**
 * Template Renderer Tests
 */

import { describe, it, expect } from "vitest";
import { render, extractVariables, validateContext } from "../renderer";

describe("render", () => {
  it("should render simple variables", () => {
    const template = "Hello {{name}}!";
    const context = { name: "World" };
    const result = render(template, context);
    
    expect(result).toBe("Hello World!");
  });
  
  it("should render multiple variables", () => {
    const template = "{{greeting}} {{name}}, your score is {{score}}";
    const context = { greeting: "Hello", name: "Alice", score: 100 };
    const result = render(template, context);
    
    expect(result).toBe("Hello Alice, your score is 100");
  });
  
  it("should handle multiline templates", () => {
    const template = `Implement the following:
{{planOutput}}

Environment: {{setupOutput}}`;
    const context = {
      planOutput: "Story 1: Add auth\nStory 2: Add tests",
      setupOutput: "Branch created",
    };
    const result = render(template, context);
    
    expect(result).toContain("Story 1: Add auth");
    expect(result).toContain("Branch created");
  });
  
  it("should not escape HTML (we're not rendering HTML)", () => {
    const template = "Code: {{code}}";
    const context = { code: "<script>alert('test')</script>" };
    const result = render(template, context);
    
    expect(result).toBe("Code: <script>alert('test')</script>");
  });
  
  it("should handle missing variables gracefully", () => {
    const template = "Hello {{name}}!";
    const context = {};
    const result = render(template, context);
    
    // Mustache renders missing variables as empty string
    expect(result).toBe("Hello !");
  });
});

describe("extractVariables", () => {
  it("should extract single variable", () => {
    const template = "Hello {{name}}!";
    const variables = extractVariables(template);
    
    expect(variables).toEqual(["name"]);
  });
  
  it("should extract multiple variables", () => {
    const template = "{{greeting}} {{name}}, score: {{score}}";
    const variables = extractVariables(template);
    
    expect(variables).toEqual(["greeting", "name", "score"]);
  });
  
  it("should extract variables from multiline templates", () => {
    const template = `Plan: {{planOutput}}
Setup: {{setupOutput}}
Implement: {{task}}`;
    const variables = extractVariables(template);
    
    expect(variables).toEqual(["planOutput", "setupOutput", "task"]);
  });
  
  it("should handle duplicate variables", () => {
    const template = "{{name}} and {{name}} again";
    const variables = extractVariables(template);
    
    // Should only return unique variables
    expect(variables).toEqual(["name"]);
  });
  
  it("should return empty array for template with no variables", () => {
    const template = "No variables here";
    const variables = extractVariables(template);
    
    expect(variables).toEqual([]);
  });
  
  it("should trim whitespace from variable names", () => {
    const template = "{{ name }} and {{  score  }}";
    const variables = extractVariables(template);
    
    expect(variables).toEqual(["name", "score"]);
  });
});

describe("validateContext", () => {
  it("should return empty array when all variables present", () => {
    const template = "Hello {{name}}, score: {{score}}";
    const context = { name: "Alice", score: 100 };
    const missing = validateContext(template, context);
    
    expect(missing).toEqual([]);
  });
  
  it("should return missing variable names", () => {
    const template = "Hello {{name}}, score: {{score}}";
    const context = { name: "Alice" };
    const missing = validateContext(template, context);
    
    expect(missing).toEqual(["score"]);
  });
  
  it("should return all missing variables", () => {
    const template = "{{a}} {{b}} {{c}}";
    const context = { a: "A" };
    const missing = validateContext(template, context);
    
    expect(missing).toEqual(["b", "c"]);
  });
  
  it("should return empty array for template with no variables", () => {
    const template = "No variables";
    const context = {};
    const missing = validateContext(template, context);
    
    expect(missing).toEqual([]);
  });
  
  it("should not care about extra context variables", () => {
    const template = "Hello {{name}}";
    const context = { name: "Alice", extra: "value", another: 123 };
    const missing = validateContext(template, context);
    
    expect(missing).toEqual([]);
  });
});
