/**
 * Meeting Types
 *
 * Meeting orchestration with agenda, notes, and action-item-to-task conversion.
 */

export type MeetingStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type MeetingProviderType = "MANUAL" | "ZOOM";

export interface MeetingParticipant {
  agentId: string;
  orgPosition?: string;
  role?: string; // host, presenter, attendee
}

export interface MeetingActionItem {
  description: string;
  assigneeAgentId?: string;
  taskId?: string;
  dueAt?: number;
  completed: boolean;
}

export interface Meeting {
  _id: string;
  _creationTime: number;
  projectId?: string;
  title: string;
  agenda?: string;
  scheduledAt: number;
  duration: number; // minutes
  status: MeetingStatus;
  hostAgentId?: string;
  participants: MeetingParticipant[];
  provider: MeetingProviderType;
  externalMeetingRef?: string;
  notesDocPath?: string;
  notes?: string;
  actionItems?: MeetingActionItem[];
  calendarPayload?: string;
  metadata?: Record<string, any>;
}

/**
 * MeetingProvider interface -- implementations can be swapped (Manual, Zoom, etc.)
 */
export interface MeetingProvider {
  scheduleMeeting(options: ScheduleMeetingOptions): Promise<MeetingResult>;
  generateAgenda(meeting: Meeting): Promise<string>;
  generateNotes(meeting: Meeting): Promise<string>;
  extractActionItems(notes: string): Promise<MeetingActionItem[]>;
  getCalendarPayload(meeting: Meeting): Promise<string>;
}

export interface ScheduleMeetingOptions {
  projectId?: string;
  title: string;
  scheduledAt: number;
  duration: number;
  hostAgentId?: string;
  participants: MeetingParticipant[];
  agendaTopics?: string[];
}

export interface MeetingResult {
  meetingId: string;
  status: MeetingStatus;
  agenda: string;
  calendarPayload: string;
}
