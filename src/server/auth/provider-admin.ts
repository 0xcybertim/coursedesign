import "server-only";

export interface AuthenticationProviderAdmin {
  deleteUser(subject: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
}

let testAdmin: AuthenticationProviderAdmin | undefined;

const workosAdmin: AuthenticationProviderAdmin = {
  async deleteUser(subject) {
    const { getWorkOS } = await import("@workos-inc/authkit-nextjs");
    await getWorkOS().userManagement.deleteUser(subject);
  },
  async revokeSession(sessionId) {
    const { getWorkOS } = await import("@workos-inc/authkit-nextjs");
    await getWorkOS().userManagement.revokeSession({ sessionId });
  },
};

export function authenticationProviderAdmin(): AuthenticationProviderAdmin {
  if (testAdmin) return testAdmin;
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_ACCEPTANCE_TEST_MODE === "true"
  ) {
    return {
      async deleteUser() {},
      async revokeSession() {},
    };
  }
  return workosAdmin;
}

export function setAuthenticationProviderAdminForTests(
  admin: AuthenticationProviderAdmin | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "The authentication provider test admin is forbidden in production.",
    );
  }
  testAdmin = admin;
}
