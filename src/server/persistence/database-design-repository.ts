import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, lt, max, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import {
  LOCAL_WORKSPACE_SCHEMA_VERSION,
  LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION,
  createLocalDesignLibrary,
  deriveConfiguration,
  referencedRenderableArtworkHashes,
  saveProfileWingRevision,
  stableHash,
  type LocalDesignRevision,
  type ObstacleDesignRevision,
} from "@/domain/design";
import type {
  AppendFinalProfileWingRevisionInput,
  AppendStarterRevisionInput,
  DesignRecord,
  DesignRepository,
  DesignRevisionPage,
  SaveDesignDraftInput,
} from "@/persistence/design-repository";
import { STARTER_DESIGN_ROUTE_KEY } from "@/persistence/design-repository";
import type { ValidatedSessionContext } from "@/persistence/identity-service";
import {
  persistenceFailure,
  staleVersionFailure,
  type PersistenceResult,
} from "@/persistence/result";
import * as schema from "@/server/db/schema";

import {
  validateDesignRow,
  validateObstacleRevisionRow,
  validateProfileRevisionRow,
} from "./record-validation";

const REVISION_OPERATION = "design_revision_append";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RevisionCursor {
  readonly createdAt: string;
  readonly id: string;
}

function encodeCursor(cursor: RevisionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): RevisionCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<RevisionCursor>;
    if (
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !UUID_PATTERN.test(parsed.id)
    ) {
      return null;
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function safeTemporaryFailure<T>(): PersistenceResult<T> {
  return persistenceFailure(
    "temporarily_unavailable",
    "Server design persistence is temporarily unavailable. Try again.",
  );
}

export class DatabaseDesignRepository implements DesignRepository {
  private readonly database;
  private readonly now: () => Date;

  constructor(
    pool: Pool,
    private readonly session: ValidatedSessionContext,
    options: { readonly now?: () => Date } = {},
  ) {
    this.database = drizzle(pool, { schema });
    this.now = options.now ?? (() => new Date());
  }

  private async loadDesignRow() {
    const [row] = await this.database
      .select()
      .from(schema.designs)
      .where(
        and(
          eq(schema.designs.workspaceId, this.session.workspaceId),
          eq(schema.designs.legacyRouteKey, STARTER_DESIGN_ROUTE_KEY),
          isNull(schema.designs.archivedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async loadDesign(
    routeKey: typeof STARTER_DESIGN_ROUTE_KEY,
  ): Promise<PersistenceResult<DesignRecord>> {
    if (routeKey !== STARTER_DESIGN_ROUTE_KEY) {
      return persistenceFailure(
        "missing_reference",
        "That design is unavailable.",
      );
    }
    try {
      const row = await this.loadDesignRow();
      return row
        ? validateDesignRow(row)
        : persistenceFailure(
            "missing_reference",
            "That design is unavailable.",
          );
    } catch {
      return safeTemporaryFailure();
    }
  }

  async saveDraft(
    input: SaveDesignDraftInput,
  ): Promise<PersistenceResult<DesignRecord, DesignRecord>> {
    const derived = deriveConfiguration(input.draft.intent);
    if (!derived.ok) {
      return persistenceFailure(
        "validation",
        "The design draft failed domain validation.",
      );
    }
    const now = this.now();
    try {
      const [updated] = await this.database
        .update(schema.designs)
        .set({
          draftSnapshot: input.draft,
          lockVersion: input.expectedLockVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.designs.workspaceId, this.session.workspaceId),
            eq(schema.designs.legacyRouteKey, input.routeKey),
            eq(schema.designs.lockVersion, input.expectedLockVersion),
            isNull(schema.designs.archivedAt),
          ),
        )
        .returning();
      if (updated) return validateDesignRow(updated);
      const latestRow = await this.loadDesignRow();
      if (!latestRow) {
        return persistenceFailure(
          "missing_reference",
          "That design is unavailable.",
        );
      }
      const latest = validateDesignRow(latestRow);
      if (!latest.ok) return latest;
      return staleVersionFailure({
        expectedLockVersion: input.expectedLockVersion,
        actualLockVersion: latest.value.lockVersion,
        latest: latest.value,
      });
    } catch {
      return safeTemporaryFailure();
    }
  }

  async appendStarterRevision(input: AppendStarterRevisionInput): Promise<
    PersistenceResult<
      {
        readonly design: DesignRecord;
        readonly revision: ObstacleDesignRevision;
      },
      DesignRecord
    >
  > {
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200) {
      return persistenceFailure(
        "validation",
        "The revision idempotency key is invalid.",
      );
    }
    const requestedHashes = [
      ...new Set(input.referencedRenderableArtworkHashes),
    ].sort();
    if (requestedHashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) {
      return persistenceFailure(
        "validation",
        "A referenced canonical artwork hash is invalid.",
      );
    }
    const requestFingerprint = stableHash({
      routeKey: input.routeKey,
      expectedLockVersion: input.expectedLockVersion,
      name: input.name?.trim() || null,
      referencedRenderableArtworkHashes: requestedHashes,
    });
    const now = this.now();

    try {
      return await this.database.transaction(async (transaction) => {
        const [designRow] = await transaction
          .select()
          .from(schema.designs)
          .where(
            and(
              eq(schema.designs.workspaceId, this.session.workspaceId),
              eq(schema.designs.legacyRouteKey, input.routeKey),
              isNull(schema.designs.archivedAt),
            ),
          )
          .limit(1)
          .for("update");
        if (!designRow) {
          return persistenceFailure(
            "missing_reference",
            "That design is unavailable.",
          );
        }
        const design = validateDesignRow(designRow);
        if (!design.ok) return design;
        if (design.value.lockVersion !== input.expectedLockVersion) {
          return staleVersionFailure({
            expectedLockVersion: input.expectedLockVersion,
            actualLockVersion: design.value.lockVersion,
            latest: design.value,
          });
        }

        const [priorOperation] = await transaction
          .select()
          .from(schema.operationIdempotency)
          .where(
            and(
              eq(
                schema.operationIdempotency.workspaceId,
                this.session.workspaceId,
              ),
              eq(schema.operationIdempotency.operationKind, REVISION_OPERATION),
              eq(
                schema.operationIdempotency.idempotencyKey,
                input.idempotencyKey,
              ),
            ),
          )
          .limit(1);
        if (priorOperation) {
          if (priorOperation.requestFingerprint !== requestFingerprint) {
            return persistenceFailure(
              "validation",
              "That idempotency key was already used for a different revision request.",
            );
          }
          const [priorRevision] = await transaction
            .select()
            .from(schema.designRevisions)
            .where(
              and(
                eq(
                  schema.designRevisions.workspaceId,
                  this.session.workspaceId,
                ),
                eq(schema.designRevisions.id, priorOperation.resultRecordId),
              ),
            )
            .limit(1);
          if (!priorRevision) {
            return persistenceFailure(
              "corrupt_record",
              "The prior revision operation is incomplete.",
            );
          }
          const validated = validateObstacleRevisionRow({
            row: priorRevision,
            legacyRouteKey: designRow.legacyRouteKey,
            familyId: designRow.familyId,
          });
          return validated.ok
            ? {
                ok: true,
                value: {
                  design: design.value,
                  revision: validated.value,
                },
              }
            : validated;
        }

        const derived = deriveConfiguration(design.value.draft.intent);
        if (!derived.ok) {
          return persistenceFailure(
            "corrupt_record",
            "The saved design draft failed domain validation.",
          );
        }
        const artworkConfiguration =
          derived.value.configuration.artworkConfiguration;
        const requiredHashes = artworkConfiguration
          ? referencedRenderableArtworkHashes(artworkConfiguration)
          : [];
        if (
          requiredHashes.length !== requestedHashes.length ||
          requiredHashes.some((hash, index) => hash !== requestedHashes[index])
        ) {
          return persistenceFailure(
            "validation",
            "The canonical artwork references do not match the validated design.",
          );
        }
        if (requiredHashes.length > 0) {
          const assets = await transaction
            .select({ contentHash: schema.artworkAssets.contentHash })
            .from(schema.artworkAssets)
            .where(
              and(
                eq(schema.artworkAssets.workspaceId, this.session.workspaceId),
                eq(schema.artworkAssets.state, "available"),
                inArray(schema.artworkAssets.contentHash, requiredHashes),
              ),
            );
          if (assets.length !== requiredHashes.length) {
            return persistenceFailure(
              "asset_unavailable",
              "Required canonical artwork is not available in this workspace.",
            );
          }
        }

        const [ordinalRow] = await transaction
          .select({ ordinal: max(schema.designRevisions.ordinal) })
          .from(schema.designRevisions)
          .where(eq(schema.designRevisions.designId, designRow.id));
        const ordinal = (ordinalRow?.ordinal ?? 0) + 1;
        const [inserted] = await transaction
          .insert(schema.designRevisions)
          .values({
            workspaceId: this.session.workspaceId,
            designId: designRow.id,
            ordinal,
            name: input.name?.trim() || `Club Classic · Revision ${ordinal}`,
            configurationHash: derived.value.configurationHash,
            domainSchemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
            snapshot: derived.value,
            renderArtworkHashes: [...requiredHashes],
            createdAt: now,
          })
          .returning();
        if (!inserted) {
          return persistenceFailure(
            "temporarily_unavailable",
            "The immutable revision was not appended.",
          );
        }
        const revision = validateObstacleRevisionRow({
          row: inserted,
          legacyRouteKey: designRow.legacyRouteKey,
          familyId: designRow.familyId,
        });
        if (!revision.ok) return revision;
        await transaction.insert(schema.operationIdempotency).values({
          workspaceId: this.session.workspaceId,
          operationKind: REVISION_OPERATION,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          resultRecordId: inserted.id,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          createdAt: now,
        });
        return {
          ok: true,
          value: { design: design.value, revision: revision.value },
        };
      });
    } catch {
      return safeTemporaryFailure();
    }
  }

  async appendFinalProfileWingRevision(
    input: AppendFinalProfileWingRevisionInput,
  ): Promise<
    PersistenceResult<import("@/domain/design").ProfileWingDesignRevision>
  > {
    if (
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 200 ||
      !/^[0-9a-f]{64}$/.test(input.canonicalRenderHash)
    ) {
      return persistenceFailure(
        "validation",
        "The final Profile Wing revision request is invalid.",
      );
    }
    const now = this.now();
    const revisionId = randomUUID();
    const designRouteKey = `local-profile-wing-${input.prototype.source.fixtureId}`;
    const requestFingerprint = stableHash({
      designRouteKey,
      prototype: input.prototype,
      canonicalRenderHash: input.canonicalRenderHash,
      name: input.name?.trim() || null,
    });
    try {
      return await this.database.transaction(async (transaction) => {
        const [priorOperation] = await transaction
          .select()
          .from(schema.operationIdempotency)
          .where(
            and(
              eq(
                schema.operationIdempotency.workspaceId,
                this.session.workspaceId,
              ),
              eq(schema.operationIdempotency.operationKind, REVISION_OPERATION),
              eq(
                schema.operationIdempotency.idempotencyKey,
                input.idempotencyKey,
              ),
            ),
          )
          .limit(1);
        if (priorOperation) {
          if (priorOperation.requestFingerprint !== requestFingerprint) {
            return persistenceFailure(
              "validation",
              "That idempotency key was already used for a different revision request.",
            );
          }
          const [priorRevision] = await transaction
            .select({
              revision: schema.designRevisions,
              legacyRouteKey: schema.designs.legacyRouteKey,
              familyId: schema.designs.familyId,
            })
            .from(schema.designRevisions)
            .innerJoin(
              schema.designs,
              and(
                eq(schema.designs.id, schema.designRevisions.designId),
                eq(
                  schema.designs.workspaceId,
                  schema.designRevisions.workspaceId,
                ),
              ),
            )
            .where(
              and(
                eq(
                  schema.designRevisions.workspaceId,
                  this.session.workspaceId,
                ),
                eq(schema.designRevisions.id, priorOperation.resultRecordId),
              ),
            )
            .limit(1);
          return priorRevision
            ? validateProfileRevisionRow({
                row: priorRevision.revision,
                legacyRouteKey: priorRevision.legacyRouteKey,
                familyId: priorRevision.familyId,
              })
            : persistenceFailure(
                "corrupt_record",
                "The prior final Profile Wing operation is incomplete.",
              );
        }

        const [asset] = await transaction
          .select({ id: schema.artworkAssets.id })
          .from(schema.artworkAssets)
          .where(
            and(
              eq(schema.artworkAssets.workspaceId, this.session.workspaceId),
              eq(schema.artworkAssets.contentHash, input.canonicalRenderHash),
              eq(schema.artworkAssets.state, "available"),
            ),
          )
          .limit(1);
        if (!asset) {
          return persistenceFailure(
            "asset_unavailable",
            "The final canonical Profile Wing derivative is not available.",
          );
        }

        await transaction
          .insert(schema.designs)
          .values({
            workspaceId: this.session.workspaceId,
            legacyRouteKey: designRouteKey,
            familyId: "profile-wing-vertical-v1",
            displayName: input.prototype.displayName,
            draftSnapshot: input.prototype,
            domainSchemaVersion: input.prototype.schemaVersion,
            lockVersion: 1,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({
            target: [schema.designs.workspaceId, schema.designs.legacyRouteKey],
          });
        const [designRow] = await transaction
          .select()
          .from(schema.designs)
          .where(
            and(
              eq(schema.designs.workspaceId, this.session.workspaceId),
              eq(schema.designs.legacyRouteKey, designRouteKey),
            ),
          )
          .limit(1)
          .for("update");
        if (!designRow || designRow.familyId !== "profile-wing-vertical-v1") {
          return persistenceFailure(
            "corrupt_record",
            "The final Profile Wing design record is invalid.",
          );
        }
        const [ordinalRow] = await transaction
          .select({ ordinal: max(schema.designRevisions.ordinal) })
          .from(schema.designRevisions)
          .where(eq(schema.designRevisions.designId, designRow.id));
        const ordinal = (ordinalRow?.ordinal ?? 0) + 1;
        const localLibrary = createLocalDesignLibrary({
          now: now.toISOString(),
          draftId: "server-profile-validation-draft",
        });
        const validated = saveProfileWingRevision(localLibrary, {
          prototype: input.prototype,
          revisionId,
          now: now.toISOString(),
          ...(input.name ? { name: input.name } : {}),
        });
        if (!validated.ok) {
          return persistenceFailure("validation", validated.error.message);
        }
        const base = validated.value.profileWingRevisions[0];
        if (!base) {
          return persistenceFailure(
            "validation",
            "The final Profile Wing revision could not be derived.",
          );
        }
        const name =
          input.name?.trim() ||
          `${input.prototype.displayName} · ${input.prototype.source.fixtureId} · Revision ${ordinal}`;
        const [inserted] = await transaction
          .insert(schema.designRevisions)
          .values({
            id: revisionId,
            workspaceId: this.session.workspaceId,
            designId: designRow.id,
            ordinal,
            name,
            configurationHash: base.configurationHash,
            domainSchemaVersion: LOCAL_DESIGN_LIBRARY_SCHEMA_VERSION,
            snapshot: base.snapshot,
            renderArtworkHashes: [input.canonicalRenderHash],
            createdAt: now,
          })
          .returning();
        if (!inserted) {
          return persistenceFailure(
            "temporarily_unavailable",
            "The final Profile Wing revision was not appended.",
          );
        }
        await transaction.insert(schema.operationIdempotency).values({
          workspaceId: this.session.workspaceId,
          operationKind: REVISION_OPERATION,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          resultRecordId: inserted.id,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          createdAt: now,
        });
        return validateProfileRevisionRow({
          row: inserted,
          legacyRouteKey: designRouteKey,
          familyId: "profile-wing-vertical-v1",
        });
      });
    } catch {
      return safeTemporaryFailure();
    }
  }

  async listRevisions(input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<PersistenceResult<DesignRevisionPage>> {
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);
    const cursor = decodeCursor(input?.cursor);
    if (input?.cursor && !cursor) {
      return persistenceFailure(
        "validation",
        "The revision cursor is invalid.",
      );
    }
    try {
      const rows = await this.database
        .select({
          revision: schema.designRevisions,
          legacyRouteKey: schema.designs.legacyRouteKey,
          familyId: schema.designs.familyId,
        })
        .from(schema.designRevisions)
        .innerJoin(
          schema.designs,
          and(
            eq(schema.designs.id, schema.designRevisions.designId),
            eq(schema.designs.workspaceId, schema.designRevisions.workspaceId),
          ),
        )
        .where(
          and(
            eq(schema.designRevisions.workspaceId, this.session.workspaceId),
            isNull(schema.designs.archivedAt),
            cursor
              ? or(
                  lt(
                    schema.designRevisions.createdAt,
                    new Date(cursor.createdAt),
                  ),
                  and(
                    eq(
                      schema.designRevisions.createdAt,
                      new Date(cursor.createdAt),
                    ),
                    lt(schema.designRevisions.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(
          desc(schema.designRevisions.createdAt),
          desc(schema.designRevisions.id),
        )
        .limit(limit + 1);
      const pageRows = rows.slice(0, limit);
      const revisions: LocalDesignRevision[] = [];
      for (const row of pageRows) {
        const validated =
          row.familyId === "profile-wing-vertical-v1"
            ? validateProfileRevisionRow({
                row: row.revision,
                legacyRouteKey: row.legacyRouteKey,
                familyId: row.familyId,
              })
            : validateObstacleRevisionRow({
                row: row.revision,
                legacyRouteKey: row.legacyRouteKey,
                familyId: row.familyId,
              });
        if (!validated.ok) return validated;
        revisions.push(validated.value);
      }
      const last = pageRows.at(-1)?.revision;
      return {
        ok: true,
        value: {
          revisions,
          nextCursor:
            rows.length > limit && last
              ? encodeCursor({
                  createdAt: last.createdAt.toISOString(),
                  id: last.id,
                })
              : null,
        },
      };
    } catch {
      return safeTemporaryFailure();
    }
  }
}
