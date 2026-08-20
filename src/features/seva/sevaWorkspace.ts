import { createSevaWorkspaceInitialState } from './state';
import { createAuthAndBootstrapMethods } from './authAndBootstrap';
import { createLeadLifecycleMethods } from './leadLifecycle';
import { createProgramMethods } from './programs';
import { createDateAndFilterMethods } from './dateAndFilter';
import { createUiMethods } from './uiMethods';
import { createCommunicationMethods } from './communications';
import { createRecordActionMethods } from './recordActions';
import { createCourseWorkspaceMethods } from '../courses/courseWorkspace';
import type { SevaWorkspaceContext } from './types';

export function sevaWorkspace(): SevaWorkspaceContext {
  return {
    ...createSevaWorkspaceInitialState(),
    ...createAuthAndBootstrapMethods(),
    ...createLeadLifecycleMethods(),
    ...createProgramMethods(),
    ...createDateAndFilterMethods(),
    ...createUiMethods(),
    ...createRecordActionMethods(),
    ...createCommunicationMethods(),
    ...createCourseWorkspaceMethods()
  };
}
