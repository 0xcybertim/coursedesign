import { sql } from "drizzle-orm";
import {
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

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

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
