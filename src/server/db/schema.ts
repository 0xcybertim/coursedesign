import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull().default("workos"),
    providerTenantId: text("provider_tenant_id").notNull(),
    providerSubject: text("provider_subject").notNull(),
    email: text("email"),
    displayName: text("display_name"),
    emailVerified: boolean("email_verified").notNull().default(false),
    state: text("state").notNull().default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_uidx").on(
      table.provider,
      table.providerTenantId,
      table.providerSubject,
    ),
    index("auth_identities_email_idx").on(table.email),
    check("auth_identities_provider_check", sql`${table.provider} = 'workos'`),
    check(
      "auth_identities_provider_values_check",
      sql`char_length(${table.providerTenantId}) between 3 and 255
        and char_length(${table.providerSubject}) between 3 and 255`,
    ),
    check(
      "auth_identities_email_check",
      sql`${table.email} is null or (
        ${table.email} = lower(btrim(${table.email}))
        and char_length(${table.email}) between 3 and 320
      )`,
    ),
    check(
      "auth_identities_state_check",
      sql`${table.state} in ('active', 'deletion_pending', 'deleted')`,
    ),
    check(
      "auth_identities_deleted_state_check",
      sql`(${table.state} = 'deleted') = (${table.deletedAt} is not null)`,
    ),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authIdentityId: uuid("auth_identity_id").references(
      () => authIdentities.id,
      {
        onDelete: "restrict",
      },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_auth_identity_uidx")
      .on(table.authIdentityId)
      .where(sql`${table.authIdentityId} is not null`),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    displayName: text("display_name").notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retirementReason: text("retirement_reason"),
    ...timestamps,
  },
  (table) => [
    check(
      "workspaces_retirement_state_check",
      sql`(
        ${table.retiredAt} is null and ${table.retirementReason} is null
      ) or (
        ${table.retiredAt} is not null
        and ${table.retirementReason} in (
          'unverified_selector_retired',
          'account_deletion_requested',
          'administrator_retired'
        )
      )`,
    ),
  ],
);

export const authSessionObservations = pgTable(
  "auth_session_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authIdentityId: uuid("auth_identity_id")
      .notNull()
      .references(() => authIdentities.id, { onDelete: "restrict" }),
    providerSessionDigest: text("provider_session_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("auth_session_observations_digest_uidx").on(
      table.providerSessionDigest,
    ),
    index("auth_session_observations_identity_expiry_idx").on(
      table.authIdentityId,
      table.expiresAt,
    ),
    index("auth_session_observations_maintenance_idx").on(
      table.expiresAt,
      table.revokedAt,
    ),
    check(
      "auth_session_observations_digest_check",
      sql`${table.providerSessionDigest} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const authRevokedProviderSessions = pgTable(
  "auth_revoked_provider_sessions",
  {
    providerSessionDigest: text("provider_session_digest").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_revoked_provider_sessions_expiry_idx").on(table.expiresAt),
    check(
      "auth_revoked_provider_sessions_digest_check",
      sql`${table.providerSessionDigest} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const authWebhookEvents = pgTable(
  "auth_webhook_events",
  {
    eventDigest: text("event_digest").primaryKey(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "auth_webhook_events_digest_check",
      sql`${table.eventDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "auth_webhook_events_type_check",
      sql`${table.eventType} ~ '^[a-z0-9_.]{3,100}$'`,
    ),
  ],
);

export const authAuditEvents = pgTable(
  "auth_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorAuthIdentityId: uuid("actor_auth_identity_id").references(
      () => authIdentities.id,
      { onDelete: "set null" },
    ),
    providerSessionDigest: text("provider_session_digest"),
    eventType: text("event_type").notNull(),
    subjectDigest: text("subject_digest"),
    outcome: text("outcome").notNull(),
    metadata: jsonb("metadata")
      .$type<Readonly<Record<string, string | number | boolean | null>>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_audit_events_actor_created_idx").on(
      table.actorAuthIdentityId,
      table.createdAt,
    ),
    index("auth_audit_events_created_idx").on(table.createdAt),
    check(
      "auth_audit_events_event_type_check",
      sql`${table.eventType} ~ '^[a-z0-9_]{3,80}$'`,
    ),
    check(
      "auth_audit_events_session_digest_check",
      sql`${table.providerSessionDigest} is null
        or ${table.providerSessionDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "auth_audit_events_subject_digest_check",
      sql`${table.subjectDigest} is null
        or ${table.subjectDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "auth_audit_events_outcome_check",
      sql`${table.outcome} in ('success', 'failure', 'requested')`,
    ),
    check(
      "auth_audit_events_metadata_object_check",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
  ],
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").notNull().default("owner"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.userId],
      name: "workspace_memberships_pk",
    }),
    check("workspace_memberships_role_check", sql`${table.role} in ('owner')`),
    index("workspace_memberships_user_idx").on(table.userId, table.workspaceId),
  ],
);

export const provisionalEmailSelectors = pgTable(
  "provisional_email_selectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    emailNormalized: text("email_normalized").notNull(),
    status: text("status").notNull().default("active"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provisional_email_selectors_email_uidx").on(
      table.emailNormalized,
    ),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.userId,
      ],
      name: "provisional_email_selectors_membership_fk",
    }).onDelete("restrict"),
    check(
      "provisional_email_selectors_email_check",
      sql`${table.emailNormalized} = lower(btrim(${table.emailNormalized}))
        and char_length(${table.emailNormalized}) between 3 and 320`,
    ),
    check(
      "provisional_email_selectors_status_check",
      sql`${table.status} in ('active', 'claimed', 'disabled')`,
    ),
  ],
);

export const provisionalSessions = pgTable(
  "provisional_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull(),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.userId,
      ],
      name: "provisional_sessions_membership_fk",
    }).onDelete("restrict"),
    uniqueIndex("provisional_sessions_digest_uidx").on(table.tokenDigest),
    index("provisional_sessions_maintenance_idx").on(
      table.expiresAt,
      table.revokedAt,
    ),
    check(
      "provisional_sessions_digest_check",
      sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const designs = pgTable(
  "designs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    legacyRouteKey: text("legacy_route_key").notNull(),
    familyId: text("family_id").notNull(),
    displayName: text("display_name").notNull(),
    draftSnapshot: jsonb("draft_snapshot").$type<unknown>().notNull(),
    domainSchemaVersion: text("domain_schema_version").notNull(),
    lockVersion: integer("lock_version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("designs_workspace_route_uidx").on(
      table.workspaceId,
      table.legacyRouteKey,
    ),
    uniqueIndex("designs_workspace_id_uidx").on(table.workspaceId, table.id),
    index("designs_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    check("designs_lock_version_check", sql`${table.lockVersion} >= 1`),
  ],
);

export const designRevisions = pgTable(
  "design_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    designId: uuid("design_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    name: text("name").notNull(),
    configurationHash: text("configuration_hash").notNull(),
    domainSchemaVersion: text("domain_schema_version").notNull(),
    snapshot: jsonb("snapshot").$type<unknown>().notNull(),
    renderArtworkHashes: text("render_artwork_hashes")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.designId],
      foreignColumns: [designs.workspaceId, designs.id],
      name: "design_revisions_workspace_design_fk",
    }).onDelete("restrict"),
    uniqueIndex("design_revisions_design_ordinal_uidx").on(
      table.designId,
      table.ordinal,
    ),
    uniqueIndex("design_revisions_workspace_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    index("design_revisions_design_cursor_idx").on(
      table.designId,
      table.ordinal,
      table.id,
    ),
    check("design_revisions_ordinal_check", sql`${table.ordinal} >= 1`),
    check(
      "design_revisions_configuration_hash_check",
      sql`${table.configurationHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    legacyRouteKey: text("legacy_route_key").notNull(),
    name: text("name").notNull(),
    draftSnapshot: jsonb("draft_snapshot").$type<unknown>().notNull(),
    domainSchemaVersion: text("domain_schema_version").notNull(),
    lockVersion: integer("lock_version").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("courses_workspace_route_uidx").on(
      table.workspaceId,
      table.legacyRouteKey,
    ),
    index("courses_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    check("courses_lock_version_check", sql`${table.lockVersion} >= 1`),
  ],
);

export const artworkAssets = pgTable(
  "artwork_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    contentHash: text("content_hash").notNull(),
    crc32c: text("crc32c").notNull(),
    detectedMediaType: text("detected_media_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    pixelWidth: integer("pixel_width").notNull(),
    pixelHeight: integer("pixel_height").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    objectGeneration: text("object_generation").notNull(),
    state: text("state").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("artwork_assets_workspace_hash_uidx").on(
      table.workspaceId,
      table.contentHash,
    ),
    uniqueIndex("artwork_assets_workspace_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    check(
      "artwork_assets_content_hash_check",
      sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "artwork_assets_media_type_check",
      sql`${table.detectedMediaType} in ('image/png')`,
    ),
    check(
      "artwork_assets_dimensions_check",
      sql`${table.byteLength} > 0 and ${table.pixelWidth} > 0 and ${table.pixelHeight} > 0`,
    ),
    check(
      "artwork_assets_state_check",
      sql`${table.state} in ('pending', 'available', 'failed')`,
    ),
  ],
);

export const operationIdempotency = pgTable(
  "operation_idempotency",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    operationKind: text("operation_kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    resultRecordId: uuid("result_record_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.operationKind, table.idempotencyKey],
      name: "operation_idempotency_pk",
    }),
    index("operation_idempotency_expiry_idx").on(table.expiresAt),
    check(
      "operation_idempotency_fingerprint_check",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "operation_idempotency_key_check",
      sql`char_length(${table.idempotencyKey}) between 8 and 200`,
    ),
  ],
);
