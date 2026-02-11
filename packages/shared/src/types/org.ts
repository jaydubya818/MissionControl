/**
 * Org Model Types
 *
 * Hierarchical organization: Organization -> Projects -> Squads -> Agents
 */

export type OrgPosition = "CEO" | "LEAD" | "SPECIALIST" | "INTERN";
export type OrgScope = "PROJECT" | "SQUAD" | "REPO";

export interface OrgAssignment {
  _id: string;
  _creationTime: number;
  agentId: string;
  projectId: string;
  orgPosition: OrgPosition;
  scope: OrgScope;
  scopeRef?: string;
  assignedBy?: string;
  assignedAt: number;
  metadata?: Record<string, any>;
}

export interface ProjectOrgChart {
  projectId: string;
  projectName: string;
  ceo?: OrgAssignment;
  leads: OrgAssignment[];
  specialists: OrgAssignment[];
  interns: OrgAssignment[];
}
