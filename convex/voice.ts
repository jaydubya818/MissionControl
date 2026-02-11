/**
 * Voice Synthesis Functions
 *
 * Convex actions for TTS synthesis and voice artifact management.
 * Uses ElevenLabs as the first TTS provider; audio stored in Convex file storage.
 */

import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List voice artifacts for an agent or project.
 */
export const listArtifacts = query({
  args: {
    agentId: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.agentId) {
      return await ctx.db
        .query("voiceArtifacts")
        .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
        .order("desc")
        .take(limit);
    }
    if (args.projectId) {
      return await ctx.db
        .query("voiceArtifacts")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("voiceArtifacts")
      .order("desc")
      .take(limit);
  },
});

/**
 * Get a single voice artifact.
 */
export const getArtifact = query({
  args: {
    artifactId: v.id("voiceArtifacts"),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return null;

    // If audio is in Convex file storage, generate a URL
    let audioUrl = artifact.audioUrl;
    if (artifact.audioStorageId) {
      audioUrl = await ctx.storage.getUrl(artifact.audioStorageId as any) ?? undefined;
    }

    return { ...artifact, audioUrl };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Store a voice artifact record.
 */
export const storeArtifact = mutation({
  args: {
    agentId: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    text: v.string(),
    transcript: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    audioStorageId: v.optional(v.string()),
    provider: v.union(v.literal("ELEVENLABS"), v.literal("OTHER")),
    voiceId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    linkedMessageId: v.optional(v.id("telegraphMessages")),
    linkedMeetingId: v.optional(v.id("meetings")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("voiceArtifacts", {
      ...args,
      metadata: {},
    });
  },
});

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Synthesize speech using ElevenLabs and store the result.
 * Requires ELEVENLABS_API_KEY environment variable.
 */
export const synthesize = action({
  args: {
    text: v.string(),
    agentId: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    voiceId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    stability: v.optional(v.number()),
    similarityBoost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY environment variable is required for voice synthesis");
    }

    const voiceId = args.voiceId ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel default
    const modelId = args.modelId ?? "eleven_multilingual_v2";

    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: args.text,
          model_id: modelId,
          voice_settings: {
            stability: args.stability ?? 0.5,
            similarity_boost: args.similarityBoost ?? 0.75,
            style: 0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errorBody}`);
    }

    // Store audio in Convex file storage
    const audioBlob = await response.blob();
    const storageId = await ctx.storage.store(audioBlob);

    // Create artifact record
    const artifactId = await ctx.runMutation(
      // @ts-expect-error -- internal reference
      "voice:storeArtifact",
      {
        agentId: args.agentId,
        projectId: args.projectId,
        text: args.text,
        transcript: args.text,
        audioStorageId: storageId,
        provider: "ELEVENLABS" as const,
        voiceId,
      }
    );

    return {
      artifactId,
      storageId,
      characterCount: args.text.length,
    };
  },
});
