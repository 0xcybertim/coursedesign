import type { PersistenceResult } from "./result";

export interface ProvisionalWorkspaceSummary {
  readonly displayName: string;
  readonly warning: string;
}

export interface ValidatedSessionContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly membershipRole: "owner";
  readonly expiresAt: string;
}

export interface WorkspaceSelection {
  readonly sessionToken: string;
  readonly session: ValidatedSessionContext;
  readonly workspace: ProvisionalWorkspaceSummary;
}

export interface ProvisionalIdentityService {
  selectWorkspace(input: {
    readonly email: unknown;
    readonly previousSessionToken?: string;
  }): Promise<PersistenceResult<WorkspaceSelection>>;
  validateSession(
    sessionToken: string,
  ): Promise<PersistenceResult<ValidatedSessionContext>>;
  clearSession(sessionToken: string): Promise<PersistenceResult<null>>;
}
