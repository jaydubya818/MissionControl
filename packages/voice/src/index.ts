/**
 * @mission-control/voice
 *
 * Voice synthesis and avatar providers for Mission Control agents.
 * Supports vendor-swappable TTS (ElevenLabs first) and avatar rendering.
 */

export { ElevenLabsProvider } from "./elevenlabs";
export { DefaultAvatarProvider } from "./defaultAvatar";
export type {
  TTSProvider,
  TTSOptions,
  TTSResult,
  Voice,
  AvatarProvider,
  AvatarAnimationState,
} from "@mission-control/shared";
