/**
 * @mission-control/meetings
 *
 * Meeting orchestration providers for Mission Control.
 * Manual provider generates markdown docs; Zoom provider planned.
 */

export { ManualMeetingProvider } from "./manual";
export type {
  MeetingProvider,
  Meeting,
  MeetingActionItem,
  MeetingParticipant,
  MeetingStatus,
  MeetingProviderType,
  ScheduleMeetingOptions,
  MeetingResult,
} from "@mission-control/shared";
