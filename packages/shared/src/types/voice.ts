/**
 * Voice + Avatar Types
 *
 * TTS synthesis and avatar animation for agent communications.
 */

export type VoiceProvider = "ELEVENLABS" | "OTHER";

export interface VoiceArtifact {
  _id: string;
  _creationTime: number;
  agentId?: string;
  projectId?: string;
  text: string;
  transcript?: string;
  audioUrl?: string;
  audioStorageId?: string;
  provider: VoiceProvider;
  voiceId?: string;
  durationMs?: number;
  linkedMessageId?: string;
  linkedMeetingId?: string;
  metadata?: Record<string, any>;
}

/**
 * TTSProvider interface -- implementations can be swapped (ElevenLabs, Azure, etc.)
 */
export interface TTSProvider {
  synthesize(text: string, options: TTSOptions): Promise<TTSResult>;
  listVoices(): Promise<Voice[]>;
  getVoice(voiceId: string): Promise<Voice | null>;
}

export interface TTSOptions {
  voiceId: string;
  modelId?: string;
  stability?: number;       // 0.0 - 1.0
  similarityBoost?: number; // 0.0 - 1.0
  style?: number;           // 0.0 - 1.0
  outputFormat?: string;    // mp3_44100_128, pcm_16000, etc.
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
  contentType: string;
  durationMs?: number;
  characterCount: number;
}

export interface Voice {
  voiceId: string;
  name: string;
  category?: string;
  description?: string;
  previewUrl?: string;
  labels?: Record<string, string>;
}

/**
 * AvatarProvider interface -- renders agent visual representation.
 */
export interface AvatarProvider {
  getAvatarUrl(agentId: string, emoji?: string): Promise<string>;
  getAnimationState(speaking: boolean): AvatarAnimationState;
}

export interface AvatarAnimationState {
  scale: number;
  opacity: number;
  glowColor?: string;
  pulseSpeed?: number; // ms per cycle
}
