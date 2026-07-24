import 'reflect-metadata';
import { REQUIRE_MENU_KEY, MenuRequirement } from '../../common/guards/menu.guard';
import { ApprovalEngineController } from './approval-engine.controller';
import { ApprovalEngineService } from './approval-engine.service';
import { WorkflowTaskController } from '../workflow/workflow-task.controller';

function requirement(target: object, method: string): MenuRequirement | undefined {
  const handler = (target as Record<string, object>)[method];
  return Reflect.getMetadata(REQUIRE_MENU_KEY, handler);
}

describe('approval action menu gates', () => {
  it.each(['approve', 'reject'])(
    'uses todo visibility for ApprovalEngineController.%s and leaves assignment authorization to the service',
    (method) => {
      expect(requirement(ApprovalEngineController.prototype, method)).toEqual({
        menu: 'MENU_WORKFLOW_TODO',
        perm: 'V',
        altMenus: undefined,
        denialMessage: undefined,
      });
    },
  );

  it.each(['approve', 'reject', 'return', 'countersign'])(
    'uses todo visibility for WorkflowTaskController.%s and leaves task ownership authorization to the service',
    (method) => {
      expect(requirement(WorkflowTaskController.prototype, method)).toEqual({
        menu: 'MENU_WORKFLOW_TODO',
        perm: 'V',
        altMenus: undefined,
        denialMessage: undefined,
      });
    },
  );

  it('keeps exact assignee authorization after the duplicate menu action bit is removed', () => {
    const service = Object.create(ApprovalEngineService.prototype) as ApprovalEngineService;
    const validateApprover = (
      service as unknown as {
        validateApprover(step: object, userId: string, roles: string[]): void;
      }
    ).validateApprover.bind(service);

    expect(() => validateApprover({
      id: 'step-1',
      instanceId: 'instance-1',
      approverType: 'USER',
      approverUserId: '88',
      allowAdminOverride: false,
    }, '88', ['ROLE_STORE_MANAGER'])).not.toThrow();

    expect(() => validateApprover({
      id: 'step-1',
      instanceId: 'instance-1',
      approverType: 'USER',
      approverUserId: '88',
      allowAdminOverride: false,
    }, '89', ['ROLE_STORE_MANAGER'])).toThrow('APPROVER_USER_MISMATCH');
  });
});
