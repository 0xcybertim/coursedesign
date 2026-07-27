export interface WorkspaceSummary {
  readonly displayName: string;
}

export interface ValidatedSessionContext {
  readonly authIdentityId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly membershipRole: "owner";
  readonly expiresAt: string;
  readonly authenticatedAt: string;
}
