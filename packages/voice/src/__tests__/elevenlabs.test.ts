/**
 * ElevenLabs TTS Provider Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ElevenLabsProvider } from "../elevenlabs";
import { DefaultAvatarProvider } from "../defaultAvatar";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("ElevenLabsProvider", () => {
  let provider: ElevenLabsProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ElevenLabsProvider({
      apiKey: "test-api-key",
      defaultModelId: "eleven_multilingual_v2",
      defaultVoiceId: "test-voice-id",
    });
  });

  describe("synthesize", () => {
    it("should call ElevenLabs API with correct parameters", async () => {
      const audioData = new ArrayBuffer(100);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioData),
        headers: new Headers({ "content-type": "audio/mpeg" }),
      });

      const result = await provider.synthesize("Hello world", {
        voiceId: "custom-voice",
        stability: 0.7,
        similarityBoost: 0.8,
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.elevenlabs.io/v1/text-to-speech/custom-voice",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "xi-api-key": "test-api-key",
          }),
        })
      );

      expect(result.audioBuffer).toBe(audioData);
      expect(result.contentType).toBe("audio/mpeg");
      expect(result.characterCount).toBe(11);
    });

    it("should use default voice when not specified", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(50)),
        headers: new Headers({ "content-type": "audio/mpeg" }),
      });

      await provider.synthesize("Test", { voiceId: "" });

      // Should use default voice ID from constructor
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("test-voice-id"),
        expect.any(Object)
      );
    });

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      await expect(
        provider.synthesize("Hello", { voiceId: "test" })
      ).rejects.toThrow("ElevenLabs API error (401)");
    });
  });

  describe("listVoices", () => {
    it("should return formatted voice list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            voices: [
              {
                voice_id: "v1",
                name: "Rachel",
                category: "premade",
                description: "Calm voice",
                preview_url: "https://example.com/preview.mp3",
                labels: { accent: "american" },
              },
            ],
          }),
      });

      const voices = await provider.listVoices();
      expect(voices).toHaveLength(1);
      expect(voices[0]).toEqual({
        voiceId: "v1",
        name: "Rachel",
        category: "premade",
        description: "Calm voice",
        previewUrl: "https://example.com/preview.mp3",
        labels: { accent: "american" },
      });
    });
  });

  describe("getVoice", () => {
    it("should return null for 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const voice = await provider.getVoice("nonexistent");
      expect(voice).toBeNull();
    });
  });
});

describe("DefaultAvatarProvider", () => {
  let provider: DefaultAvatarProvider;

  beforeEach(() => {
    provider = new DefaultAvatarProvider();
  });

  describe("getAvatarUrl", () => {
    it("should return data URI SVG with emoji", async () => {
      const url = await provider.getAvatarUrl("agent-1", "🤖");
      expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it("should use default emoji when none provided", async () => {
      const url = await provider.getAvatarUrl("agent-1");
      expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
    });
  });

  describe("getAnimationState", () => {
    it("should return speaking state when active", () => {
      const state = provider.getAnimationState(true);
      expect(state.scale).toBe(1.05);
      expect(state.opacity).toBe(1.0);
      expect(state.glowColor).toBe("#3b82f6");
      expect(state.pulseSpeed).toBe(600);
    });

    it("should return idle state when not speaking", () => {
      const state = provider.getAnimationState(false);
      expect(state.scale).toBe(1.0);
      expect(state.opacity).toBe(0.85);
      expect(state.glowColor).toBeUndefined();
      expect(state.pulseSpeed).toBeUndefined();
    });
  });
});
