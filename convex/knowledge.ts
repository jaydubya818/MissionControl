/**
 * Knowledge Base — RAG + Semantic Search over docs
 *
 * Indexes markdown docs as vector embeddings via OpenAI text-embedding-3-small.
 * Supports semantic search and chat-with-repo via GPT-4o-mini.
 */

import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o-mini";
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

// ---------------------------------------------------------------------------
// QUERIES
// ---------------------------------------------------------------------------

export const getIndexedSources = query({
  args: {},
  handler: async (ctx) => {
    const chunks = await ctx.db.query("knowledgeChunks").collect();
    const sources = new Map<string, { title: string; count: number }>();
    for (const c of chunks) {
      const existing = sources.get(c.source);
      if (existing) {
        existing.count++;
      } else {
        sources.set(c.source, { title: c.title, count: 1 });
      }
    }
    return Array.from(sources.entries()).map(([source, meta]) => ({
      source,
      title: meta.title,
      chunkCount: meta.count,
    }));
  },
});

export const getChatHistory = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledgeChatHistory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const getTotalChunks = query({
  args: {},
  handler: async (ctx) => {
    const chunks = await ctx.db.query("knowledgeChunks").collect();
    return chunks.length;
  },
});

// ---------------------------------------------------------------------------
// MUTATIONS
// ---------------------------------------------------------------------------

export const storeChunk = mutation({
  args: {
    source: v.string(),
    title: v.string(),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    // Deduplicate by source + chunkIndex
    const existing = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .collect();
    const dup = existing.find((c) => c.chunkIndex === args.chunkIndex);
    if (dup) {
      await ctx.db.patch(dup._id, {
        content: args.content,
        embedding: args.embedding,
        title: args.title,
      });
      return dup._id;
    }
    return await ctx.db.insert("knowledgeChunks", args);
  },
});

export const clearSource = mutation({
  args: { source: v.string() },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .collect();
    await Promise.all(chunks.map((c) => ctx.db.delete(c._id)));
    return chunks.length;
  },
});

export const storeChatMessage = mutation({
  args: {
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    sources: v.optional(
      v.array(
        v.object({ title: v.string(), source: v.string(), excerpt: v.string() })
      )
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("knowledgeChatHistory", args);
  },
});

export const clearChatHistory = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const msgs = await ctx.db
      .query("knowledgeChatHistory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    await Promise.all(msgs.map((m) => ctx.db.delete(m._id)));
    return msgs.length;
  },
});

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function chunkText(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size - overlap;
  }
  return chunks;
}

async function embedText(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embed error: ${await res.text()}`);
  const data = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data[0].embedding;
}

// ---------------------------------------------------------------------------
// ACTIONS — called from frontend or scheduled
// ---------------------------------------------------------------------------

/**
 * Index a single document (provided as raw markdown content).
 */
export const indexDocument = action({
  args: {
    source: v.string(),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set in Convex env");

    const chunks = chunkText(args.content);
    let indexed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embedText(apiKey, chunks[i]);
      await ctx.runMutation(api.knowledge.storeChunk, {
        source: args.source,
        title: args.title,
        content: chunks[i],
        chunkIndex: i,
        embedding,
      });
      indexed++;
    }
    return { indexed, chunks: chunks.length };
  },
});

/**
 * Index all built-in docs from GitHub raw URLs.
 * Fetches each doc and runs indexDocument.
 */
export const indexAllDocs = action({
  args: {},
  handler: async (ctx) => {
    const BASE =
      "https://raw.githubusercontent.com/jaydubya818/MissionControl/main/";

    const docs: { path: string; title: string }[] = [
      { path: "docs/site/overview/readme.md", title: "What is Mission Control?" },
      { path: "docs/site/overview/platform-components.md", title: "Platform components" },
      { path: "docs/site/get-started/set-up-mission-control.md", title: "Set up Mission Control" },
      { path: "docs/site/get-started/run-the-demo.md", title: "Run the demo" },
      { path: "docs/site/get-started/improve-your-first-skill.md", title: "Improve your first skill" },
      { path: "docs/site/tutorials/governing-work-orders.md", title: "Governing WorkOrders" },
      { path: "docs/site/tutorials/setting-up-agentic-code-review.md", title: "Agentic code review" },
      { path: "docs/site/harness/software-factory.md", title: "Software factory" },
      { path: "docs/site/registry/discover-and-install.md", title: "Registry discover" },
      { path: "docs/site/reference/glossary.md", title: "Glossary" },
      { path: "docs/PRD_V2.md", title: "PRD V2" },
      { path: "docs/APP_FLOW.md", title: "App Flow" },
      { path: "docs/BACKEND_STRUCTURE.md", title: "Backend Structure" },
      { path: "docs/FRONTEND_GUIDELINES.md", title: "Frontend Guidelines" },
      { path: "docs/TECH_STACK.md", title: "Tech Stack" },
      { path: "docs/ARCHITECTURE.md", title: "Architecture" },
      { path: "docs/AGENT_GUIDE.md", title: "Agent Guide" },
      { path: "docs/WORKFLOWS.md", title: "Workflows" },
      { path: "docs/SECURITY_AUDIT.md", title: "Security Audit" },
      { path: "docs/runbook/RUNBOOK.md", title: "Runbook" },
      { path: "docs/guides/QUICK_START_NOW.md", title: "Quick Start" },
      { path: "docs/planning/IMPLEMENTATION_PLAN.md", title: "Implementation Plan" },
      { path: "docs/DECISIONS.md", title: "Decisions" },
      { path: "docs/ROADMAP.md", title: "Roadmap" },
    ];

    const results: { source: string; chunks: number; error?: string }[] = [];
    for (const doc of docs) {
      try {
        const res = await fetch(BASE + doc.path);
        if (!res.ok) {
          results.push({ source: doc.path, chunks: 0, error: `HTTP ${res.status}` });
          continue;
        }
        const content = await res.text();
        const result = await ctx.runAction(api.knowledge.indexDocument, {
          source: doc.path,
          title: doc.title,
          content,
        });
        results.push({ source: doc.path, chunks: result.chunks });
      } catch (e) {
        results.push({
          source: doc.path,
          chunks: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return results;
  },
});

/**
 * Semantic search — returns top-k relevant chunks.
 */
export const semanticSearch = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<(Doc<"knowledgeChunks"> & { score: number })[]> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set in Convex env");

    const embedding = await embedText(apiKey, args.query);
    const limit = args.limit ?? 8;

    const results = await ctx.vectorSearch("knowledgeChunks", "by_embedding", {
      vector: embedding,
      limit,
    });

    const chunks: (Doc<"knowledgeChunks"> & { score: number } | null)[] =
      await Promise.all(
        results.map(async (r): Promise<Doc<"knowledgeChunks"> & { score: number } | null> => {
          const doc: Doc<"knowledgeChunks"> | null = await ctx.runQuery(
            api.knowledge.getChunkById,
            { id: r._id }
          );
          return doc ? { ...doc, score: r._score } : null;
        })
      );

    return chunks.filter((c): c is Doc<"knowledgeChunks"> & { score: number } => c != null);
  },
});

export const getChunkById = query({
  args: { id: v.id("knowledgeChunks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * RAG chat — answer a question using retrieved doc context.
 */
export const chatWithRepo = action({
  args: {
    question: v.string(),
    sessionId: v.string(),
    history: v.optional(
      v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set in Convex env");

    // 1. Retrieve relevant chunks
    const embedding = await embedText(apiKey, args.question);
    const results = await ctx.vectorSearch("knowledgeChunks", "by_embedding", {
      vector: embedding,
      limit: 6,
    });

    const chunks = (
      await Promise.all(
        results.map(async (r) => {
          const doc = await ctx.runQuery(api.knowledge.getChunkById, {
            id: r._id,
          });
          return doc ? { ...doc, score: r._score } : null;
        })
      )
    ).filter(Boolean) as Array<{
      _id: Id<"knowledgeChunks">;
      source: string;
      title: string;
      content: string;
      chunkIndex: number;
      score: number;
    }>;

    const context = chunks
      .map((c) => `## ${c.title} (${c.source})\n${c.content}`)
      .join("\n\n---\n\n");

    const sources = chunks.map((c) => ({
      title: c.title,
      source: c.source,
      excerpt: c.content.slice(0, 200) + (c.content.length > 200 ? "…" : ""),
    }));

    // 2. Build messages
    const systemPrompt = `You are an expert assistant for the Mission Control project — an AI agent orchestration platform. 
Answer questions using the provided documentation context. Be concise, technical, and accurate.
If the context doesn't contain enough information, say so rather than guessing.

DOCUMENTATION CONTEXT:
${context}`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...(args.history ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: args.question },
    ];

    // 3. Call GPT
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!chatRes.ok) {
      throw new Error(`OpenAI chat error: ${await chatRes.text()}`);
    }

    const chatData = (await chatRes.json()) as {
      choices: { message: { content: string } }[];
    };
    const answer = chatData.choices[0].message.content;

    // 4. Persist to history
    await ctx.runMutation(api.knowledge.storeChatMessage, {
      sessionId: args.sessionId,
      role: "user",
      content: args.question,
    });
    await ctx.runMutation(api.knowledge.storeChatMessage, {
      sessionId: args.sessionId,
      role: "assistant",
      content: answer,
      sources,
    });

    return { answer, sources };
  },
});
