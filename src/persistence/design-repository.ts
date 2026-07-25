import type {
  DerivedProfileWingPrototype,
  LocalDesignRevision,
  ObstacleDesignRevision,
  ObstacleDraft,
  ProfileWingDesignRevision,
} from "@/domain/design";

import type { PersistenceResult } from "./result";

export const STARTER_DESIGN_ROUTE_KEY = "local-spj-04" as const;

export interface DesignRecord {
  readonly routeKey: typeof STARTER_DESIGN_ROUTE_KEY;
  readonly familyId: "spj-04-club-classic";
  readonly displayName: string;
  readonly draft: ObstacleDraft;
  readonly lockVersion: number;
  readonly updatedAt: string;
}

export interface DesignRevisionPage {
  readonly revisions: readonly LocalDesignRevision[];
  readonly nextCursor: string | null;
}

export interface SaveDesignDraftInput {
  readonly routeKey: typeof STARTER_DESIGN_ROUTE_KEY;
  readonly expectedLockVersion: number;
  readonly draft: ObstacleDraft;
}

export interface AppendStarterRevisionInput {
  readonly routeKey: typeof STARTER_DESIGN_ROUTE_KEY;
  readonly expectedLockVersion: number;
  readonly idempotencyKey: string;
  readonly name?: string;
  readonly referencedRenderableArtworkHashes: readonly string[];
}

export interface AppendFinalProfileWingRevisionInput {
  readonly idempotencyKey: string;
  readonly prototype: DerivedProfileWingPrototype;
  readonly name?: string;
  readonly canonicalRenderHash: string;
}

export interface DesignRepository {
  loadDesign(
    routeKey: typeof STARTER_DESIGN_ROUTE_KEY,
  ): Promise<PersistenceResult<DesignRecord>>;
  saveDraft(
    input: SaveDesignDraftInput,
  ): Promise<PersistenceResult<DesignRecord, DesignRecord>>;
  appendStarterRevision(input: AppendStarterRevisionInput): Promise<
    PersistenceResult<
      {
        readonly design: DesignRecord;
        readonly revision: ObstacleDesignRevision;
      },
      DesignRecord
    >
  >;
  appendFinalProfileWingRevision(
    input: AppendFinalProfileWingRevisionInput,
  ): Promise<PersistenceResult<ProfileWingDesignRevision>>;
  listRevisions(input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<PersistenceResult<DesignRevisionPage>>;
}
