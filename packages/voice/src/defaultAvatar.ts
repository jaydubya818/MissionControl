/**
 * Default Avatar Provider
 *
 * Uses the agent's emoji as a fallback avatar.
 * Provides CSS animation state for speaking indicators.
 */

import type { AvatarProvider, AvatarAnimationState } from "@mission-control/shared";

export class DefaultAvatarProvider implements AvatarProvider {
  /**
   * Returns the avatar URL for an agent.
   * Falls back to a data URI SVG of the agent's emoji.
   */
  async getAvatarUrl(agentId: string, emoji?: string): Promise<string> {
    const displayEmoji = emoji ?? "🤖";
    // Generate a simple SVG with the emoji centered
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="12" fill="#1e293b"/>
      <text x="50" y="65" font-size="50" text-anchor="middle" dominant-baseline="middle">${displayEmoji}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
  }

  /**
   * Returns the animation state based on whether the agent is speaking.
   */
  getAnimationState(speaking: boolean): AvatarAnimationState {
    if (speaking) {
      return {
        scale: 1.05,
        opacity: 1.0,
        glowColor: "#3b82f6",
        pulseSpeed: 600,
      };
    }
    return {
      scale: 1.0,
      opacity: 0.85,
      glowColor: undefined,
      pulseSpeed: undefined,
    };
  }
}
