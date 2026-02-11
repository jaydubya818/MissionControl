/**
 * @mission-control/telegraph
 *
 * Async messaging providers for Mission Control agent communications.
 * Internal provider stores in Convex; Telegram provider bridges to external.
 */

export { InternalTelegraphProvider } from "./internal";
export { TelegramTelegraphProvider } from "./telegram";
export type {
  TelegraphProvider,
  TelegraphSendOptions,
  TelegraphGetOptions,
  TelegraphCreateThreadOptions,
  TelegraphMessageResult,
  TelegraphChannel,
  MessageStatus,
  SenderType,
} from "@mission-control/shared";
