import type { Doc } from '../../../../convex/_generated/dataModel';
import { isTaskCompletionApproval } from '../../../../convex/lib/approvalProof';
import { Button } from '@/components/ui/button';

/** Use the server's proof rule so historical display labels cannot strand review. */
export function TaskCompletionActions({status,approvals,loading,onComplete,onRequestApproval}:{
  status:string;approvals:Doc<'approvals'>[];loading:boolean;onComplete:()=>void;onRequestApproval:()=>void;
}) {
  if (!['REVIEW','NEEDS_APPROVAL'].includes(status)) return null;
  const approved=approvals.some(isTaskCompletionApproval);
  const pending=approvals.some(row=>row.actionType==='TASK_COMPLETION'&&['PENDING','ESCALATED'].includes(row.status));
  if (approved) return <Button size="sm" onClick={onComplete} disabled={loading}>Accept and mark done</Button>;
  if (pending) return <Button size="sm" variant="outline" disabled>Awaiting approval</Button>;
  return <Button size="sm" onClick={onRequestApproval} disabled={loading}>Request approval</Button>;
}
