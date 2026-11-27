import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {TaskCompletionActions} from './TaskCompletionActions';
afterEach(cleanup);
const show=(approvals:any[],status='REVIEW')=>{const request=vi.fn(),complete=vi.fn();render(<TaskCompletionActions status={status} approvals={approvals} loading={false} onRequestApproval={request} onComplete={complete}/>);return{request,complete};};
const approved={status:'APPROVED',actionType:'TASK_COMPLETION',riskLevel:'YELLOW',decisionIdentityVersion:'authenticated-operator/v1',decidedByOperatorId:'operator-one',decidedByUserId:'subject-one',decisionCount:1};
describe('Task review approval recovery',()=>{
 it('offers a new decision for an unsigned historical approval',()=>{const {request}=show([{status:'APPROVED',actionType:'TASK_COMPLETION',riskLevel:'YELLOW'}]);fireEvent.click(screen.getByRole('button',{name:'Request approval'}));expect(request).toHaveBeenCalledOnce();expect(screen.queryByText('Accept and mark done')).toBeNull();});
 it('does not let another action approval hide a Task completion request',()=>{show([{...approved,actionType:'WORKFLOW_STEP_RETRY'}],'NEEDS_APPROVAL');expect(screen.getByRole('button',{name:'Request approval'})).toBeEnabled();});
 it('keeps an actual pending completion decision visible',()=>{show([{status:'PENDING',actionType:'TASK_COMPLETION',riskLevel:'YELLOW'}]);expect(screen.getByRole('button',{name:'Awaiting approval'})).toBeDisabled();});
 it('enables completion of a Task awaiting its qualified decision',()=>{const {complete}=show([approved],'NEEDS_APPROVAL');fireEvent.click(screen.getByRole('button',{name:'Accept and mark done'}));expect(complete).toHaveBeenCalledOnce();});
 it('requires distinct operator and subject for RED dual control',()=>{show([{...approved,riskLevel:'RED',decisionCount:2,firstDecisionOperatorId:'operator-one',firstDecisionByUserId:'subject-one'}]);expect(screen.getByRole('button',{name:'Request approval'})).toBeEnabled();});
});
