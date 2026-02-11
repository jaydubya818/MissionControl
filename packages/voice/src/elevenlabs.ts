/**
 * ElevenLabs TTS Provider
 *
 * First concrete TTSProvider implementation.
 * Uses the ElevenLabs REST API for text-to-speech synthesis.
 */

import type { TTSProvider, TTSOptions, TTSResult, Voice } from "@mission-control/shared";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export interface ElevenLabsConfig {
  apiKey: string;
  defaultModelId?: string;
  defaultVoiceId?: string;
}

export class ElevenLabsProvider implements TTSProvider {
  private apiKey: string;
  private defaultModelId: string;
  private defaultVoiceId: string;

  constructor(config: ElevenLabsConfig) {
    this.apiKey = config.apiKey;
    this.defaultModelId = config.defaultModelId ?? "eleven_multilingual_v2";
    this.defaultVoiceId = config.defaultVoiceId ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
  }

  async synthesize(text: string, options: TTSOptions): Promise<TTSResult> {
    const voiceId = options.voiceId || this.defaultVoiceId;
    const modelId = options.modelId || this.defaultModelId;

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: options.outputFormat === "pcm_16000" ? "audio/pcm" : "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: options.stability ?? 0.5,
            similarity_boost: options.similarityBoost ?? 0.75,
            style: options.style ?? 0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `ElevenLabs API error (${response.status}): ${errorBody}`
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "audio/mpeg";

    return {
      audioBuffer,
      contentType,
      characterCount: text.length,
      // Duration not returned by API; can be estimated from buffer size
      durationMs: undefined,
    };
  }

  async listVoices(): Promise<Voice[]> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      headers: {
        "xi-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error (${response.status})`);
    }

    const data = await response.json();
    return (data.voices ?? []).map((v: any) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.description,
      previewUrl: v.preview_url,
      labels: v.labels,
    }));
  }

  async getVoice(voiceId: string): Promise<Voice | null> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/voices/${voiceId}`, {
      headers: {
        "xi-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`ElevenLabs API error (${response.status})`);
    }

    const v = await response.json();
    return {
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.description,
      previewUrl: v.preview_url,
      labels: v.labels,
    };
  }
}
